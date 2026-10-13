const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const babel = require('@babel/core')
const Vue = require('vue')
const compiler = require('vue-template-compiler')
const root = path.resolve(__dirname, '..')
const NOW = Date.parse('2026-10-12T12:00:00Z')
const data = (extra = {}) => ({ enabled: true, updated_at: '2026-10-12T03:00:00Z', items: { D_04_B_10: { category: '04 brigadeiros', rank: 1 }, D_04_K_10: { category: '04 brigadeiros', rank: 3 } }, ...extra })

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

test('findBestSeller: only the published leader gets the label', () => {
  const { findBestSeller } = load('template/js/custom-js/best-sellers.js')
  assert.equal(findBestSeller(data(), 'D_04_B_10', NOW).category, '04 brigadeiros')
  assert.equal(findBestSeller(data(), 'D_04_K_10', NOW).rank, 3)
  assert.equal(findBestSeller(data(), 'OUTRO-SKU', NOW), null)
  assert.equal(findBestSeller(data(), 'toString', NOW), null)
  assert.equal(findBestSeller(data(), '', NOW), null)
})

test('findBestSeller: switched off, empty, stale or broken ranking shows nothing', () => {
  const { findBestSeller } = load('template/js/custom-js/best-sellers.js')
  assert.equal(findBestSeller(data({ enabled: false }), 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller(data({ enabled: undefined }), 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller(data({ items: {} }), 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller(data({ updated_at: null }), 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller(data({ updated_at: 'ontem' }), 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller(data({ updated_at: '2026-10-08T12:00:00Z' }), 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller(data({ updated_at: '2026-10-10T12:00:00Z' }), 'D_04_B_10', NOW).category, '04 brigadeiros')
  assert.equal(findBestSeller(data({ items: { D_04_B_10: { category: '', rank: 1 } } }), 'D_04_B_10', NOW), null)
  for (const rank of [undefined, 0, 6, 1.5, '1', null, -1]) {
    assert.equal(findBestSeller(data({ items: { D_04_B_10: { category: '04 brigadeiros', rank } } }), 'D_04_B_10', NOW), null)
  }
  assert.equal(findBestSeller(data({ items: { D_04_B_10: { category: '04 brigadeiros', rank: 5 } } }), 'D_04_B_10', NOW).rank, 5)
  assert.equal(findBestSeller(null, 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller('texto', 'D_04_B_10', NOW), null)
})

test('the file shipped in the repo has no ranking of its own and shows nothing by itself', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(root, 'template/public/pe-best-sellers.json'), 'utf8'))
  assert.deepEqual(shipped.items, {})
  const { findBestSeller } = load('template/js/custom-js/best-sellers.js')
  assert.equal(findBestSeller(shipped, 'D_04_B_10', NOW), null)
})

test('loadBestSellers: a failed request or a bad status resolves to null and is requested once', async () => {
  let calls = 0
  const failing = load('template/js/custom-js/best-sellers.js', { fetch: () => { calls++; return Promise.reject(new Error('rede')) } })
  assert.equal(await failing.loadBestSellers(), null)
  assert.equal(await failing.loadBestSellers(), null)
  assert.equal(calls, 1)
  const notFound = load('template/js/custom-js/best-sellers.js', { fetch: () => response({}, false) })
  assert.equal(await notFound.loadBestSellers(), null)
  const broken = load('template/js/custom-js/best-sellers.js', { fetch: () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('json')) }) })
  assert.equal(await broken.loadBestSellers(), null)
})

const PIMI = 'https://reviews.pietroembalagens.com.br/api/codex/mais-vendidos/ranking'
const ranking = () => ({ updated_at: new Date().toISOString(), window_days: 90, items: { D_04_B_10: { category: '04 brigadeiros', rank: 1 } } })
const routed = (config, calls, pimi = () => response(ranking())) => (url, options) => {
  calls.push({ url, options })
  return url.startsWith('/pe-best-sellers.json') ? response(config) : pimi()
}

test('loadBestSellers: switched on with a source reads the PIMI ranking, without cookies', async () => {
  const calls = []
  const loaded = load('template/js/custom-js/best-sellers.js', { fetch: routed({ enabled: true, source: PIMI, items: {} }, calls) })
  const result = await loaded.loadBestSellers()
  assert.equal(calls.length, 2)
  assert.equal(calls[1].url, PIMI)
  assert.equal(calls[1].options.credentials, 'omit')
  assert.equal(loaded.findBestSeller(result, 'D_04_B_10').category, '04 brigadeiros')
})

test('loadBestSellers: switched off never calls the PIMI', async () => {
  const calls = []
  const loaded = load('template/js/custom-js/best-sellers.js', { fetch: routed({ enabled: false, source: PIMI, items: {} }, calls) })
  assert.equal(loaded.findBestSeller(await loaded.loadBestSellers(), 'D_04_B_10'), null)
  assert.equal(calls.length, 1)
})

test('loadBestSellers: a source outside the Pietro PIMI is not fetched', async () => {
  for (const source of ['https://evil.example/ranking', 'https://reviews.pietroembalagens.com.br.evil.example/x', 'http://reviews.pietroembalagens.com.br/x', 42, null]) {
    const calls = []
    const loaded = load('template/js/custom-js/best-sellers.js', { fetch: routed({ enabled: true, source, items: {} }, calls) })
    assert.equal(await loaded.loadBestSellers(), null)
    assert.equal(calls.length, 1, String(source))
  }
})

test('loadBestSellers: PIMI down or broken means no label, never a stale file', async () => {
  const inline = { enabled: true, source: PIMI, updated_at: new Date().toISOString(), items: { D_04_B_10: { category: '04 brigadeiros', rank: 1 } } }
  const down = load('template/js/custom-js/best-sellers.js', { fetch: routed(inline, [], () => Promise.reject(new Error('rede'))) })
  assert.equal(await down.loadBestSellers(), null)
  const bad = load('template/js/custom-js/best-sellers.js', { fetch: routed(inline, [], () => response({}, false)) })
  assert.equal(await bad.loadBestSellers(), null)
})

test('the shipped file is switched on and points at the PIMI', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(root, 'template/public/pe-best-sellers.json'), 'utf8'))
  assert.equal(shipped.source, PIMI)
  assert.equal(shipped.enabled, true)
})

function mount (props, fetchImpl) {
  const bestSellers = load('template/js/custom-js/best-sellers.js', { fetch: fetchImpl })
  const file = path.join(root, 'template/js/custom-js/components/PeBestSeller.vue')
  const parsed = compiler.parseComponent(fs.readFileSync(file, 'utf8'))
  const script = transpile(file, parsed.script.content)
  const module = { exports: {} }
  vm.runInNewContext(script, { module, exports: module.exports, require: id => (id === '../best-sellers' ? bestSellers : require(id)) }, { filename: file })
  const { render, staticRenderFns } = compiler.compileToFunctions(parsed.template.content)
  const vm2 = new Vue({ ...module.exports.default, render, staticRenderFns, propsData: props })
  return vm2
}
const text = vm2 => { const node = vm2._render(); return node && node.children ? node.children.map(c => c.text).join('') : null }

test('component: label on the card and on the product page, nothing for other products', async () => {
  const fresh = () => response({ ...data(), updated_at: new Date().toISOString() })
  const card = mount({ sku: 'D_04_B_10' }, fresh)
  assert.equal(text(card), null)
  await tick()
  assert.equal(text(card), '1º mais vendido')
  const pdp = mount({ sku: 'D_04_B_10', withCategory: true }, fresh)
  await tick()
  assert.equal(text(pdp), '1º mais vendido em 04 brigadeiros')
  const third = mount({ sku: 'D_04_K_10' }, fresh)
  await tick()
  assert.equal(text(third), '3º mais vendido')
  const other = mount({ sku: 'OUTRO' }, fresh)
  await tick()
  assert.equal(text(other), null)
  const down = mount({ sku: 'D_04_B_10' }, () => Promise.reject(new Error('rede')))
  await tick()
  assert.equal(text(down), null)
})

test('card: a etiqueta fica antes das fotos (a biblioteca esconde foto que não é :last-child)', () => {
  const html = fs.readFileSync(path.join(root, 'template/js/custom-js/html/ProductCard.html'), 'utf8')
  const pictures = html.slice(html.indexOf('product-card__pictures'), html.indexOf('product-card__name'))
  assert.ok(pictures.includes('<pe-best-seller'))
  assert.ok(pictures.indexOf('<pe-best-seller') < pictures.indexOf('<a-picture'))
})
