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
