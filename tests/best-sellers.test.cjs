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
const data = (extra = {}) => ({ enabled: true, updated_at: '2026-10-12T03:00:00Z', items: { D_04_B_10: { category: '04 brigadeiros' } }, ...extra })

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
  assert.equal(findBestSeller(data({ items: { D_04_B_10: { category: '' } } }), 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller(null, 'D_04_B_10', NOW), null)
  assert.equal(findBestSeller('texto', 'D_04_B_10', NOW), null)
})

test('the file shipped in the repo is switched off and empty', () => {
  const shipped = JSON.parse(fs.readFileSync(path.join(root, 'template/public/pe-best-sellers.json'), 'utf8'))
  assert.equal(shipped.enabled, false)
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
  const other = mount({ sku: 'OUTRO' }, fresh)
  await tick()
  assert.equal(text(other), null)
  const down = mount({ sku: 'D_04_B_10' }, () => Promise.reject(new Error('rede')))
  await tick()
  assert.equal(text(down), null)
})
