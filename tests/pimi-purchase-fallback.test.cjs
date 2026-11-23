// Ponte do pixel PIMI (content/code.json): uma compra por pedido, inclusive quando a confirmação não abre (T84).
// O router de verdade (window.storefrontApp.router, storefront-app src/main.js) só tem afterEach e currentRoute.
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const root = path.resolve(__dirname, '..')

const body = JSON.parse(fs.readFileSync(path.join(root, 'content/code.json'), 'utf8')).html_body
const bridge = body.match(/<script>((?:(?!<\/script>)[\s\S])*STORAGE_PREFIX = 'pimi_ecomplus_'[\s\S]*?)<\/script>/)[1]

const order = {
  _id: '6aff59ae568e8331255b960c',
  number: 10012570,
  amount: { total: 37.27, freight: 8.78, discount: 0 },
  items: [{ product_id: '67abbfed53d3dd5b9c66e4b4', sku: 'SACOLA_M_B-05-PRETA', quantity: 1, final_price: 28.49 }],
  buyers: [{ _id: '64b1b0395e6069037064eff9' }]
}
const shortConfirmation = { name: 'confirmation', params: { id: order._id, number: String(order.number) } }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// Roda a ponte com o router no formato real, um pixel falso e uma API da loja que demora a responder.
function setup ({ storage = {}, currentRoute = { name: 'checkout', params: {} } } = {}) {
  const tracked = []
  const listeners = {}
  const afterEach = []
  const router = {
    get currentRoute () { return currentRoute },
    afterEach: fn => { afterEach.push(fn) }
  }
  const localStorage = {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v) }
  }
  const sessionStorage = { getItem: () => null, setItem () {} }
  const window = {
    pimi: { track: (name, props) => tracked.push({ name, props }), identify () {} },
    storefrontApp: { router },
    ecomClient: { store: () => wait(150).then(() => ({ data: order })) },
    ecomCart: { data: { _id: 'c1', subtotal: 10, items: [] }, on () {} },
    addEventListener: (name, fn) => { listeners[name] = fn },
    location: { pathname: '/app/', hash: '#/checkout/x/2' }
  }
  const document = { addEventListener () {} }
  vm.runInNewContext(bridge, { window, document, localStorage, sessionStorage, location: window.location, setTimeout, console, JSON, Promise })
  const count = name => tracked.filter(e => e.name === name).length
  const navigate = to => { currentRoute = to; afterEach.forEach(fn => fn(to)) }
  return { tracked, listeners, afterEach, count, navigate, storage }
}

test('confirmação sem o pedido na URL: registra a compra uma vez só (era ~80 desde 20/11)', async () => {
  const s = setup({ currentRoute: shortConfirmation })
  await wait(1200)
  assert.equal(s.afterEach.length, 1)
  assert.equal(s.count('purchase'), 1)
  assert.equal(s.tracked.find(e => e.name === 'purchase').props.order_id, '10012570')
})

test('ver o carrinho conta uma vez por visita (era ~80 desde 20/11)', async () => {
  const s = setup()
  await wait(400)
  s.navigate({ name: 'cart', params: {} })
  assert.equal(s.count('view_cart'), 1)
})

test('caminho normal: pedido completo na URL registra a compra uma vez', async () => {
  const s = setup()
  await wait(200)
  s.navigate({ name: 'confirmation', params: { id: order._id, number: order.number, json: encodeURIComponent(JSON.stringify(order)) } })
  s.navigate({ name: 'confirmation', params: { id: order._id, number: order.number, json: encodeURIComponent(JSON.stringify(order)) } })
  await wait(400)
  assert.equal(s.count('purchase'), 1)
})

test('T84: confirmação sem arquivo → aviso do checkout.js registra a compra uma vez', async () => {
  const s = setup()
  await wait(200)
  s.listeners['pe:confirmation-chunk-error']({ detail: { order, route: shortConfirmation } })
  s.listeners['pe:confirmation-chunk-error']({ detail: { order, route: shortConfirmation } })
  assert.equal(s.count('purchase'), 1)
  assert.equal(s.tracked.find(e => e.name === 'purchase').props.revenue_cents, 3727)
})

test('cartão: depois da recarga já na confirmação, não registra a compra de novo', async () => {
  const storage = {}
  const first = setup({ storage })
  await wait(200)
  first.listeners['pe:confirmation-chunk-error']({ detail: { order, route: shortConfirmation } })
  const reloaded = setup({ storage, currentRoute: shortConfirmation })
  await wait(700)
  assert.equal(first.count('purchase') + reloaded.count('purchase'), 1)
})
