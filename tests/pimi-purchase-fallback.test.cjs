// T84: quando a confirmação não abre por falta de arquivo (T115), a ponte do pixel PIMI (content/code.json) ainda registra a compra.
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
const toConfirmation = { name: 'confirmation', params: { id: order._id, number: order.number } }
const chunkError = () => Object.assign(new Error('Loading chunk 3 failed.'), { name: 'ChunkLoadError' })

// Roda a ponte com um router e um pixel falsos; storage simula o localStorage (sobrevive à recarga).
function setup ({ orders = [order], storage = {}, currentRoute = { name: 'checkout', params: {} } } = {}) {
  const tracked = []
  const hooks = { onError: [] }
  const router = {
    currentRoute,
    afterEach: fn => { hooks.afterEach = fn },
    beforeEach: fn => { hooks.beforeEach = fn },
    onError: fn => { hooks.onError.push(fn) },
    app: { $store: { getters: { orders } } }
  }
  const localStorage = {
    getItem: k => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v) },
    removeItem: k => { delete storage[k] }
  }
  const window = {
    pimi: { track: (name, props) => tracked.push({ name, props }), identify () {} },
    storefrontApp: { router },
    addEventListener () {},
    location: { pathname: '/app/', href: 'https://www.pietroembalagens.com.br/app/#/checkout/x/2', hash: '#/checkout/x/2' }
  }
  const document = { addEventListener () {}, querySelector: () => null, querySelectorAll: () => [], readyState: 'complete', body: {} }
  vm.runInNewContext(bridge, { window, document, localStorage, location: window.location, setTimeout, clearTimeout, console, JSON, Promise })
  const purchases = () => tracked.filter(e => e.name === 'purchase')
  return { hooks, purchases, storage, navigate: to => hooks.beforeEach(to, null, () => {}) }
}

test('confirmação sem arquivo (Pix/boleto vai para a PagHiper): registra a compra uma vez', () => {
  const { hooks, purchases, navigate } = setup()
  navigate(toConfirmation)
  hooks.onError.forEach(fn => fn(chunkError()))
  hooks.onError.forEach(fn => fn(chunkError()))
  assert.equal(purchases().length, 1)
  assert.equal(purchases()[0].props.order_id, '10012570')
  assert.equal(purchases()[0].props.revenue_cents, 3727)
})

test('cartão: depois da recarga já na confirmação, não registra a compra de novo', async () => {
  const storage = {}
  const first = setup({ storage })
  first.navigate(toConfirmation)
  first.hooks.onError.forEach(fn => fn(chunkError()))
  assert.equal(first.purchases().length, 1)
  const reloaded = setup({ storage, currentRoute: toConfirmation })
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(reloaded.purchases().length, 0)
})

test('erro que não é de arquivo, ou fora da confirmação: não registra nada', () => {
  const { hooks, purchases, navigate } = setup()
  navigate(toConfirmation)
  hooks.onError.forEach(fn => fn(new Error('outro erro')))
  navigate({ name: 'checkout', params: {} })
  hooks.onError.forEach(fn => fn(chunkError()))
  assert.equal(purchases().length, 0)
})

test('caminho normal: abrir a confirmação continua registrando a compra', async () => {
  const { hooks, purchases } = setup()
  hooks.afterEach({ name: 'confirmation', params: { id: order._id, number: order.number, json: encodeURIComponent(JSON.stringify(order)) } })
  await new Promise(resolve => setTimeout(resolve, 350))
  assert.equal(purchases().length, 1)
})
