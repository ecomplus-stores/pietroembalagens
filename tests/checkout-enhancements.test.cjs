const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const crypto = require('node:crypto')
const ejs = require('ejs')

const rootDirectory = path.resolve(__dirname, '..')
const head = fs.readFileSync(path.join(rootDirectory, 'template/pages/@/head.ejs'), 'utf8')
const asset = head.match(/\/assets\/(pe-checkout-enhancements\.[a-f0-9]{12}\.js)/)[1]
const source = fs.readFileSync(path.join(rootDirectory, 'template/public/assets', asset), 'utf8')

function fixture ({ hash = '#/checkout', readyState = 'complete', hasRoot = true, stored = {}, hasCpf = false } = {}) {
  const root = { nodes: [], style: {} }
  const body = {}
  const gateways = []
  const observations = []
  const listeners = {}
  const timers = []
  const state = { hasCpf, walks: 0 }
  const calls = []
  const location = { hash }
  const window = {
    dataLayer: [],
    gtag: (...args) => calls.push(args),
    getComputedStyle: element => ({ display: element.style.display || 'block', flexDirection: element.style.flexDirection || 'row' }),
    addEventListener: (name, handler) => { listeners[name] = handler }
  }
  const document = {
    body, readyState,
    getElementById: id => id === 'spa' && hasRoot ? root : null,
    querySelector: selector => selector === 'main' ? (hasRoot ? root : null) : (state.hasCpf ? {} : null),
    querySelectorAll: () => gateways,
    createTreeWalker: element => {
      assert.equal(element, root)
      state.walks++
      let index = 0
      return { nextNode: () => element.nodes[index++] || null }
    },
    addEventListener: (name, handler) => { listeners[name] = handler }
  }
  const context = {
    window, document, location, NodeFilter: { SHOW_TEXT: 4 },
    sessionStorage: { getItem: key => stored[key] || null, setItem: (key, value) => { stored[key] = value } },
    MutationObserver: function (handler) { this.observe = (target, options) => observations.push({ target, options, handler }) },
    setTimeout: handler => { timers.push(handler); return timers.length }
  }
  vm.runInNewContext(source, context)
  return {
    root, body, gateways, state, window, calls, observations, listeners, stored, timers,
    drain: () => { while (timers.length) timers.shift()() },
    changeHash: next => { location.hash = next; listeners.hashchange?.() },
    mutation: () => observations.forEach(observer => observer.handler())
  }
}

test('existing checkout DOM gets the same copy and Pix/boleto order, observing the stable app wrapper', () => {
  const f = fixture({ readyState: 'loading' })
  f.root.nodes.push({ nodeValue: 'Complete seu cadastro para prosseguir com a compra:' }, { nodeValue: 'Identifique-se ou crie sua conta' }, { nodeValue: 'Informe seu email para prosseguir' })
  f.gateways.push(...['Cartão', 'Boleto', 'Pix'].map(textContent => ({ textContent, style: {}, parentElement: f.root })))
  f.listeners.DOMContentLoaded()
  assert.deepEqual(f.root.nodes.map(n => n.nodeValue), ['Só precisamos dos seus dados para entrega:', 'Comprar sem criar senha', 'Informe seu e-mail para começar'])
  assert.deepEqual(f.gateways.map(g => g.style.order), ['3', '2', '1'])
  assert.equal(f.root.style.display, 'flex')
  assert.equal(f.root.style.flexDirection, 'column')
  assert.equal(f.observations.length, 1)
  assert.equal(f.observations[0].target, f.root)
  assert.notEqual(f.observations[0].target, f.body)
  assert.equal(f.observations[0].options.subtree, true)
  assert.equal(f.observations[0].options.characterData, true)
})

test('late gateways and text changes are handled once after debouncing repeated mutations', () => {
  const f = fixture()
  f.root.nodes.push({ nodeValue: 'Complete seu cadastro para prosseguir com a compra' })
  f.gateways.push({ textContent: 'Pagamento por PIX', style: {}, parentElement: f.root })
  f.mutation(); f.mutation(); f.listeners.change()
  assert.equal(f.timers.length, 1)
  f.drain()
  assert.equal(f.root.nodes[0].nodeValue, 'Só precisamos dos seus dados para entrega')
  assert.equal(f.gateways[0].style.order, '1')
  assert.equal(f.state.walks, 2)
})

test('login/cart transitions do no checkout scanning and returning to checkout keeps the observer attached', () => {
  const f = fixture({ hash: '#/login' })
  f.root.nodes.push({ nodeValue: 'Identifique-se ou crie sua conta' })
  f.mutation(); f.changeHash('#/cart'); f.mutation(); f.drain()
  assert.equal(f.state.walks, 0)
  assert.equal(f.root.nodes[0].nodeValue, 'Identifique-se ou crie sua conta')
  assert.equal(f.window.dataLayer.length, 0)
  // The SPA replaces its children while keeping the EJS main wrapper.
  f.root.nodes = [{ nodeValue: 'Informe seu email para prosseguir' }]
  f.changeHash('#/checkout'); f.mutation(); f.drain()
  assert.equal(f.root.nodes[0].nodeValue, 'Informe seu e-mail para começar')
  assert.equal(f.observations.length, 1)
  assert.equal(f.observations[0].target, f.root)
})

test('checkout steps retain the existing event names, BRL payload, both channels and session keys without repetition', () => {
  const f = fixture({ hasCpf: true })
  for (const hash of ['#/checkout', '#/checkout/1', '#/checkout/1', '#/checkout/2', '#/cart', '#/checkout/2']) {
    f.changeHash(hash); f.mutation(); f.drain()
  }
  assert.deepEqual(f.calls.map(args => args[1]), ['checkout_dados_cadastrais', 'add_shipping_info', 'add_payment_info'])
  assert.deepEqual(Array.from(f.window.dataLayer, value => value.event), ['checkout_dados_cadastrais', 'add_shipping_info', 'add_payment_info'])
  assert.ok(f.calls.every(args => args[0] === 'event' && args[2].currency === 'BRL'))
  assert.ok(f.window.dataLayer.every(value => value.currency === 'BRL'))
  assert.deepEqual(f.stored, { pe_dados: '1', pe_entrega: '1', pe_pagamento: '1' })
})

test('each checkout step also reaches the PIMI pixel once, after GA4, with the cart id', () => {
  const f = fixture({ hasCpf: true })
  const pixel = []
  f.window.pimi = { track: (...args) => pixel.push(args) }
  f.window.ecomCart = { data: { _id: 'cart-1' } }
  for (const hash of ['#/checkout', '#/checkout/1', '#/checkout/1', '#/checkout/2', '#/cart', '#/checkout/2']) {
    f.changeHash(hash); f.mutation(); f.drain()
  }
  // The payload objects are created inside the vm context, so compare by value.
  assert.deepEqual(JSON.parse(JSON.stringify(pixel)), [
    ['checkout_step', { cart_id: 'cart-1', step_name: 'dados', step_number: 1 }],
    ['checkout_step', { cart_id: 'cart-1', step_name: 'entrega', step_number: 2 }],
    ['checkout_step', { cart_id: 'cart-1', step_name: 'pagamento', step_number: 3 }]
  ])
  assert.equal(f.window.dataLayer.length, 3)
})

test('a missing pixel is retried a bounded number of times and a late pixel still gets the step', () => {
  // The module runs once on load: with the CPF field present it emits the first step right away.
  const f = fixture({ hasCpf: true })
  assert.equal(f.window.dataLayer.length, 1)
  let retries = 0
  while (f.timers.length) { f.timers.shift()(); retries++ }
  assert.equal(retries, 16)
  const g = fixture({ hasCpf: true })
  const pixel = []
  g.timers.shift()()
  assert.equal(g.timers.length, 1)
  g.window.pimi = { track: (...args) => pixel.push(args) }
  g.drain()
  assert.deepEqual(JSON.parse(JSON.stringify(pixel)), [['checkout_step', { cart_id: '', step_name: 'dados', step_number: 1 }]])
  assert.equal(g.window.dataLayer.length, 1)
})

test('a pixel that throws cannot remove a GA4 event or stop the next steps', () => {
  const f = fixture({ hasCpf: true })
  f.window.pimi = { track: () => { throw new Error('pixel fora') } }
  for (const hash of ['#/checkout', '#/checkout/1', '#/checkout/2']) { f.changeHash(hash); f.mutation(); f.drain() }
  assert.deepEqual(f.calls.map(args => args[1]), ['checkout_dados_cadastrais', 'add_shipping_info', 'add_payment_info'])
  assert.deepEqual(Array.from(f.window.dataLayer, value => value.event), ['checkout_dados_cadastrais', 'add_shipping_info', 'add_payment_info'])
})

test('a previous session step and a queued update after leaving checkout cannot produce another event', () => {
  const f = fixture({ hash: '#/checkout/1', stored: { pe_entrega: '1' } })
  assert.equal(f.window.dataLayer.length, 0)
  f.mutation(); f.changeHash('#/cart'); f.drain()
  assert.equal(f.window.dataLayer.length, 0)
  assert.equal(f.state.walks, 1)
})

test('loading the module outside the app creates no observer, listener or checkout event', () => {
  const f = fixture({ hasRoot: false })
  assert.equal(f.observations.length, 0)
  assert.equal(f.state.walks, 0)
  assert.equal(f.window.dataLayer.length, 0)
  assert.equal(Object.keys(f.listeners).length, 0)
})

test('the versioned helper matches its hash and is requested only by app pages, after shared head code', async () => {
  const digest = crypto.createHash('sha256').update(source).digest('hex').slice(0, 12)
  assert.equal(asset, `pe-checkout-enhancements.${digest}.js`)
  for (const route of ['/', '/search', '/product', '/category', '/application', '/app', '/app/', '/app/index']) {
    const html = await ejs.render(head, { _: { route: { path: route }, assetsPrefix: '', cms: name => name === 'code' ? { html_head: '<script>window.sharedFreightReady=true</script>' } : {} }, include: async () => '' }, { async: true })
    const requested = html.includes('/assets/' + asset)
    assert.equal(requested, route === '/app' || route.startsWith('/app/'), route)
    if (requested) {
      assert.ok(html.indexOf('sharedFreightReady') < html.indexOf('/assets/' + asset))
      assert.match(html, /<script defer src=/)
    }
  }
  const prefixed = await ejs.render(head, { _: { route: { path: '/app/index' }, assetsPrefix: 'https://cdn.example.invalid', cms: () => ({}) }, include: async () => '' }, { async: true })
  assert.ok(prefixed.includes('https://cdn.example.invalid/assets/' + asset))
})
