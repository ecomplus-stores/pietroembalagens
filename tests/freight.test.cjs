const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const babel = require('@babel/core')
const Vue = require('vue')
const root = path.resolve(__dirname, '..')
const core = load('template/js/custom-js/freight/core.js').default
const cartLibrary = require('@ecomplus/shopping-cart')
const tick = ms => new Promise(resolve => setTimeout(resolve, ms))
const product = (extra = {}) => ({ _id: 'a'.repeat(24), sku: 'PACK5', name: 'Pacote com 5 caixas', slug: 'caixas', available: true, visible: true, price: 33.9, quantity: 30, ...extra })
const service = (code, total, extra = {}) => ({ service_code: code, app_id: 1, label: code, shipping_line: { price: total, total_price: total, delivery_time: { days: 5 } }, ...extra })
const results = services => [{ validated: true, app_id: 1, response: { free_shipping_from_value: 299, shipping_services: services } }]

function load (file, mocks = {}, globals = {}) {
  const filename = path.join(root, file)
  let source = fs.readFileSync(filename, 'utf8')
  if (file.endsWith('.vue')) source = require('vue-template-compiler').parseComponent(source).script.content
  const code = babel.transformSync(source, { filename, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code
  const module = { exports: {} }
  const localRequire = id => {
    if (id in mocks) return mocks[id]
    if (id === './core' || id === '../freight/core') return { __esModule: true, default: core }
    if (id.endsWith('.vue')) return {}
    if (id.startsWith('.')) return require(path.resolve(path.dirname(filename), id))
    return require(id)
  }
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, setTimeout, clearTimeout, console, ...globals }, { filename })
  return module.exports
}

test('money: one-cent shortfall and decimal subtotals stay exact', () => {
  assert.equal(core.cents(298.99), 29899)
  assert.equal(29900 - core.cents(298.99), 1)
  assert.equal(core.subtotal([{ price: 0.1, quantity: 3 }, { price: 0.2, quantity: 1 }]), 50)
  assert.equal(core.subtotal([{ price: 30, final_price: 0, quantity: 2 }]), 0)
})
test('zero base price with a positive final charge is not free delivery', () => {
  assert.equal(core.isFreeDelivery(service('paid', 10, { shipping_line: { price: 0, total_price: 10 } })), false)
})
test('pickup and unknown costs never count as free shipping', () => {
  assert.equal(core.isFreeDelivery(service('Retirada na loja', 0)), false)
  assert.equal(core.isFreeDelivery(service('X', 0, { pickup: true })), false)
  assert.equal(core.isFreeDelivery({ label: 'Grátis', shipping_line: {} }), false)
  for (const unknown of [null, '', false]) assert.equal(core.isFreeDelivery(service('PAC', unknown)), false)
  assert.equal(core.isFreeDelivery(service('PAC', 0)), true)
})
test('invalid app response and skipped app cannot promise a threshold', () => {
  assert.equal(core.parseQuote([{ validated: false, response: { free_shipping_from_value: 1 } }]).threshold, null)
  assert.equal(core.parseQuote(results([service('PAC', 0)]), [1]).free, null)
  assert.equal(core.parseQuote([{ validated: true, response: {} }]).services.length, 0)
})
test('explicit express choice survives sorting, free availability and recalculation', () => {
  const express = service('Sedex', 20)
  const free = service('PAC', 0)
  assert.equal(core.chooseService([free, express], core.serviceKey(express)), 1)
  assert.equal(core.chooseService([express, free], core.serviceKey(express)), 0)
})
test('automatic choice locates the actual free service, never a list position', () => {
  assert.equal(core.chooseService([service('Sedex', 20), service('PAC', 0)], ''), 1)
  assert.equal(core.chooseService([service('PAC', 0), service('Sedex', 20)], ''), 0)
})
test('vanished explicit service or disabled autoselection requires a new choice', () => {
  assert.equal(core.chooseService([service('PAC', 0)], 'missing'), -1)
  assert.equal(core.chooseService([service('PAC', 0)], '', false), -1)
})
test('same-product quantities solve the gap within minimum and available stock', () => {
  assert.equal(core.quantityFor(1100, 600, 1, 10), 2)
  assert.equal(core.quantityFor(1100, 600, 1, 1), 1)
  assert.equal(core.quantityFor(1100, 600, 2, 1), 0)
})
test('variation must be explicit and in stock; kits and customized products are excluded', () => {
  const p = product({ variations: [{ _id: 'v', quantity: 4 }] })
  assert.equal(core.canRecommend(p), false)
  assert.equal(core.canRecommend(p, 'v'), true)
  assert.equal(core.canRecommend(product({ quantity: 0 })), false)
  assert.equal(core.canRecommend(product({ kit_composition: [{}] })), false)
  assert.equal(core.canRecommend(product({ customizations: [{}] })), false)
})
test('fingerprints change with CEP, variation, coupon context, dimensions or price', () => {
  const item = { product_id: 'a', quantity: 1, price: 10 }
  const key = core.fingerprint([item], '01310-100')
  assert.equal(key, core.fingerprint([item], '01310100'))
  for (const next of [{ ...item, quantity: 2 }, { ...item, variation_id: 'v' }, { ...item, dimensions: { width: 5 } }, { ...item, final_price: 9 }]) assert.notEqual(key, core.fingerprint([next], '01310100'))
  assert.notEqual(key, core.fingerprint([item], '40020000'))
  assert.notEqual(key, core.fingerprint([item], '01310100', { coupon: 'TEST' }))
})

const runtime = { config: { maxAdditionalQuantity: 5 }, enabled: true, ready: true }
const serviceModule = load('template/js/custom-js/freight/service.js', { './runtime': { runtime } })
function cartWith (p, quantity) {
  const cart = new cartLibrary.Constructor(51395, null, null)
  cart.addProduct(p, undefined, quantity, false)
  return cart
}
test('real native cart simulation does not mutate cart or emit shopper events', () => {
  const p = product()
  const cart = cartWith(p, 8)
  const before = JSON.stringify(cart.data)
  let events = 0
  cart.on('change', () => events++)
  const candidate = serviceModule.prepare({ id: p._id, key: 'a', relation: 'same' }, p, cart.data, { threshold: 29900, subtotal: 27120 })
  assert.equal(candidate.quantity, 1)
  assert.equal(candidate.additional, 3390)
  assert.equal(candidate.nextSubtotal, 30510)
  assert.equal(candidate.items[0].quantity, 9)
  assert.equal(JSON.stringify(cart.data), before)
  assert.equal(events, 0)
})
test('native simulation and actual addition have identical subtotal and quantity', () => {
  const p = product({ price: 6 })
  const cart = cartWith(p, 2)
  const candidate = serviceModule.prepare({ id: p._id, key: 'a' }, p, cart.data, { threshold: 2300, subtotal: 1200 })
  assert.equal(candidate.quantity, 2)
  cart.addItem(candidate.parsed, false)
  assert.equal(core.subtotal(cart.data.items), candidate.nextSubtotal)
  assert.equal(cart.data.items[0].quantity, 4)
})
test('aggregate existing stock, stale price and freebie lines cannot slip through', () => {
  const p = product({ quantity: 8 })
  const cart = cartWith(p, 8)
  const quote = { threshold: 29900, subtotal: 27120 }
  assert.equal(serviceModule.prepare({ id: p._id }, p, cart.data, quote), null)
  assert.equal(serviceModule.prepare({ id: p._id }, product({ price: 40 }), cart.data, quote), null)
  cart.data.items[0].flags = ['freebie']
  assert.equal(serviceModule.prepare({ id: p._id }, product(), cart.data, quote), null)
})

test('all custom Vue templates compile without errors', () => {
  const compiler = require('vue-template-compiler')
  for (const file of ['TheCart.html', 'CartQuickview.html', 'ShippingCalculator.html']) {
    const template = fs.readFileSync(path.join(root, 'template/js/custom-js/html', file), 'utf8')
    assert.deepEqual(compiler.compile(template).errors, [], file)
  }
  for (const file of ['FreightStatus.vue', 'FreightSuggestions.vue']) {
    const body = compiler.parseComponent(fs.readFileSync(path.join(root, 'template/js/custom-js/components', file), 'utf8'))
    assert.deepEqual(compiler.compile(body.template.content).errors, [], file)
  }
})

test('calculator ignores stale requests after CEP change and preserves explicit shipping', async () => {
  const calls = []
  const preferences = new Map()
  const component = load('template/js/custom-js/js/ShippingCalculator.js', {
    '../freight/runtime': { runtime, enabled: () => true, init: () => {}, getPreference: z => preferences.get(z), setPreference: (z, key) => preferences.set(z, key) },
    '@ecomplus/client': { modules: request => new Promise(resolve => calls.push({ request, resolve })) },
    '@ecomplus/storefront-components/src/js/helpers/sort-apps': list => list,
    'vue-cleave-component': {}
  }, { window: { localStorage: { getItem: () => null, setItem: () => {} } } }).default
  const cart = cartWith(product(), 1)
  const instance = new Vue({ ...component, propsData: { shippedItems: cart.data.items, zipCode: '01310100', canSelectServices: true } })
  await tick(90)
  assert.equal(calls.length, 1)
  instance.localZipCode = '40020000'
  await Vue.nextTick()
  await tick(90)
  assert.equal(calls.length, 2)
  calls[1].resolve({ data: { result: results([service('BA', 25)]) } })
  await tick(5)
  calls[0].resolve({ data: { result: results([service('SP', 0)]) } })
  await tick(5)
  assert.equal(instance.shippingServices[0].service_code, 'BA')
  assert.equal(instance.peSnapshot.zip, '40020000')
  instance.setSelectedService(0)
  instance.parseShippingOptions(results([service('Free BA', 0), service('BA', 25)]))
  assert.equal(instance.shippingServices[instance.selectedService].service_code, 'BA')
  instance.localZipCode = '123'
  await Vue.nextTick()
  assert.equal(instance.peSnapshot.status, 'idle')
  assert.equal(instance.shippingServices.length, 0)
  instance.$destroy()
})


test('configuration failure disables feature and a later refresh restores it', async () => {
  let ok = true
  const storage = { getItem: () => '10', setItem: () => {} }
  const module = load('template/js/custom-js/freight/runtime.js', {}, {
    window: { localStorage: storage, sessionStorage: storage }, AbortController,
    fetch: async () => { if (!ok) throw new Error('offline'); return { ok: true, json: async () => ({ enabled: true, rolloutPercent: 100 }) } }
  })
  await module.refreshConfig()
  assert.equal(module.enabled(), true)
  ok = false
  await module.refreshConfig()
  assert.equal(module.enabled(), false)
  ok = true
  await module.refreshConfig()
  assert.equal(module.enabled(), true)
})

test('rapid double click adds only once; changed price refuses addition', async () => {
  const p = product()
  const cart = cartWith(p, 8)
  const quote = { key: 'current', zip: '01310100', status: 'ready', threshold: 29900, subtotal: 27120, services: [] }
  const candidate = serviceModule.prepare({ id: p._id, key: 'own', relation: 'same' }, p, cart.data, quote)
  let release
  let requests = 0
  let changed = false
  const lock = Vue.observable({ busy: false, enabled: true })
  const component = load('template/js/custom-js/components/FreightSuggestions.vue', {
    '@ecomplus/shopping-cart': { __esModule: true, default: cart },
    '../freight/runtime': { runtime: lock, enabled: () => true, track: () => {}, init: () => {} },
    '../freight/service': {
      recommendations: async () => [],
      fetchProduct: () => { requests++; return new Promise(resolve => { release = resolve }) },
      prepare: () => changed ? null : candidate,
      simulate: async value => value
    }
  }).default
  const instance = new (Vue.extend(component))({ propsData: { quote } })
  const first = instance.add(candidate)
  await instance.add(candidate)
  assert.equal(requests, 1)
  release(p)
  await first
  assert.equal(cart.data.items[0].quantity, 9)
  assert.equal(lock.busy, false)
  changed = true
  const second = instance.add(candidate)
  release(p)
  await second
  assert.equal(cart.data.items[0].quantity, 9)
  assert.match(instance.message, /condições foram atualizadas/)
  instance.$destroy()
})
