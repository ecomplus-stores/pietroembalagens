const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const vm = require('node:vm')
const ejs = require('ejs')
const babel = require('@babel/core')
const root = path.resolve(__dirname, '..')
const sections = path.join(root, 'template/pages/@/sections')

// Ambiente mínimo de render: as peças reais (collection-shelf e group-items) + um products-carousel que só lista os SKUs
const views = fs.mkdtempSync(path.join(os.tmpdir(), 'grouped-sort-'))
fs.mkdirSync(path.join(views, '@/sections/inc'), { recursive: true })
fs.copyFileSync(path.join(sections, 'inc/group-items.ejs'), path.join(views, '@/sections/inc/group-items.ejs'))
fs.writeFileSync(path.join(views, '@/sections/inc/products-carousel.ejs'), "<%= (opt.items || []).map(item => item.sku).join(',') %>|shuffle=<%= opt.shuffle %>")
const render = (file, locals) => ejs.renderFile(path.join(sections, file), locals, { async: true, views: [views] })

const cat = (_id, name, parentId) => ({ _id, name, ...(parentId ? { parent: { _id: parentId } } : {}) })
const item = (sku, categories = [], keywords = []) => ({ _id: `id-${sku}`, sku, categories, keywords })
const skus = items => items.map(({ sku }) => sku)

// Categorias reais da loja (Caixas P/ Doces e seus filhos) e uma árvore de 3 níveis (Natal > Panetone)
const categories = [
  cat('doces', 'Caixas P/ Doces'),
  cat('visor', 'Tampa com Visor', 'doces'),
  cat('acetato', 'Linha tampa em acetato', 'doces'),
  cat('berco', 'Caixas com berço', 'doces'),
  cat('natal', 'Natal', 'datas'),
  cat('panetone', 'Caixas para Panetone', 'natal'),
  cat('datas', 'Datas especiais')
]
const C = Object.fromEntries(categories.map(category => [category._id, { _id: category._id, name: category.name }]))

const group = async (items, extra) => {
  await render('inc/group-items.ejs', { opt: { items, ...extra } })
  return skus(items)
}

test('subcategoria automática: grupos de A a Z, juntos, e quem não tem subcategoria vai para o fim', async () => {
  const items = [
    item('A1', [C.doces, C.visor]),
    item('B1', [C.doces, C.berco]),
    item('X1', [C.doces]), // sem subcategoria
    item('A2', [C.doces, C.visor]),
    item('C1', [C.doces, C.acetato]),
    item('B2', [C.doces, C.berco]),
    item('X2', [])
  ]
  // A-Z: "Caixas com berço", "Linha tampa em acetato", "Tampa com Visor"
  const result = await group(items, { mode: 'group_subcategory', parent_id: 'doces', categories })
  assert.deepEqual(result, ['B1', 'B2', 'C1', 'A1', 'A2', 'X1', 'X2'])
})

test('a ordem dentro do grupo é a que os itens já tinham (mais vendidos)', async () => {
  const items = [item('p3', [C.visor]), item('p1', [C.berco]), item('p2', [C.visor]), item('p4', [C.berco])]
  assert.deepEqual(await group(items, { mode: 'group_subcategory', parent_id: 'doces', categories }), ['p1', 'p4', 'p3', 'p2'])
})

test('subcategoria automática conta os descendentes (neto) como parte do grupo', async () => {
  const items = [item('N1', [C.panetone]), item('D1', [C.natal]), item('Z1', [C.datas])]
  const cats = [...categories, cat('dia', 'Dia dos Pais', 'datas')]
  // filhos de "Datas especiais": Dia dos Pais, Natal (A-Z); "Caixas para Panetone" é neto e cai em Natal
  const result = await group([...items, item('P1', [{ _id: 'dia', name: 'Dia dos Pais' }])], { mode: 'group_subcategory', parent_id: 'datas', categories: cats })
  assert.deepEqual(result, ['P1', 'N1', 'D1', 'Z1'])
})

test('lista do painel: ordem fixa, ignora acento e caixa, produto em dois grupos fica no primeiro da lista', async () => {
  const items = [
    item('caixa', [{ _id: 'x1', name: 'Caixas' }]),
    item('sacola', [{ _id: 'x2', name: 'Sacolas' }]),
    item('pote', [{ _id: 'x3', name: 'Potes' }]),
    item('dois', [{ _id: 'x1', name: 'Caixas' }, { _id: 'x2', name: 'Sacolas' }]),
    item('sacola2', [{ _id: 'x2', name: 'Sacolas' }]),
    item('sem', [])
  ]
  const result = await group(items, { mode: 'group_subcategory', group_order: ['  sacolas ', 'CAIXAS', 'Potes'] })
  assert.deepEqual(result, ['sacola', 'dois', 'sacola2', 'caixa', 'pote', 'sem'])
})

test('lista do painel vale também com acentos nos dois lados', async () => {
  const items = [item('a', [{ _id: 'x', name: 'Caixas com berço' }]), item('b', [{ _id: 'y', name: 'Outra' }])]
  assert.deepEqual(await group(items, { mode: 'group_subcategory', group_order: ['Outra', 'Caixas com berco'] }), ['b', 'a'])
})

test('tag: usa as palavras-chave do produto, na ordem da lista', async () => {
  const items = [item('k1', [], ['Natal', 'kraft']), item('b1', [], ['branca']), item('k2', [], ['kraft']), item('n', [], []), item('b2', [], ['Branca', 'natal'])]
  assert.deepEqual(await group(items, { mode: 'group_tag', group_order: ['kraft', 'branca'] }), ['k1', 'k2', 'b1', 'b2', 'n'])
})

test('tag sem lista, subcategoria sem categoria-pai e sem lista: não mexe na ordem', async () => {
  const make = () => [item('b', [C.visor], ['x']), item('a', [C.berco], ['y'])]
  assert.deepEqual(await group(make(), { mode: 'group_tag' }), ['b', 'a'])
  assert.deepEqual(await group(make(), { mode: 'group_subcategory', categories }), ['b', 'a'])
  assert.deepEqual(await group(make(), { mode: 'group_subcategory', group_order: [], parent_id: 'sem-filhos', categories }), ['b', 'a'])
})

test('nenhum produto é perdido nem repetido, mesmo com dado incompleto', async () => {
  const items = [{ sku: 'sem-campos' }, item('a', null, null), item('b', [C.visor]), { sku: 'c', categories: [{ name: 'Tampa com Visor' }] }]
  const before = skus(items).sort()
  const result = await group(items, { mode: 'group_subcategory', group_order: ['Tampa com Visor'] })
  assert.deepEqual([...result].sort(), before)
  assert.deepEqual(result.slice(0, 2), ['b', 'c'])
})

// ---- Estante (collection-shelf.ejs) ----
function fakeSearch (products, calls) {
  return function EcomSearch () {
    const self = this
    const log = { }
    calls.push(log)
    self.setCategoryIds = ids => { log.categoryIds = ids; return self }
    self.setProductIds = ids => { log.productIds = ids; return self }
    self.setSortOrder = sort => { log.sort = sort; return self }
    self.setPageSize = size => { log.size = size; return self }
    self.setPageNumber = page => { log.page = page; return self }
    self.fetch = async () => {
      log.fetched = true
      self.result = products.slice(0, log.size || 24)
    }
    self.getItems = () => self.result.slice()
    self.getTotalCount = () => products.length
  }
}
const shelf = async (opt, products, extra = {}) => {
  const calls = []
  const html = await render('collection-shelf.ejs', {
    opt,
    _: { EcomSearch: fakeSearch(products, calls), categories, items: products, ecomClient: {} },
    ...extra
  })
  return { html: html.replace(/<[^>]*>/g, '').trim(), calls: calls[0] }
}
const fiveGroups = () => [
  item('b1', [C.berco]), item('v1', [C.visor]), item('a1', [C.acetato]), item('b2', [C.berco]), item('v2', [C.visor]), item('a2', [C.acetato]), item('sem', [])
]

test('estante agrupada: busca por mais vendidos com folga, agrupa e só então corta o limite', async () => {
  const { html, calls } = await shelf({ sort: 'group_subcategory', collection_id: 'doces:categories:Caixas P/ Doces:/caixas', limit: 4 }, fiveGroups())
  assert.equal(calls.sort, 'sales')
  assert.equal(calls.size, 100)
  assert.deepEqual(calls.categoryIds, ['doces'])
  // A-Z: berço, acetato, visor; limite 4 → 2 do berço e 2 do acetato
  assert.match(html, /^b1,b2,a1,a2\|/)
})

test('estante agrupada: paginação da estante pula itens já agrupados e embaralhar é ignorado', async () => {
  const { html } = await shelf({ sort: 'group_subcategory', collection_id: 'doces:categories:Caixas P/ Doces:/caixas', limit: 3, page: 2, shuffle: true }, fiveGroups())
  assert.match(html, /^a2,v1,v2\|shuffle=false$/)
})

test('estante agrupada por tag com lista do painel, sem categoria (todos os produtos)', async () => {
  const products = [item('k', [], ['kraft']), item('b', [], ['branca']), item('k2', [], ['kraft'])]
  const { html, calls } = await shelf({ sort: 'group_tag', group_order: ['branca', 'kraft'], limit: 12 }, products)
  assert.equal(calls.sort, 'sales')
  assert.match(html, /^b,k,k2\|/)
})

test('ordenações atuais seguem iguais: mesmo pedido de busca e mesma ordem', async () => {
  for (const sort of ['sales', 'news', 'views', 'offers', 'lowest_price', 'highest_price', 'slug']) {
    const { html, calls } = await shelf({ sort, collection_id: 'doces:categories:Caixas P/ Doces:/caixas', limit: 5 }, fiveGroups())
    assert.equal(calls.sort, sort)
    assert.equal(calls.size, 5)
    assert.match(html, /^b1,v1,a1,b2,v2\|/)
  }
})

// ---- Painel (CMS) ----
const plain = value => JSON.parse(JSON.stringify(value)) // objetos do vm têm outro Array: normaliza antes de comparar
function loadSections () {
  const file = path.join(root, 'template/js/cms/sections.js')
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code
  const base = [
    { name: 'responsive-banner', fields: [{ name: 'img' }] },
    { name: 'collection-shelf', fields: [{ name: 'collection_id' }, { name: 'sort', options: [{ value: 'views' }, { value: 'sales' }] }, { name: 'shuffle' }] },
    { name: 'dynamic-showcase', fields: [{ name: 'sort', options: [{ value: 'views' }] }] }
  ]
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: () => ({ __esModule: true, default: () => base }), console }, { filename: file })
  return { exports: module.exports, base }
}

test('painel: a Estante ganha as duas opções novas e a lista de grupos; as antigas ficam', () => {
  const { exports: sectionsModule } = loadSections()
  const list = plain(sectionsModule.default({ state: { routes: [] } }))
  const shelf = list.find(({ name }) => name === 'collection-shelf')
  const sortField = shelf.fields.find(({ name }) => name === 'sort')
  assert.deepEqual(sortField.options.map(({ value }) => value), ['views', 'sales', 'group_subcategory', 'group_tag'])
  assert.deepEqual(shelf.fields.map(({ name }) => name), ['collection_id', 'sort', 'group_order', 'shuffle'])
  const groupOrder = shelf.fields.find(({ name }) => name === 'group_order')
  assert.equal(groupOrder.widget, 'list')
  assert.equal(groupOrder.required, false)
  // outras seções não ganham opção que não sabem executar
  const showcase = list.find(({ name }) => name === 'dynamic-showcase')
  assert.deepEqual(showcase.fields[0].options.map(({ value }) => value), ['views'])
})

test('painel: aplicar duas vezes não duplica nada e não altera o original', () => {
  const { exports: sectionsModule, base } = loadSections()
  const once = sectionsModule.withGroupedSort(base[1])
  const twice = sectionsModule.withGroupedSort(once)
  assert.equal(twice, once)
  assert.equal(base[1].fields.length, 3)
  assert.equal(base[1].fields[1].options.length, 2)
  assert.equal(sectionsModule.withGroupedSort(base[0]), base[0])
})

// ---- Página da categoria: critério de ordenação pronto para o servidor de busca ----
const catTree = [
  cat('doces', 'Caixas P/ Doces'),
  cat('visor', 'Tampa com Visor', 'doces'),
  cat('berco', 'Caixas com "berço"', 'doces'),
  cat('berco-gde', 'Berço grande', 'berco'),
  cat('natal-doces', 'Caixa para Doces', 'natal'),
  cat('natal', 'Natal'),
  cat('sozinha', 'Sacolas')
]
const groupSort = async parentId => {
  const opt = { parent_id: parentId, categories: catTree }
  await render('inc/group-sort.ejs', { opt })
  return opt.entry
}
const mapOf = entry => { // lê o "Map m = [...]" do script: nome -> posição do grupo
  const literal = /Map m = \[(.*?)\]; def n/.exec(entry._script.script.source)[1]
  return JSON.parse(`{${literal}}`)
}

test('categoria: critério com um grupo por subcategoria (A a Z), netas no grupo da filha e nome com aspas escapado', async () => {
  fs.copyFileSync(path.join(sections, 'inc/group-sort.ejs'), path.join(views, '@/sections/inc/group-sort.ejs'))
  const entry = await groupSort('doces')
  assert.equal(entry._script.type, 'number')
  assert.equal(entry._script.order, 'asc')
  assert.equal(entry._script.script.lang, 'painless')
  assert.match(entry._script.script.source, /doc\['categories\.name'\]/)
  assert.match(entry._script.script.source, /int best = 2;/) // 2 grupos: sem grupo = 2, vai para o fim
  // A-Z: 'Caixas com "berço"' (0) vem antes de 'Tampa com Visor' (1); 'Berço grande' é neta e cai no grupo 0
  assert.deepEqual(mapOf(entry), { 'Caixas com "berço"': 0, 'Berço grande': 0, 'Tampa com Visor': 1 })
})

test('categoria sem subcategorias, sem pai ou sem lista de categorias: nenhum critério (fica em mais vendidos)', async () => {
  assert.equal(await groupSort('sozinha'), null)
  assert.equal(await groupSort(undefined), null)
  const opt = { parent_id: 'doces' }
  await render('inc/group-sort.ejs', { opt })
  assert.equal(opt.entry, null)
})

test('categoria: nome repetido em dois grupos fica no primeiro; nome de produto sem grupo não entra no mapa', async () => {
  const cats = [cat('p', 'Pai'), cat('a', 'Alfa', 'p'), cat('b', 'Beta', 'p'), cat('b1', 'Alfa', 'b')]
  const opt = { parent_id: 'p', categories: cats }
  await render('inc/group-sort.ejs', { opt })
  assert.deepEqual(mapOf(opt.entry), { Alfa: 0, Beta: 1 })
})

function fakeCategorySearch (calls, { rejectScript = false } = {}) {
  return function EcomSearch () {
    const self = this
    const log = { sorts: [], fetched: [] }
    calls.push(log)
    self.dsl = { sort: ['base'] }
    self.setCategoryNames = names => { log.names = names; return self }
    self.setSortOrder = sort => { log.sorts.push(sort); self.dsl.sort = ['in_stock', sort]; return self }
    self.fetch = async () => {
      log.fetched.push(self.dsl.sort.slice())
      if (rejectScript && self.dsl.sort.some(entry => entry && entry._script)) {
        const err = new Error('Request failed with status code 400')
        err.response = { status: 400 }
        throw err
      }
    }
    self.getItems = () => [{ sku: 'p1' }]
  }
}
const categoryPage = async (opt, { rejectScript, state = { _id: 'doces', name: 'Caixas P/ Doces' } } = {}) => {
  fs.writeFileSync(path.join(views, '@/sections/inc/retail-grid.ejs'), "[sort=<%= opt.sort %>|group=<%= opt.group_sort ? 'sim' : 'nao' %>|items=<%= (opt.items || []).length %>]")
  const calls = []
  const html = await render('category-retail.ejs', { opt, _: { EcomSearch: fakeCategorySearch(calls, { rejectScript }), state, categories: catTree } })
  return { html: html.replace(/<[^>]*>/g, '').trim(), calls: calls[0] }
}

test('página da categoria agrupada: busca por mais vendidos com o critério na frente e entrega o critério ao navegador', async () => {
  const { html, calls } = await categoryPage({ sort: 'group_subcategory' })
  assert.equal(html, '[sort=group_subcategory|group=sim|items=1]')
  assert.deepEqual(calls.sorts, ['sales'])
  assert.ok(calls.fetched[0][0]._script, 'critério agrupado vem primeiro')
  assert.deepEqual(calls.fetched[0].slice(1), ['in_stock', 'sales'])
})

test('página da categoria agrupada sem subcategorias: mais vendidos, sem critério', async () => {
  const { html, calls } = await categoryPage({ sort: 'group_subcategory' }, { state: { _id: 'sozinha', name: 'Sacolas' } })
  assert.equal(html, '[sort=sales|group=nao|items=1]')
  assert.deepEqual(calls.fetched, [['in_stock', 'sales']])
})

test('página da categoria agrupada: se o servidor de busca recusar o critério, volta para mais vendidos e a página abre', async () => {
  const origError = console.error
  console.error = () => {}
  try {
    const { html, calls } = await categoryPage({ sort: 'group_subcategory' }, { rejectScript: true })
    assert.equal(html, '[sort=sales|group=nao|items=1]')
    assert.equal(calls.fetched.length, 2)
    assert.deepEqual(calls.fetched[1], ['in_stock', 'sales'])
  } finally {
    console.error = origError
  }
})

test('página da categoria: as ordenações atuais seguem iguais (mesma chamada, nenhum critério)', async () => {
  for (const sort of ['news', 'sales', 'views', 'lowest_price', 'highest_price', 'slug']) {
    const { html, calls } = await categoryPage({ sort })
    assert.equal(html, `[sort=${sort}|group=nao|items=1]`)
    assert.deepEqual(calls.sorts, [sort])
    assert.deepEqual(calls.fetched, [['in_stock', sort]])
  }
})

test('painel: a lista da categoria ganha a opção agrupada e as outras seções ficam como estão', () => {
  const { exports: sectionsModule } = loadSections()
  const retail = {
    name: 'category-retail',
    fields: [{ name: 'enabled' }, { name: 'sort', default: 'sales', options: [{ value: 'views' }, { value: 'sales' }] }]
  }
  const once = sectionsModule.withGroupedSort(retail)
  assert.deepEqual(plain(once.fields[1].options).map(({ value }) => value), ['views', 'sales', 'group_subcategory'])
  assert.equal(once.fields[1].default, 'sales')
  assert.equal(sectionsModule.withGroupedSort(once), once)
  assert.equal(retail.fields[1].options.length, 2)
})

// ---- Navegador: SearchEngine (lista da categoria) ----
function loadSearchEngine (groupSortAttr) {
  const file = path.join(root, 'template/js/custom-js/js/SearchEngine.js')
  const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code
  const searches = []
  const FakeSearch = function () {
    const self = this
    const log = { sorts: [], fetched: [], reject: false }
    searches.push(log)
    self.log = log
    self.history = []
    self.result = {}
    self.dsl = { sort: [] }
    self.reset = () => { self.dsl = { sort: ['in_stock'] }; return self }
    self.setSortOrder = sort => { log.sorts.push(sort); self.dsl.sort = ['in_stock', sort]; return self }
    self.setPageSize = () => self
    self.setPageNumber = () => self
    self.setSearchTerm = () => self
    self.setCategoryNames = () => self
    self.setBrandNames = () => self
    self.mergeFilter = () => self
    self.setSpec = () => self
    self.fetch = async () => {
      log.fetched.push(self.dsl.sort.slice())
      if (log.reject && self.dsl.sort.some(entry => entry && entry._script)) {
        const err = new Error('400')
        err.response = { status: 400 }
        throw err
      }
    }
    self.getItems = () => [{ _id: '1', sku: 'p1' }]
    self.getTotalCount = () => 1
    self.getBrands = () => []
    self.getCategories = () => []
    self.getSpecs = () => []
    self.getTermSuggestions = () => []
  }
  const i18nStrings = new Proxy({}, { get: (_, key) => String(key) })
  const mocks = {
    '@ecomplus/i18n': i18nStrings,
    '@ecomplus/utils': { i18n: value => value },
    lozad: { __esModule: true, default: () => ({ observe () {} }) },
    '@ecomplus/search-engine': { __esModule: true, default: FakeSearch },
    '@linusborg/vue-simple-portal': { Portal: {} },
    '@ecomplus/storefront-components/src/ABackdrop.vue': { __esModule: true, default: {} },
    '@ecomplus/storefront-components/src/ProductCard.vue': { __esModule: true, default: {} },
    '@ecomplus/storefront-twbs': { isMobile: false, isScreenLg: true }
  }
  const document = { getElementById: () => ({ dataset: groupSortAttr === undefined ? {} : { groupSort: groupSortAttr } }) }
  const module = { exports: {} }
  vm.runInNewContext(code, { module, exports: module.exports, require: id => mocks[id], document, console, setTimeout, Date, URLSearchParams }, { filename: file })
  return { options: module.exports.default, searches }
}
const ENTRY = { _script: { type: 'number', script: { lang: 'painless', source: "Map m = [\"A\":0]; def n = doc['categories.name']; int best = 1; return best;" }, order: 'asc' } }
const mount = (groupSortAttr, propsData) => {
  const { options, searches } = loadSearchEngine(groupSortAttr)
  const vm = new Vue({ ...options, propsData, render: h => h('div') })
  return { vm, searches, log: searches[0] }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 80))
const Vue = require('vue')
Vue.config.productionTip = false
Vue.config.devtools = false

test('navegador: com o critério no endereço da página, entra na frente de mais vendidos e a opção aparece no seletor', async () => {
  const { vm, log } = mount(JSON.stringify(ENTRY), { defaultSort: 'group_subcategory' })
  await settle()
  assert.deepEqual(log.sorts, ['sales'])
  assert.deepEqual(plain(log.fetched[0]).slice(1), ['in_stock', 'sales'])
  assert.deepEqual(plain(log.fetched[0][0]), plain(ENTRY))
  assert.equal(vm.hasGroupSort, true)
  assert.equal(vm.selectedSortOption, 'group_subcategory')
  const values = plain(vm.sortOptions.map(({ value }) => value))
  assert.deepEqual(values, ['group_subcategory', null, 'sales', 'lowest_price', 'highest_price', 'news', 'slug'])
  assert.equal(vm.resultItems.length, 1)
  assert.equal(vm.hasNetworkError, false)
})

test('navegador: se o servidor de busca recusar o critério, tenta de novo em mais vendidos e a lista aparece', async () => {
  const { options, searches } = loadSearchEngine(JSON.stringify(ENTRY))
  // marca a busca para recusar antes do primeiro pedido
  const Original = options.created
  options.created = function () { this.ecomSearch.log.reject = true; Original.call(this) }
  const origError = console.error
  console.error = () => {}
  try {
    const vm = new Vue({ ...options, propsData: { defaultSort: 'group_subcategory' }, render: h => h('div') })
    await settle()
    const log = searches[0]
    assert.equal(log.fetched.length, 2)
    assert.equal(log.fetched[1].some(entry => entry && entry._script), false)
    assert.equal(vm.hasGroupSort, false)
    assert.equal(vm.hasNetworkError, false)
    assert.equal(vm.resultItems.length, 1)
  } finally {
    console.error = origError
  }
})

test('navegador: escolher outra ordenação sai do agrupamento e voltar a ele recoloca o critério', async () => {
  const { vm, log } = mount(JSON.stringify(ENTRY), { defaultSort: 'group_subcategory' })
  await settle()
  vm.setSortOrder('lowest_price')
  await settle()
  assert.equal(vm.ecomSearch.dsl.sort.some(entry => entry && entry._script), false)
  assert.equal(vm.selectedSortOption, 'lowest_price')
  vm.setSortOrder('group_subcategory')
  await settle()
  assert.ok(vm.ecomSearch.dsl.sort[0]._script)
  assert.equal(vm.selectedSortOption, 'group_subcategory')
  assert.ok(log.fetched.length >= 3)
})

test('navegador: busca nova ou filtro mantém o agrupamento', async () => {
  const { vm, log } = mount(JSON.stringify(ENTRY), { defaultSort: 'group_subcategory' })
  await settle()
  vm.resetAndFetch()
  await settle()
  const last = log.fetched[log.fetched.length - 1]
  assert.ok(last[0]._script, 'a busca refeita continua agrupada')
})

test('navegador: sem critério no endereço, ou com outra ordenação padrão, nada muda', async () => {
  for (const [attr, defaultSort, expectedSorts] of [[undefined, 'group_subcategory', ['sales']], [JSON.stringify(ENTRY), 'news', ['news']], [undefined, undefined, []]]) {
    const { vm, log } = mount(attr, { defaultSort })
    await settle()
    assert.deepEqual(log.sorts, expectedSorts)
    assert.equal(log.fetched[0].some(entry => entry && entry._script), false)
    assert.equal(vm.hasGroupSort, false)
    assert.deepEqual(plain(vm.sortOptions.map(({ value }) => value)), [null, 'sales', 'lowest_price', 'highest_price', 'news', 'slug'])
  }
})

test('navegador: critério quebrado no endereço é ignorado', async () => {
  const origError = console.error
  console.error = () => {}
  try {
    for (const attr of ['{nao-e-json', '{"x":1}']) {
      const { vm, log } = mount(attr, { defaultSort: 'group_subcategory' })
      await settle()
      assert.equal(vm.hasGroupSort, false)
      assert.equal(log.fetched[0].some(entry => entry && entry._script), false)
    }
  } finally {
    console.error = origError
  }
})
