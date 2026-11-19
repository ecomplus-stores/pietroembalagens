const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const babel = require('@babel/core')
const Vue = require('vue')
const compiler = require('vue-template-compiler')
const root = path.resolve(__dirname, '..')
const NOW = Date.parse('2026-11-02T12:00:00Z')
const PIMI = 'https://reviews.pietroembalagens.com.br/api/codex/avaliacoes-ml/resumo'
const review = (extra = {}) => ({ rating: 5, title: 'Excelente', text: 'Caixas lindas', date: '2026-09', pack: 20, ...extra })
const data = (extra = {}) => ({
  enabled: true,
  updated_at: '2026-11-02T06:00:00Z',
  items: { D_09_B_10: { rating: 4.9, total: 36, reviews: [review(), review({ rating: 2, text: 'Muito mole', date: '2026-03', pack: null })] } },
  ...extra
})

function transpile (file, source) {
  return babel.transformSync(source, { filename: file, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code
}
function load (file, globals = {}, mocks = {}) {
  const filename = path.join(root, file)
  const module = { exports: {} }
  const code = transpile(filename, fs.readFileSync(filename, 'utf8'))
  vm.runInNewContext(code, { module, exports: module.exports, require: id => mocks[id] || require(id), setTimeout, clearTimeout, URL, Date, ...globals }, { filename })
  return module.exports
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5))
const response = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) })
const routed = (config, calls, pimi = () => response(data())) => (url, options) => {
  calls.push({ url, options })
  return url.startsWith('/pe-ml-reviews.json') ? response(config) : pimi()
}

test('findMlReviews: product with 3+ reviews, nothing for others', () => {
  const { findMlReviews } = load('template/js/custom-js/ml-reviews.js')
  const found = findMlReviews(data(), 'D_09_B_10', NOW)
  assert.equal(found.total, 36)
  assert.equal(found.reviews.length, 2)
  assert.equal(found.reviews[1].rating, 2, 'nota baixa não é escondida')
  assert.equal(findMlReviews(data(), 'OUTRO', NOW), null)
  assert.equal(findMlReviews(data(), 'toString', NOW), null)
  assert.equal(findMlReviews(data(), '', NOW), null)
})

test('findMlReviews: off, stale, under 3 or broken shows nothing', () => {
  const { findMlReviews } = load('template/js/custom-js/ml-reviews.js')
  assert.equal(findMlReviews(data({ enabled: false }), 'D_09_B_10', NOW), null)
  assert.equal(findMlReviews(data({ updated_at: null }), 'D_09_B_10', NOW), null)
  assert.equal(findMlReviews(data({ updated_at: '2026-10-20T00:00:00Z' }), 'D_09_B_10', NOW), null)
  assert.equal(findMlReviews(data({ updated_at: '2026-10-25T00:00:00Z' }), 'D_09_B_10', NOW).total, 36)
  for (const total of [2, 0, '36', 3.5, null]) {
    assert.equal(findMlReviews(data({ items: { D_09_B_10: { rating: 5, total, reviews: [] } } }), 'D_09_B_10', NOW), null, String(total))
  }
  for (const rating of [0, 6, '5', null]) {
    assert.equal(findMlReviews(data({ items: { D_09_B_10: { rating, total: 9, reviews: [] } } }), 'D_09_B_10', NOW), null, String(rating))
  }
  const bad = findMlReviews(data({ items: { D_09_B_10: { rating: 5, total: 9, reviews: [review({ rating: 7 }), review({ text: '  ' }), review({ rating: 1.5 }), null] } } }), 'D_09_B_10', NOW)
  assert.deepEqual(bad.reviews, [])
  assert.equal(findMlReviews(null, 'D_09_B_10', NOW), null)
})

test('formatters', () => {
  const { formatRating, formatMonth } = load('template/js/custom-js/ml-reviews.js')
  assert.equal(formatRating(4.9), '4,9')
  assert.equal(formatRating(5), '5,0')
  assert.equal(formatMonth('2026-09'), 'set/2026')
  assert.equal(formatMonth('2026-13'), '')
  assert.equal(formatMonth(null), '')
})

test('loadMlReviews: off by default in the shipped file, never calls the PIMI', async () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(root, 'template/public/pe-ml-reviews.json'), 'utf8'))
  assert.equal(shipped.source, PIMI)
  assert.equal(typeof shipped.enabled, 'boolean')
  const calls = []
  const loaded = load('template/js/custom-js/ml-reviews.js', { fetch: routed({ ...shipped, enabled: false }, calls) })
  assert.equal(await loaded.loadMlReviews(), null)
  assert.equal(calls.length, 1)
})

test('loadMlReviews: switched on reads the PIMI without cookies, once', async () => {
  const calls = []
  const loaded = load('template/js/custom-js/ml-reviews.js', { fetch: routed({ enabled: true, source: PIMI }, calls) })
  const result = await loaded.loadMlReviews()
  await loaded.loadMlReviews()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].url, PIMI)
  assert.equal(calls[1].options.credentials, 'omit')
  assert.equal(loaded.findMlReviews(result, 'D_09_B_10', NOW).total, 36)
})

test('loadMlReviews: source outside the Pietro PIMI or PIMI down shows nothing', async () => {
  for (const source of ['https://evil.example/x', 'https://reviews.pietroembalagens.com.br.evil.example/x', 'http://reviews.pietroembalagens.com.br/x', 42]) {
    const calls = []
    const loaded = load('template/js/custom-js/ml-reviews.js', { fetch: routed({ enabled: true, source }, calls) })
    assert.equal(await loaded.loadMlReviews(), null)
    assert.equal(calls.length, 1, String(source))
  }
  const down = load('template/js/custom-js/ml-reviews.js', { fetch: routed({ enabled: true, source: PIMI }, [], () => Promise.reject(new Error('rede'))) })
  assert.equal(await down.loadMlReviews(), null)
})

function mount (props, fetchImpl) {
  const mlReviews = load('template/js/custom-js/ml-reviews.js', { fetch: fetchImpl })
  const file = path.join(root, 'template/js/custom-js/components/PeMlReviews.vue')
  const parsed = compiler.parseComponent(fs.readFileSync(file, 'utf8'))
  const script = transpile(file, parsed.script.content)
  const module = { exports: {} }
  vm.runInNewContext(script, { module, exports: module.exports, require: id => (id === '../ml-reviews' ? mlReviews : require(id)) }, { filename: file })
  const { render, staticRenderFns } = compiler.compileToFunctions(parsed.template.content)
  return new Vue({ ...module.exports.default, render, staticRenderFns, propsData: props })
}
// Sem DOM no Node: lê a árvore de vnodes que o componente renderiza.
const flat = node => node ? [node, ...(node.children || []).flatMap(flat)] : []
const textOf = node => flat(node).filter(n => n.text !== undefined && !n.tag).map(n => n.text).join(' ').replace(/\s+/g, ' ').trim()
const fresh = () => routed({ enabled: true, source: PIMI }, [], () => response(data({ updated_at: new Date().toISOString() })))

test('component: summary under the name and section with every review, no buyer name, no ML link', async () => {
  const summary = mount({ sku: 'D_09_B_10' }, fresh())
  await tick()
  const s = summary._render()
  assert.equal(s.tag, 'a')
  assert.equal(s.data.attrs.href, '#avaliacoes')
  assert.match(textOf(s), /4,9 36 avaliações$/)
  const section = mount({ sku: 'D_09_B_10', section: true }, fresh())
  await tick()
  const v = section._render()
  const text = textOf(v)
  assert.equal(v.data.attrs.id, 'avaliacoes')
  assert.match(text, /set\/2026 · Comprou: pacote com 20 · Compra verificada no Mercado Livre/)
  assert.match(text, /mar\/2026 · Compra verificada no Mercado Livre/)
  assert.match(text, /Muito mole/)
  assert.equal(flat(v).filter(n => n.tag === 'a').length, 0, 'sem link para o ML')
  assert.doesNotMatch(text, /Excelente/, 'título automático do ML fica de fora')
})

test('component: no data, nothing rendered', async () => {
  const other = mount({ sku: 'OUTRO', section: true }, fresh())
  await tick()
  assert.equal(other._render().tag, undefined)
  const down = mount({ sku: 'D_09_B_10' }, () => Promise.reject(new Error('rede')))
  await tick()
  assert.equal(down._render().tag, undefined)
})

test('only 4 reviews until "Ver mais avaliações"', async () => {
  const many = Array.from({ length: 7 }, (_, i) => review({ text: `t${i}` }))
  const vm2 = mount({ sku: 'D_09_B_10', section: true }, routed({ enabled: true, source: PIMI }, [], () => response(data({ updated_at: new Date().toISOString(), items: { D_09_B_10: { rating: 5, total: 7, reviews: many } } }))))
  await tick()
  const articles = () => flat(vm2._render()).filter(n => n.tag === 'article').length
  assert.equal(articles(), 4)
  assert.ok(flat(vm2._render()).some(n => n.tag === 'button'))
  vm2.expanded = true
  assert.equal(articles(), 7)
  assert.ok(!flat(vm2._render()).some(n => n.tag === 'button'))
})

test('wiring: summary in TheProduct, section after the description', () => {
  const html = fs.readFileSync(path.join(root, 'template/js/custom-js/html/TheProduct.html'), 'utf8')
  assert.ok(html.indexOf('<pe-ml-reviews') > html.indexOf('product__sku'))
  const ejs = fs.readFileSync(path.join(root, 'template/pages/@/sections/product-description.ejs'), 'utf8')
  assert.ok(ejs.includes('id="pe-ml-reviews"'))
  const pages = fs.readFileSync(path.join(root, 'template/js/custom-js/pages.js'), 'utf8')
  assert.ok(pages.includes("getElementById('pe-ml-reviews')"))
})

// Avaliações do site (aprovadas no PIMI), decisão do Rafael em 12/11: a partir de 1, sem nota no topo abaixo de 3.
const SITE = 'https://reviews.pietroembalagens.com.br/api/codex/reviews/public/'
const siteBody = (reviews) => ({ sku: 'BMG_08_B_TV_10', total: reviews.length, reviews })
const siteReview = (extra = {}) => ({ id: 49, rating: 5, comment: 'Embalagens impecáveis', responded_at: '2026-10-03T12:55:15+00:00', customer_first_name: 'Damona', ...extra })
const routedSite = (body, calls = [], mlData = data({ updated_at: new Date().toISOString() })) => (url, options) => {
  calls.push({ url, options })
  if (url.startsWith('/pe-ml-reviews.json')) return response({ enabled: true, source: PIMI })
  if (url.startsWith(SITE)) return typeof body === 'function' ? body() : response(body)
  return response(mlData)
}

test('loadSiteReviews: reads the PIMI without cookies, once per sku; failure is empty', async () => {
  const calls = []
  const loaded = load('template/js/custom-js/ml-reviews.js', { fetch: routedSite(siteBody([siteReview(), siteReview({ rating: 9 }), null]), calls) })
  const list = await loaded.loadSiteReviews('BMG_08_B_TV_10')
  await loaded.loadSiteReviews('BMG_08_B_TV_10')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, SITE + 'BMG_08_B_TV_10?limit=50')
  assert.equal(calls[0].options.credentials, 'omit')
  assert.deepEqual(JSON.parse(JSON.stringify(list)), [{ rating: 5, text: 'Embalagens impecáveis', date: '2026-10-03T12:55:15+00:00', source: 'site', photos: [] }])
  const withPhotos = load('template/js/custom-js/ml-reviews.js', { fetch: routedSite(siteBody([siteReview({ photos: ['49-AbCdEfGh_jKl-nOp.jpg', 'https://outro.site/x.jpg', '../segredo.jpg', 7] })])) })
  assert.deepEqual(JSON.parse(JSON.stringify((await withPhotos.loadSiteReviews('BMG_08_B_TV_10'))[0].photos)), [SITE + 'foto/49-AbCdEfGh_jKl-nOp.jpg'], 'só nome de arquivo do PIMI vira foto')
  const down = load('template/js/custom-js/ml-reviews.js', { fetch: routedSite(() => Promise.reject(new Error('rede'))) })
  assert.equal((await down.loadSiteReviews('X')).length, 0)
  assert.equal((await down.loadSiteReviews('')).length, 0)
})

test('combineReviews: site from 1, score only with 3+, weighted with ML', () => {
  const { combineReviews } = load('template/js/custom-js/ml-reviews.js')
  const s = (rating, text = 'ok', date = '2026-10-03') => ({ rating, text, date, source: 'site' })
  assert.equal(combineReviews(null, []), null)
  assert.equal(combineReviews(null, [s(5, '')]), null, 'sem texto nada aparece')
  assert.equal(combineReviews(null, [{ ...s(5, ''), photos: ['https://x/foto/1.jpg'] }]).reviews.length, 1, 'sem texto mas com foto vira cartão')
  const one = combineReviews(null, [s(5)])
  assert.equal(one.total, 1)
  assert.equal(one.showScore, false)
  assert.equal(combineReviews(null, [s(5), s(4), s(3, '')]).showScore, true)
  const mixed = combineReviews({ rating: 4.9, total: 36, reviews: [{ rating: 5, text: 'ml', date: '2026-09' }] }, [s(1, 'ruim', '2026-11-01')])
  assert.equal(mixed.total, 37)
  assert.equal(Math.round(mixed.rating * 100) / 100, 4.79)
  assert.equal(mixed.reviews[0].text, 'ruim', 'mais recente primeiro')
  assert.equal(mixed.hasMl && mixed.hasSite, true)
})

test('component: one site review shows only the section, no name, no score on top', async () => {
  const noMl = data({ updated_at: new Date().toISOString(), items: {} })
  const summary = mount({ sku: 'BMG_08_B_TV_10' }, routedSite(siteBody([siteReview()]), [], noMl))
  await tick()
  assert.equal(summary._render().tag, undefined, 'sem nota no topo com 1 avaliação')
  const section = mount({ sku: 'BMG_08_B_TV_10', section: true }, routedSite(siteBody([siteReview()]), [], noMl))
  await tick()
  const v = section._render()
  const text = textOf(v)
  assert.equal(v.data.attrs.id, 'avaliacoes')
  assert.match(text, /Avaliação de quem comprou no site/)
  assert.match(text, /Embalagens impecáveis out\/2026 · Compra verificada no site/)
  assert.doesNotMatch(text, /Damona/)
  assert.equal(flat(v).filter(n => n.data && n.data.staticClass === 'pe-ml-reviews__score').length, 0)
})

test('component: ML 3+ plus site says both origins', async () => {
  const section = mount({ sku: 'D_09_B_10', section: true }, routedSite({ reviews: [siteReview()] }))
  await tick()
  assert.match(textOf(section._render()), /37 avaliações de compras verificadas no site e no Mercado Livre/)
})
