// T115: deploy no meio da compra não pode deixar a cliente sem a tela do Pix (template/js/custom-js/checkout.js).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const babel = require('@babel/core')
const root = path.resolve(__dirname, '..')
const file = 'template/js/custom-js/checkout.js'

const PIX_LINK = 'https://www.paghiper.com/checkout/pix/?abc/11JFG1JADJYORM26/11030669'

// Carrega o checkout.js com um router falso e devolve o que ele fez.
function setup ({ readyState = 'complete', orders = [], storage = {}, preload = () => Promise.resolve() } = {}) {
  const calls = { preload: 0, reload: 0, listeners: {} }
  const hooks = {}
  const router = {
    options: { routes: [{ name: 'cart' }, { name: 'confirmation', component: () => { calls.preload++; return preload() } }] },
    beforeEach: fn => { hooks.beforeEach = fn },
    onError: fn => { hooks.onError = fn },
    resolve: to => ({ href: `#/confirmation/${to.params.id}/${to.params.number}` }),
    app: { $store: { getters: { orders } } }
  }
  const location = { href: 'https://www.pietroembalagens.com.br/app/#/checkout/x/2', hash: '#/checkout/x/2', reload: () => { calls.reload++ } }
  calls.dispatched = []
  const window = {
    location,
    dataLayer: [],
    addEventListener: (name, fn) => { calls.listeners[name] = fn },
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail },
    // Guarda o href do momento do aviso: a ponte do pixel precisa receber antes de a página sair.
    dispatchEvent: event => { calls.dispatched.push({ type: event.type, detail: event.detail, href: location.href, reload: calls.reload }) }
  }
  const sessionStorage = {
    getItem: key => (key in storage ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value) }
  }
  const source = fs.readFileSync(path.join(root, file), 'utf8')
  const code = babel.transformSync(source, { filename: file, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code
  const mocks = { './passport-oauth': {}, '@ecomplus/storefront-app/src/router': { __esModule: true, default: router } }
  vm.runInNewContext(code, { module: { exports: {} }, exports: {}, require: id => mocks[id], window, document: { readyState }, sessionStorage, Promise, console })
  const navigate = to => hooks.beforeEach(to, null, () => {})
  return { calls, hooks, window, storage, navigate }
}

const chunkError = () => Object.assign(new Error('Loading chunk 3 failed.\n(error: https://www.pietroembalagens.com.br/chunk.7b7e.js)'), { name: 'ChunkLoadError' })
const toConfirmation = { name: 'confirmation', params: { id: '6aff59ae568e8331255b960c', number: 10012570 } }
const pixOrder = { _id: '6aff59ae568e8331255b960c', number: 10012570, transactions: [{ payment_link: PIX_LINK }] }
const cardOrder = { _id: '6aff59ae568e8331255b960c', number: 10012570, transactions: [{ payment_method: { code: 'credit_card' } }] }
const tick = () => new Promise(resolve => setImmediate(resolve))

test('baixa a tela de confirmação assim que a página já carregou', async () => {
  const { calls } = setup({ readyState: 'complete' })
  await tick()
  assert.equal(calls.preload, 1)
})

test('página ainda carregando: baixa a confirmação no evento load', async () => {
  const { calls } = setup({ readyState: 'loading' })
  await tick()
  assert.equal(calls.preload, 0)
  calls.listeners.load()
  await tick()
  assert.equal(calls.preload, 1)
})

test('falha no pré-carregamento não quebra a página', async () => {
  const { calls } = setup({ preload: () => Promise.reject(chunkError()) })
  await tick()
  assert.equal(calls.preload, 1)
})

test('Pix: arquivo da confirmação sumiu → vai para a página de pagamento do pedido, contando uma vez só', () => {
  const { hooks, window, calls, navigate } = setup({ orders: [pixOrder] })
  navigate(toConfirmation)
  hooks.onError(chunkError())
  hooks.onError(chunkError())
  assert.equal(window.location.href, PIX_LINK)
  assert.equal(calls.reload, 0)
  assert.deepEqual(window.dataLayer.map(e => ({ ...e })), [{ event: 'pe_chunk_fallback', pe_order_number: 10012570, pe_fallback: 'payment_link' }])
})

test('cartão (sem link de pagamento): recarrega uma vez já na confirmação', () => {
  const { hooks, window, calls, navigate, storage } = setup({ orders: [cardOrder] })
  navigate(toConfirmation)
  hooks.onError(chunkError())
  assert.equal(calls.reload, 1)
  assert.equal(window.location.hash, '#/confirmation/6aff59ae568e8331255b960c/10012570')
  assert.equal(storage.pe_chunk_reload, '6aff59ae568e8331255b960c')
  assert.equal(window.dataLayer[0].pe_fallback, 'reload')
})

test('cartão: depois de uma recarga pelo mesmo pedido, não recarrega de novo (sem loop)', () => {
  const { hooks, calls, navigate } = setup({ orders: [cardOrder], storage: { pe_chunk_reload: '6aff59ae568e8331255b960c' } })
  navigate(toConfirmation)
  hooks.onError(chunkError())
  assert.equal(calls.reload, 0)
})

test('link de pagamento sem https não é seguido', () => {
  const order = { ...pixOrder, transactions: [{ payment_link: 'javascript:alert(1)' }] }
  const { hooks, window, calls, navigate } = setup({ orders: [order] })
  navigate(toConfirmation)
  hooks.onError(chunkError())
  assert.notEqual(window.location.href, 'javascript:alert(1)')
  assert.equal(calls.reload, 1)
})

test('pedido de outro id não é usado', () => {
  const { hooks, window, navigate } = setup({ orders: [{ ...pixOrder, _id: 'outro' }] })
  navigate(toConfirmation)
  hooks.onError(chunkError())
  assert.notEqual(window.location.href, PIX_LINK)
})

test('outros erros ou outras telas seguem como antes (nada acontece)', () => {
  const a = setup({ orders: [pixOrder] })
  a.navigate(toConfirmation)
  a.hooks.onError(new Error('qualquer outra coisa'))
  const b = setup({ orders: [pixOrder] })
  b.navigate({ name: 'cart', params: {} })
  b.hooks.onError(chunkError())
  for (const { window, calls } of [a, b]) {
    assert.equal(window.location.href, 'https://www.pietroembalagens.com.br/app/#/checkout/x/2')
    assert.equal(calls.reload, 0)
    assert.equal(window.dataLayer.length, 0)
  }
})

test('T84: avisa a ponte do pixel com o pedido antes de sair da página, uma vez só', () => {
  const { hooks, calls, navigate } = setup({ orders: [pixOrder] })
  navigate(toConfirmation)
  hooks.onError(chunkError())
  hooks.onError(chunkError())
  assert.equal(calls.dispatched.length, 1)
  assert.equal(calls.dispatched[0].type, 'pe:confirmation-chunk-error')
  assert.equal(calls.dispatched[0].detail.order, pixOrder)
  assert.equal(calls.dispatched[0].detail.route, toConfirmation)
  assert.notEqual(calls.dispatched[0].href, PIX_LINK)
  assert.equal(calls.dispatched[0].reload, 0)
})
