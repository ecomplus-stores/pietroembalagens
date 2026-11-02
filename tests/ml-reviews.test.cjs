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
