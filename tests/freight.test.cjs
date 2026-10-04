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
    if (id.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), id)
      // Template sources are ES modules; CI runs Node 20, so transpile them instead of require()-ing them.
      if (resolved.startsWith(path.join(root, 'template') + path.sep)) return load(path.relative(root, resolved.endsWith('.js') ? resolved : resolved + '.js'), mocks, globals)
      return require(resolved)
    }
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
test('posting deadline is two working days only for JeT Standard and Loggi Express', () => {
  const quoted = (carrier, name) => service(name, 10, {
    carrier,
    service_name: name,
    shipping_line: {
      price: 10,
      total_price: 10,
      delivery_time: { days: 4, working_days: true },
      posting_deadline: { days: 1, working_days: true, after_approval: true }
    }
  })
  const rawJet = quoted('JeT', 'Standard')
  const parsed = core.parseQuote(results([
    rawJet,
    quoted('Loggi', 'Loggi Express'),
    quoted('Loggi', 'Loggi Ponto'),
    quoted('Correios', 'Sedex')
  ])).services
  const deadline = name => parsed.find(item => item.service_name === name).shipping_line.posting_deadline.days
  assert.equal(deadline('Standard'), 2)
  assert.equal(deadline('Loggi Express'), 2)
  assert.equal(deadline('Loggi Ponto'), 1)
  assert.equal(deadline('Sedex'), 1)
  assert.equal(rawJet.shipping_line.posting_deadline.days, 1)
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
    '../freight/runtime': { runtime, enabled: () => true, uiVersion: () => 'v1', autoSelectFree: () => false, readAutoSelect: () => null, clearAutoSelect: () => {}, init: () => {}, getPreference: z => preferences.get(z), setPreference: (z, key) => preferences.set(z, key) },
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
  const events = []
  const component = load('template/js/custom-js/components/FreightSuggestions.vue', {
    '@ecomplus/shopping-cart': { __esModule: true, default: cart },
    '../freight/runtime': { runtime: lock, enabled: () => true, uiVersion: () => 'v1', autoSelectFree: () => false, markAutoSelect: () => {}, track: (event, data) => events.push({ event, data }), init: () => {}, readSuggestions: () => null, saveSuggestions: () => {} },
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
  assert.equal(events.filter(e => e.event === 'pe_freight_suggestion_click').length, 1)
  assert.equal(events[0].data.pe_freight_surface, 'cart')
  assert.equal(events[0].data.pe_freight_action, 'add')
  release(p)
  await first
  assert.equal(cart.data.items[0].quantity, 9)
  assert.equal(lock.busy, false)
  assert.equal(events.filter(e => e.event === 'pe_freight_suggestion_add').length, 1)
  changed = true
  const second = instance.add(candidate)
  release(p)
  await second
  assert.equal(cart.data.items[0].quantity, 9)
  assert.match(instance.message, /condições foram atualizadas/)
  assert.equal(events.filter(e => e.event === 'pe_freight_suggestion_click').length, 2)
  assert.equal(events.filter(e => e.event === 'pe_freight_suggestion_add').length, 1)
  instance.compact = true
  instance.trackClick(candidate, 'name')
  instance.trackClick(candidate, 'image')
  assert.equal(events.at(-1).data.pe_freight_surface, 'minicart')
  assert.equal(events.at(-1).data.pe_freight_action, 'image')
  assert.equal(events.at(-2).data.pe_freight_action, 'name')
  instance.$destroy()
})


test('analytics clears previous item context and never calls GA4 twice', () => {
  const layer = []
  const storage = { getItem: () => '10', setItem: () => {} }
  const module = load('template/js/custom-js/freight/runtime.js', {}, {
    window: { localStorage: storage, dataLayer: layer, gtag: () => { throw new Error('Use GTM only') } }
  })
  module.track('pe_freight_suggestion_click', { pe_freight_surface: 'cart', pe_freight_action: 'image', pe_freight_product_id: 'product', items: [{ item_id: 'product' }] })
  module.track('pe_freight_applied', { value: 299, currency: 'BRL' })
  assert.equal(layer.length, 2)
  assert.equal(layer[0].event, 'pe_freight_suggestion_click')
  assert.equal(layer[0].ecommerce.items[0].item_id, 'product')
  assert.equal(layer[1].pe_freight_surface, null)
  assert.equal(layer[1].pe_freight_product_id, null)
  assert.equal(layer[1].items, null)
  assert.equal(layer[1].ecommerce.items.length, 0)
})

const graphsRow = id => ({ results: [{ columns: ['id'], data: [{ row: [id], meta: [null] }] }] })
test('catalog shares one in-flight request per product; only fresh reads bypass the edge cache', async () => {
  const requests = []
  const svc = load('template/js/custom-js/freight/service.js', {
    './runtime': { runtime },
    '@ecomplus/client': { store: request => { requests.push(request); return Promise.resolve({ data: product() }) }, graphs: () => Promise.resolve({ data: {} }), modules: () => Promise.resolve({ data: { result: [] } }) }
  })
  const id = 'a'.repeat(24)
  await Promise.all([svc.fetchProduct(id), svc.fetchProduct(id)])
  assert.equal(requests.length, 1)
  assert.equal(requests[0].axiosConfig.params.pe_fresh, undefined)
  await svc.fetchProduct(id, true)
  assert.equal(requests.length, 2)
  assert.ok(requests[1].axiosConfig.params.pe_fresh > 0)
})

test('cart line is shown before related products resolve; shipping confirmations arrive afterwards', async () => {
  const own = product()
  const relatedId = 'b'.repeat(24)
  const related = product({ _id: relatedId, sku: 'REL', name: 'Caixa relacionada', price: 300 })
  let releaseRelated
  const shipping = []
  const svc = load('template/js/custom-js/freight/service.js', {
    './runtime': { runtime },
    '@ecomplus/client': {
      store: ({ url }) => url.includes(relatedId) ? new Promise(resolve => { releaseRelated = () => resolve({ data: related }) }) : Promise.resolve({ data: own }),
      graphs: () => Promise.resolve({ data: graphsRow(relatedId) }),
      modules: request => { shipping.push(request); return Promise.resolve({ data: { result: results([service('Free', 0, { shipping_line: { price: 0, total_price: 0, delivery_time: { days: 3 } } })]) } }) }
    }
  })
  const cart = cartWith(own, 8)
  const quote = { key: 'k', zip: '01310100', status: 'ready', threshold: 29900, subtotal: 27120, services: [], request: {}, skipIds: [] }
  const updates = []
  const done = svc.recommendations(cart.data, quote, () => true, list => updates.push([...list.map(c => c.key + (c.confirmed ? '!' : ''))]))
  await tick(20)
  assert.deepEqual(updates[0], [own._id + ':'])
  assert.ok(releaseRelated, 'related product is being fetched while the cart line is already shown')
  releaseRelated()
  const final = await done
  assert.deepEqual([...final.map(c => c.key)].sort(), [own._id + ':', relatedId + ':'])
  assert.ok(final.every(c => c.confirmed && c.free.shipping_line.delivery_time.days === 3))
  assert.equal(shipping.length, 2)
  assert.deepEqual(updates.at(-1), [...final.map(c => c.key + '!')])
})

test('stored suggestions render before the quote settles and are saved slim after loading', async () => {
  const p = product()
  const cart = cartWith(p, 8)
  const full = serviceModule.prepare({ id: p._id, key: 'own', relation: 'same' }, p, cart.data, { threshold: 29900, subtotal: 27120 })
  const entry = { key: 'k', threshold: 29900, at: Date.now(), candidates: [{ ...full, product: undefined, parsed: undefined, items: undefined, confirmed: true, free: { shipping_line: { delivery_time: { days: 3 } } } }] }
  let stored = null
  let computed = 0
  const component = load('template/js/custom-js/components/FreightSuggestions.vue', {
    '@ecomplus/shopping-cart': { __esModule: true, default: cart },
    '../freight/runtime': { runtime: Vue.observable({ busy: false, enabled: true }), enabled: () => true, uiVersion: () => 'v1', autoSelectFree: () => false, markAutoSelect: () => {}, track: () => {}, init: () => {}, readSuggestions: key => (stored || entry).key === key ? (stored || entry) : null, saveSuggestions: value => { stored = value } },
    '../freight/service': { recommendations: async () => { computed++; return [full] }, fetchProduct: async () => p, prepare: () => full, simulate: async value => value }
  }).default
  const loading = { key: 'k', zip: '01310100', status: 'loading', threshold: null, subtotal: 27120, services: [] }
  const instance = new (Vue.extend(component))({ propsData: { quote: loading } })
  assert.equal(instance.visible, true)
  assert.equal(instance.gap, 2780)
  assert.equal(instance.progress, 90)
  assert.equal(instance.displayed[0].confirmed, true)
  assert.equal(computed, 0)
  instance.quote = { ...loading, status: 'ready', threshold: 29900 }
  await Vue.nextTick()
  await tick(80)
  assert.equal(computed, 0, 'same cart, CEP and threshold: nothing to recompute')
  assert.equal(instance.visible, true)
  instance.quote = { ...loading, key: 'k2', status: 'ready', threshold: 29900 }
  await Vue.nextTick()
  await tick(80)
  assert.equal(computed, 1)
  assert.equal(stored.key, 'k2')
  assert.equal(stored.threshold, 29900)
  assert.equal(stored.candidates.length, 1)
  for (const heavy of ['product', 'parsed', 'items']) assert.equal(stored.candidates[0][heavy], undefined)
  assert.equal(stored.candidates[0].quantity, 1)
  instance.$destroy()
})

test('uiVersion is v2 only for ui "v2" with the feature on; everything else falls back to v1', async () => {
  const storage = bucket => ({ getItem: () => String(bucket), setItem: () => {} })
  const versionFor = async (config, { bucket = 10, fail = false, kill = false } = {}) => {
    const s = storage(bucket)
    const module = load('template/js/custom-js/freight/runtime.js', {}, {
      window: { localStorage: s, sessionStorage: s, peFreightSuggestionsEnabled: kill ? false : undefined }, AbortController,
      fetch: async () => { if (fail) throw new Error('offline'); return { ok: true, json: async () => { if (config === 'bad') throw new Error('json'); return config } } }
    })
    await module.refreshConfig()
    return module.uiVersion()
  }
  assert.equal(await versionFor({ enabled: true, ui: 'v2' }), 'v2')
  assert.equal(await versionFor({ enabled: true, ui: 'v1' }), 'v1')
  assert.equal(await versionFor({ enabled: true }), 'v1')
  assert.equal(await versionFor({ enabled: true, ui: 'V2' }), 'v1')
  assert.equal(await versionFor({ enabled: true, ui: 'v3' }), 'v1')
  assert.equal(await versionFor({ enabled: false, ui: 'v2' }), 'v1')
  assert.equal(await versionFor({ enabled: true, ui: 'v2', rolloutPercent: 50 }, { bucket: 80 }), 'v1')
  assert.equal(await versionFor({ enabled: true, ui: 'v2' }, { fail: true }), 'v1')
  assert.equal(await versionFor('bad'), 'v1')
  assert.equal(await versionFor({ enabled: true, ui: 'v2' }, { kill: true }), 'v1')
})

test('delivery text sums posting, transport and production like the native line; calendar days keep plain wording', () => {
  const nodeWindow = extra => ({ window: extra })
  const withScript = () => {
    // The real head script, with a fixed clock: Saturday 03/10/2026.
    const head = require(path.join(root, 'content/code.json')).html_head
    const script = head.match(/<script>([\s\S]*?)<\/script>/)[1]
    const RealDate = Date
    class FixedDate extends RealDate { constructor (...args) { super(...(args.length ? args : ['2026-10-03T15:00:00Z'])) } }
    const window = { addEventListener () {} }
    const document = { readyState: 'loading', addEventListener () {}, createTreeWalker: () => ({ nextNode: () => null }), querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, body: {} }
    vm.runInNewContext(script, { window, document, Date: FixedDate, NodeFilter: { SHOW_TEXT: 4 }, MutationObserver: function () { this.observe = () => {} }, location: { hash: '' }, sessionStorage: {}, setTimeout, clearTimeout, console })
    return window.peDeliveryDate
  }
  const shared = withScript()
  assert.equal(shared.textoData(6), 'Chega até 13/10 (ter)')
  assert.equal(shared.textoData(2), 'Chega até 06/10 (ter)')
  const mod = load('template/js/custom-js/freight/delivery-date.js', {}, nodeWindow({ peDeliveryDate: shared }))
  assert.equal(mod.deliveryText({ delivery_time: { days: 6, working_days: true } }), 'Chega até 13/10 (ter)')
  // posting 2 + transport 4 + production 0 must equal 6 working days, not 4.
  assert.equal(mod.deliveryText({ posting_deadline: { days: 2, working_days: true }, delivery_time: { days: 4, working_days: true } }), 'Chega até 13/10 (ter)')
  assert.equal(mod.deliveryText({ delivery_time: { days: 4, working_days: true } }, 2), 'Chega até 13/10 (ter)')
  assert.equal(mod.deliveryText({ delivery_time: { days: 3, working_days: false } }), 'Até 3 dias')
  assert.equal(mod.deliveryText({ delivery_time: { days: 1, working_days: false } }), 'Até 1 dia')
  assert.equal(mod.deliveryText({}), '')
  assert.equal(mod.deliveryText({ delivery_time: { days: 0, working_days: true } }), '')
  const bare = load('template/js/custom-js/freight/delivery-date.js', {}, nodeWindow({}))
  assert.equal(bare.deliveryText({ delivery_time: { days: 6, working_days: true } }), '6 dias úteis')
  assert.equal(bare.deliveryText({ delivery_time: { days: 1, working_days: true } }), '1 dia útil')
  assert.equal(mod.productionDays([{ quantity: 2, production_time: { days: 3, cumulative: true } }, { quantity: 1, production_time: { days: 2 } }]), 6)
})

test('v2 suggestions: sorted by increase, effect text by rule, marker only for a confirmed add with the flag on', async () => {
  const p = product()
  const cart = cartWith(p, 8)
  const quote = { key: 'q', zip: '05141000', status: 'ready', threshold: 29900, subtotal: 27120, services: [service('PAC', 29.9), service('Sedex', 45.34)], selected: service('PAC', 29.9) }
  const marks = []
  const flags = { auto: false }
  const runtimeState = Vue.observable({ busy: false, enabled: true })
  const make = candidatesList => {
    const component = load('template/js/custom-js/components/FreightSuggestions.vue', {
      '@ecomplus/shopping-cart': { __esModule: true, default: cart },
      '@ecomplus/utils': { formatMoney: value => 'R$ ' + value.toFixed(2).replace('.', ',') },
      '../freight/runtime': { runtime: runtimeState, enabled: () => true, uiVersion: () => 'v2', autoSelectFree: () => flags.auto, markAutoSelect: key => marks.push(key), track: () => {}, init: () => {}, readSuggestions: () => null, saveSuggestions: () => {} },
      '../freight/service': { recommendations: async () => [], fetchProduct: async () => p, prepare: (d, pr, c, q, quantity) => candidatesList.find(x => x.quantity === quantity), simulate: async v => v }
    }).default
    return new (Vue.extend(component))({ propsData: { quote, compact: true } })
  }
  const a = { key: 'a', id: p._id, title: 'A', quantity: 3, additional: 2970, remaining: 0, confirmed: true, free: { shipping_line: { delivery_time: { days: 6, working_days: true } } }, parsed: { ...cart.data.items[0] } }
  const b = { key: 'b', id: p._id, title: 'B', quantity: 2, additional: 2780, remaining: 0, confirmed: true, free: { shipping_line: { delivery_time: { days: 6, working_days: true } } }, parsed: { ...cart.data.items[0] } }
  const c = { key: 'c', id: p._id, title: 'C', quantity: 1, additional: 3390, remaining: 0, confirmed: true, free: null, parsed: { ...cart.data.items[0] } }
  const d = { key: 'd', id: p._id, title: 'D', quantity: 1, additional: 1000, remaining: 500, confirmed: false }
  const e = { key: 'e', id: p._id, title: 'E', quantity: 1, additional: 2780, remaining: 0, confirmed: false }
  const instance = make([a, b, c])
  instance.candidates = [a, c, b]
  assert.deepEqual(instance.displayed.map(x => x.key), ['a', 'c'], 'the ranking picks who is shown; v2 then orders that slice by increase')
  instance.compact = false
  assert.deepEqual(instance.displayed.map(x => x.key), ['b', 'a', 'c'])
  assert.equal(instance.effectText(b), 'Custa menos que o frete de R$ 29,90')
  assert.equal(instance.effectText(c), 'Só R$ 4,00 a mais que o frete, e o produto fica com você')
  assert.equal(instance.effectText(d), 'Ainda faltarão R$ 5,00 depois de adicionar.')
  instance.loading = false
  assert.equal(instance.effectText(e), 'Atinge o mínimo do frete grátis')
  instance.loading = true
  assert.equal(instance.effectText(e), 'Atinge o mínimo do frete grátis · conferindo a entrega…')
  instance.quote = { ...quote, selected: null }
  assert.equal(instance.freightReference, 2990, 'no selection: cheapest paid service')
  assert.equal(instance.deliveryFor(c), '', 'no confirmed free line, no delivery line')
  instance.$destroy()

  // marker: flag off → none; flag on + confirmed add → one, keyed by the cart after the addition
  const real = serviceModule.prepare({ id: p._id, key: 'own', relation: 'same' }, p, cart.data, quote)
  const confirmed = { ...real, confirmed: true, free: { shipping_line: { delivery_time: { days: 6, working_days: true } } } }
  const addFlow = make([confirmed])
  addFlow.quote = { ...quote, key: 'q' }
  await addFlow.add(confirmed)
  assert.equal(marks.length, 0, 'flag off: no marker')
  flags.auto = true
  await addFlow.add(confirmed)
  assert.equal(marks.length, 1)
  assert.equal(marks[0], core.fingerprint(cart.data.items, '05141000'))
  addFlow.$destroy()
})

test('calculator v2 branch needs peSurface AND ui v2; autoSelectFree is gated, one-shot and loses to a manual choice', async () => {
  const preferences = new Map()
  const flags = Vue.observable({ ui: 'v2', auto: true, mark: null, cleared: 0 })
  const runtimeMock = {
    runtime, enabled: () => true, uiVersion: () => flags.ui, autoSelectFree: () => flags.auto && flags.ui === 'v2', init: () => {},
    readAutoSelect: () => flags.mark, clearAutoSelect: () => { flags.mark = null; flags.cleared++ },
    getPreference: z => preferences.get(z) || '', setPreference: (z, key) => preferences.set(z, key)
  }
  const build = propsData => {
    const component = load('template/js/custom-js/js/ShippingCalculator.js', {
      '../freight/runtime': runtimeMock,
      '@ecomplus/client': { modules: () => new Promise(() => {}) },
      '@ecomplus/storefront-components/src/js/helpers/sort-apps': list => list,
      'vue-cleave-component': {},
      '@ecomplus/utils': { $ecomConfig: { get: () => 'BR' }, i18n: v => v.pt_br || v, price: item => item.price, formatMoney: v => 'R$ ' + v.toFixed(2).replace('.', ',') }
    }, { window: { localStorage: { getItem: () => null, setItem: () => {} }, peDeliveryDate: { textoData: n => 'Chega até em ' + n } } }).default
    const cart = cartWith(product(), 8)
    return { cart, instance: new Vue({ ...component, propsData: { shippedItems: cart.data.items, zipCode: '05141000', canSelectServices: true, ...propsData } }) }
  }
  const pac = service('PAC', 29.9)
  const free = service('FREE', 0)
  const minicart = build({ peSurface: 'minicart' })
  const plain = build({})
  const checkout = build({ peSurface: undefined })
  assert.equal(minicart.instance.peV2, true)
  assert.equal(plain.instance.peV2, false, 'no surface (PDP, checkout): v1')
  assert.equal(checkout.instance.peShowForm, true)
  flags.ui = 'v1'
  assert.equal(minicart.instance.peV2, false, 'ui v1 turns the branch off even with a surface')
  flags.ui = 'v2'
  // states
  assert.equal(minicart.instance.peShowForm, false, 'minicart v2 hides the native zip form until "alterar"')
  minicart.instance.peEditing = true
  assert.equal(minicart.instance.peShowForm, true)
  minicart.instance.peEditing = false
  // auto selection: an earlier explicit PAC choice, then a confirmed suggestion add leaves a hint for this cart+CEP
  const key = () => core.fingerprint(minicart.cart.data.items, '05141000')
  const pacKey = core.serviceKey(pac)
  preferences.set('05141000', pacKey)
  minicart.instance.parseShippingOptions(results([pac, free]))
  assert.equal(minicart.instance.shippingServices[minicart.instance.selectedService].service_code, 'PAC', 'no hint: the explicit choice is kept')
  flags.mark = { key: key(), at: Date.now() }
  minicart.instance.parseShippingOptions(results([pac, free]))
  assert.equal(minicart.instance.shippingServices[minicart.instance.selectedService].service_code, 'FREE', 'hint + free service: free is taken')
  assert.equal(preferences.get('05141000'), '', 'the old explicit paid choice no longer pins')
  assert.equal(flags.mark, null, 'used up: the hint is deleted once applied')
  assert.equal(minicart.instance.peAutoAt > 0, true)
  // one-shot per calculator: a manual choice afterwards wins and discards the hint
  minicart.instance.setSelectedService(minicart.instance.shippingServices.findIndex(item => item.service_code === 'PAC'))
  assert.equal(flags.mark, null)
  assert.equal(minicart.instance.shippingServices[minicart.instance.selectedService].service_code, 'PAC')
  minicart.instance.parseShippingOptions(results([pac, free]))
  assert.equal(minicart.instance.shippingServices[minicart.instance.selectedService].service_code, 'PAC', 'manual choice survives later recalculation')
  // no free service: the hint stays, nothing changes
  preferences.set('05141000', pacKey)
  flags.mark = { key: key(), at: 5 }
  minicart.instance.parseShippingOptions(results([pac]))
  assert.equal(flags.mark.at, 5)
  assert.equal(preferences.get('05141000'), pacKey, 'paid choice untouched when there is nothing free to take')
  // different cart: hint discarded
  flags.mark = { key: 'outro carrinho', at: 6 }
  minicart.instance.parseShippingOptions(results([pac, free]))
  assert.equal(flags.mark, null)
  // flag off, v1 UI, or no surface: never auto-selects
  for (const [label, setup, target] of [['flag off', () => { flags.auto = false }, minicart], ['ui v1', () => { flags.ui = 'v1' }, minicart], ['no surface', () => {}, plain]]) {
    flags.auto = true; flags.ui = 'v2'
    setup()
    preferences.set('05141000', pacKey)
    flags.mark = { key: core.fingerprint(target.cart.data.items, '05141000'), at: 7 }
    target.instance.parseShippingOptions(results([pac, free]))
    assert.equal(target.instance.shippingServices[target.instance.selectedService].service_code, 'PAC', label)
  }
  // minicart lists up to three services (the selected one always among them) and says how many more exist
  flags.mark = null
  const many = ['A', 'B', 'C', 'D', 'E'].map((code, n) => service(code, 10 + n))
  minicart.instance.isWaiting = false
  minicart.instance.shippingServices = many
  minicart.instance.selectedService = 0
  assert.equal(minicart.instance.peOptionsList, true)
  assert.deepEqual(minicart.instance.peVisibleOptions.map(o => o.index), [0, 1, 2])
  assert.equal(minicart.instance.peMore, 2)
  minicart.instance.selectedService = 4
  assert.deepEqual(minicart.instance.peVisibleOptions.map(o => o.index), [0, 1, 4])
  minicart.instance.peExpanded = true
  assert.equal(minicart.instance.peVisibleOptions.length, 5, 'the button expands the list in place')
  assert.equal(minicart.instance.peMore, 2, 'the button label still counts the hidden ones')
  minicart.instance.peExpanded = false
  minicart.instance.shippingServices = [many[0]]
  minicart.instance.selectedService = 0
  assert.equal(minicart.instance.peCompactLine, true)
  assert.equal(minicart.instance.peOptionsList, false, 'a single service keeps the one-line summary')
  for (const entry of [minicart, plain, checkout]) entry.instance.$destroy()
})

test('topo v2: chave em header.json, templates EJS compilam e o markup v1 não ganha classes da v2', async () => {
  const ejs = require('ejs')
  const header = JSON.parse(fs.readFileSync(path.join(root, 'content/header.json'), 'utf8'))
  const v2 = header.pe_header_v2
  assert.ok(v2 && typeof v2.enabled === 'boolean', 'pe_header_v2.enabled precisa existir')
  // A chave pode estar ligada ou desligada (liga/desliga é decisão de publicação): aqui só se exige que exista.
  assert.ok(Array.isArray(v2.benefits) && v2.benefits.length === 3)
  assert.ok(Array.isArray(v2.stories) && v2.stories.length === 9)
  assert.match(v2.seasonal.link, /^\/caixas-tema-natal$/)
  assert.ok(Array.isArray(v2.promos) && v2.promos.length >= 2 && v2.promos.every(promo => promo.title && promo.short), 'promos precisam de title e short')
  assert.ok(v2.promos.some(promo => promo.link === '/pages/politica-de-frete-gratis'))
  for (const file of ['layout/inc/header-v2.ejs', 'layout/header.ejs', 'sections/info-bar.ejs', 'sections/categories-carousel.ejs', 'sections/banner-slider.ejs']) {
    const source = fs.readFileSync(path.join(root, 'template/pages/@', file), 'utf8')
    assert.doesNotThrow(() => ejs.compile(source, { async: true, filename: file }), file)
  }
  // Os ramos v1 não podem conter classes da v2: ela só nasce dentro do ramo ligado.
  const headerV1 = fs.readFileSync(path.join(root, 'template/pages/@/layout/header.ejs'), 'utf8').split('<%_ } else { _%>')[1]
  assert.doesNotMatch(headerV1, /pe-h2/)
  // Todo o CSS da v2 fica sob .pe-h2.
  const css = fs.readFileSync(path.join(root, 'template/scss/custom-css/_header-v2.scss'), 'utf8')
  const topLevel = css.replace(/\/\/.*$/gm, '').match(/^[.#][^{]*\{/gm) || []
  assert.ok(topLevel.length > 0 && topLevel.every(selector => /\.pe-h2/.test(selector)), 'seletor fora de .pe-h2: ' + topLevel.filter(s => !/\.pe-h2/.test(s)).join(', '))
})

// ---- Quadros personalizados da home (docs/QUADROS-PERSONALIZADOS.md) ----
const boxes = load('template/js/custom-js/personalized-boxes/core.js')
const memoryStorage = (initial = {}) => {
  const data = { ...initial }
  return { data, getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value) } }
}
const plain = value => JSON.parse(JSON.stringify(value))
const hex = n => String(n).padStart(24, 'a')

test('quadros: vistos recentes ficam no começo, sem repetir, até 12', () => {
  const storage = memoryStorage()
  for (let i = 1; i <= 14; i++) boxes.addViewed(storage, hex(i))
  boxes.addViewed(storage, hex(5))
  const list = plain(boxes.readViewed(storage))
  assert.equal(list.length, 12)
  assert.equal(list[0], hex(5))
  assert.equal(new Set(list).size, 12)
  assert.equal(list.includes(hex(1)), false)
})
test('quadros: id inválido, JSON quebrado e storage que falha não derrubam nada', () => {
  const storage = memoryStorage({ 'pe-boxes-viewed': '{quebrado' })
  assert.deepEqual(plain(boxes.readViewed(storage)), [])
  boxes.addViewed(storage, 'nao-e-um-id')
  boxes.addViewed(storage, '')
  assert.equal(storage.data['pe-boxes-viewed'], '{quebrado')
  const lixo = memoryStorage({ 'pe-boxes-viewed': JSON.stringify([hex(1), 'x', hex(1), 7, hex(2)]) })
  assert.deepEqual(plain(boxes.readViewed(lixo)), [hex(1), hex(2)])
  const quebrado = { getItem () { throw new Error('bloqueado') }, setItem () { throw new Error('bloqueado') } }
  assert.deepEqual(plain(boxes.readViewed(quebrado)), [])
  assert.doesNotThrow(() => { boxes.addViewed(quebrado, hex(1)); boxes.saveTerm(quebrado, 'caixa'); boxes.readTerm(quebrado) })
  assert.doesNotThrow(() => { boxes.readViewed(null); boxes.saveTerm(null, 'caixa') })
})
test('quadros: o termo buscado é limpo, curto demais é ignorado e o último vale', () => {
  const storage = memoryStorage()
  boxes.saveTerm(storage, '  caixa   para   bolo  ')
  assert.equal(boxes.readTerm(storage), 'caixa para bolo')
  boxes.saveTerm(storage, 'a')
  boxes.saveTerm(storage, null)
  assert.equal(boxes.readTerm(storage), 'caixa para bolo')
  boxes.saveTerm(storage, 'x'.repeat(200))
  assert.equal(boxes.readTerm(storage).length, 80)
})
test('quadros: um produto por quadro, sem repetir entre quadros e só os exibíveis', () => {
  const item = (id, ok = true) => ({ _id: hex(id), ok })
  const showable = it => it.ok
  const composed = boxes.composeBoxes([
    { key: 'viewed', title: 'Visto recentemente', items: [item(1, false), item(2)] },
    { key: 'search', title: 'Sua busca', items: [item(2), item(3)] },
    { key: 'related', title: 'Também te interessa', items: [] },
    { key: 'sales', title: 'Mais vendidos', items: [item(2), item(3), item(4)] }
  ], showable)
  assert.deepEqual(plain(composed.map(box => [box.key, box.item._id])), [['viewed', hex(2)], ['search', hex(3)], ['sales', hex(4)]])
})
test('quadros: nunca passa do máximo e devolve vazio quando não há nada exibível', () => {
  const many = Array.from({ length: 10 }, (_, i) => ({ key: 'k' + i, title: 't', items: [{ _id: hex(i + 1) }] }))
  assert.equal(boxes.composeBoxes(many, () => true).length, boxes.MAX_BOXES)
  assert.equal(boxes.composeBoxes(many, () => true, 2).length, 2)
  assert.deepEqual(plain(boxes.composeBoxes(many, () => false)), [])
  assert.deepEqual(plain(boxes.composeBoxes([{ key: 'a', title: 't' }], () => true)), [])
})
test('quadros: a ordem dos vistos segue o histórico e o texto é escapado', () => {
  const sorted = boxes.sortByViewed([{ _id: hex(1) }, { _id: hex(3) }, { _id: hex(2) }], [hex(3), hex(2), hex(1)])
  assert.deepEqual(plain(sorted.map(it => it._id)), [hex(3), hex(2), hex(1)])
  assert.equal(boxes.escapeHtml('<b a="1">&\'</b>'), '&lt;b a=&quot;1&quot;&gt;&amp;&#39;&lt;/b&gt;')
  assert.equal(boxes.escapeHtml(undefined), '')
})
test('quadros: a seção entra desligada na home, logo depois do banner, e está registrada no CMS', () => {
  const home = JSON.parse(fs.readFileSync(path.join(root, 'content/home.json'), 'utf8'))
  const types = home.sections.map(section => section.type)
  const at = types.indexOf('personalized-boxes')
  assert.equal(at, types.indexOf('banner-slider') + 1)
  assert.equal(types.filter(type => type === 'personalized-boxes').length, 1)
  assert.equal(typeof home.sections[at].enabled, 'boolean')
  assert.match(fs.readFileSync(path.join(root, 'template/js/cms/sections.js'), 'utf8'), /name: 'personalized-boxes'/)
})
test('quadros: parcelas seguem a regra do tema (mínimo da parcela, máximo da loja, juros)', () => {
  const option = { max_number: 6, min_installment: 5, monthly_interest: 0 }
  assert.deepEqual(plain(boxes.installmentsOf(18.99, option)), { number: 3, value: 18.99 / 3, interestFree: true })
  assert.equal(boxes.installmentsOf(100, option).number, 6)
  assert.equal(boxes.installmentsOf(9.99, option), null)
  assert.equal(boxes.installmentsOf(0, option), null)
  assert.equal(boxes.installmentsOf(50, null), null)
  assert.equal(boxes.installmentsOf(50, { max_number: 1, min_installment: 5 }), null)
  const withInterest = boxes.installmentsOf(100, { max_number: 4, min_installment: 5, monthly_interest: 2 })
  assert.equal(withInterest.interestFree, false)
  assert.ok(withInterest.value > 25 && withInterest.value < 27)
  assert.equal(boxes.installmentsOf(100, { max_number: 12 }).number, 12)
})
test('quadros: configuração do painel — padrões, limites e categorias inválidas', () => {
  const padrao = plain(boxes.normalizeConfig(undefined))
  assert.equal(padrao.max, 9)
  assert.equal(padrao.titles.viewed, 'Visto recentemente')
  assert.deepEqual(padrao.categories.map(c => c.title), ['Caixas p/ Transporte', 'Caixas para presente', 'Forminhas'])
  assert.deepEqual(plain(boxes.normalizeConfig('lixo')), padrao)
  assert.deepEqual(plain(boxes.normalizeConfig({ max: 'abc', titles: { sales: '   ' } })), padrao)
  assert.equal(boxes.normalizeConfig({ max: 50 }).max, 12)
  assert.equal(boxes.normalizeConfig({ max: -3 }).max, 9)
  assert.equal(boxes.normalizeConfig({ max: 4.9 }).max, 4)
  assert.equal(boxes.normalizeConfig({ titles: { news: '  Lançamentos   novos ' } }).titles.news, 'Lançamentos novos')
  assert.equal(boxes.normalizeConfig({ titles: { news: 'x'.repeat(100) } }).titles.news.length, 40)
  const id = 'a'.repeat(24)
  const config = boxes.normalizeConfig({ categories: [
    { category: `${id}:categories:Fitas de cetim:/fitas`, title: '' },
    { category: `${id}:categories:Fitas:/fitas`, title: 'Fitas lindas' },
    { category: 'id-invalido:categories:X:/x', title: 'X' },
    { category: `${id}:categories::/x`, title: '' },
    null
  ] })
  assert.deepEqual(plain(config.categories), [{ id, title: 'Fitas de cetim' }, { id, title: 'Fitas lindas' }])
  assert.deepEqual(plain(boxes.normalizeConfig({ categories: [] }).categories), [])
  assert.equal(boxes.normalizeConfig({ categories: Array.from({ length: 10 }, () => ({ category: `${id}:categories:A:/a` })) }).categories.length, 6)
})
test('quadros: o painel tem os campos de configuração e a home traz os valores atuais', () => {
  const cms = fs.readFileSync(path.join(root, 'template/js/cms/sections.js'), 'utf8')
  for (const field of ['max_boxes', 'title_viewed', 'title_search', 'title_related', 'title_sales', 'title_offers', 'title_news', 'category_boxes']) assert.match(cms, new RegExp(`name: '${field}'`))
  const home = JSON.parse(fs.readFileSync(path.join(root, 'content/home.json'), 'utf8'))
  const section = home.sections.find(item => item.type === 'personalized-boxes')
  const fromHome = boxes.normalizeConfig({ max: section.max_boxes, titles: { viewed: section.title_viewed, search: section.title_search, related: section.title_related, sales: section.title_sales, offers: section.title_offers, news: section.title_news }, categories: section.category_boxes })
  assert.deepEqual(plain(fromHome), plain(boxes.normalizeConfig(undefined)))
})
