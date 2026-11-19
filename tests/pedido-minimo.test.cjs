// T113: pedido mínimo avisado no carrinho e na página de produto (template/js/custom-js/pedido-minimo.js).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const babel = require('@babel/core')
const Vue = require('vue')
const compiler = require('vue-template-compiler')
const root = path.resolve(__dirname, '..')
const shipped = JSON.parse(fs.readFileSync(path.join(root, 'template/public/pe-cart-config.json'), 'utf8'))

Vue.config.productionTip = false
Vue.config.devtools = false
// PaymentMethods.js já declarava "minToBuy: 20" como prop e como computed (o computed vence, como na loja); só esse aviso é calado.
Vue.config.warnHandler = msg => { if (!msg.includes('"minToBuy" is already defined as a prop')) console.error('[Vue warn]: ' + msg) }

function load (file, mocks = {}, globals = {}) {
  const filename = path.join(root, file)
  let source = fs.readFileSync(filename, 'utf8')
  if (file.endsWith('.vue')) source = compiler.parseComponent(source).script.content
  const code = babel.transformSync(source, { filename, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code
  const module = { exports: {} }
  const localRequire = id => {
    if (id in mocks) return mocks[id]
    if (id.endsWith('.vue')) return { __esModule: true, default: { name: path.basename(id, '.vue'), render: h => h('div') } }
    return require(id)
  }
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, setTimeout, clearTimeout, console, ...globals }, { filename })
  return module.exports
}

const response = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) })
async function pedidoMinimo (fetchImpl) {
  const mod = load('template/js/custom-js/pedido-minimo.js', {}, { fetch: fetchImpl })
  await mod.loadPedidoMinimo()
  return mod
}

// Percorre a árvore de VNodes do render (sem DOM), entrando nos filhos de componentes como transition-group.
function walk (vnode, visit) {
  if (!vnode) return
  if (Array.isArray(vnode)) return vnode.forEach(child => walk(child, visit))
  visit(vnode)
  walk(vnode.children, visit)
  if (vnode.componentOptions) walk(vnode.componentOptions.children, visit)
}
const findAll = (tree, test_) => { const found = []; walk(tree, node => { if (test_(node)) found.push(node) }); return found }
const textOf = vnode => {
  let text = ''
  walk(vnode, node => { if (node.text) text += node.text })
  return text.replace(/\s+/g, ' ').trim()
}

// Carrinho (/app/#/cart): TheCart.html + TheCart.js com o TheCart nativo reduzido ao que o template usa.
function mountCart (mod, subtotal) {
  const cart = { items: [{ _id: 'x', quantity: 1, price: subtotal }], subtotal }
  const Native = {
    name: 'TheCart',
    components: {},
    props: { amount: { type: Object, default: () => ({}) }, checkoutUrl: { type: String, default: '/app/#/checkout' } },
    data () { return { localZipCode: '', canApplyDiscount: false, isCouponApplied: false, localDiscountCoupon: '' } },
    computed: {
      i19checkout: () => 'Finalizar compra',
      i19continueShopping: () => 'Continuar comprando',
      i19discount: () => 'Desconto',
      i19emptyCart: () => 'Carrinho vazio',
      cart: () => cart,
      isValidCart: () => cart.items.find(({ quantity }) => quantity)
    },
    methods: { formatMoney: v => 'R$ ' + v.toFixed(2), selectShippingService () {}, setDiscountRule () {} }
  }
  const runtime = { runtime: { ready: true }, enabled: () => true, uiVersion: () => 'v2', init () {} }
  const options = load('template/js/custom-js/js/TheCart.js', {
    '@ecomplus/storefront-components/src/js/TheCart.js': { __esModule: true, default: Native },
    '../freight/core': { __esModule: true, default: { isFreeDelivery: () => false } },
    '../freight/runtime': runtime,
    '../pedido-minimo': mod,
    '../components/PeMinOrder.vue': load('template/js/custom-js/components/PeMinOrder.vue')
  }).default
  const { render, staticRenderFns } = compiler.compileToFunctions(fs.readFileSync(path.join(root, 'template/js/custom-js/html/TheCart.html'), 'utf8'))
  // Como componente (Vue.extend), igual à loja: é assim que o computed vence a prop de mesmo nome.
  const instance = new (Vue.extend({ ...options, render, staticRenderFns }))({ propsData: {} })
  const tree = instance._render()
  const [button] = findAll(tree, node => node.data && node.data.staticClass && node.data.staticClass.includes('cart__btn-checkout'))
  const notices = findAll(tree, node => node.componentOptions && node.componentOptions.tag === 'pe-min-order')
  return { button, notices }
}

// O texto do aviso sai do componente, com os dados de avisoMinimo().
function noticeText (aviso) {
  const file = path.join(root, 'template/js/custom-js/components/PeMinOrder.vue')
  const parsed = compiler.parseComponent(fs.readFileSync(file, 'utf8'))
  const { render, staticRenderFns } = compiler.compileToFunctions(parsed.template.content)
  const options = load('template/js/custom-js/components/PeMinOrder.vue').default
  return textOf(new Vue({ ...options, render, staticRenderFns, propsData: { aviso } })._render())
}

test('arquivo publicado: mínimo de R$ 20 e aviso ligado, sem mexer no teste sem minicart', () => {
  assert.equal(shipped.pedidoMinimo, 20)
  assert.equal(shipped.avisoPedidoMinimo, true)
  assert.equal(shipped.minicart, false)
  assert.equal(shipped.noMinicartPercent, 100)
})

test('conta em centavos: 1,60 faltam 18,40; 19,99 falta 0,01; 20,00 e acima não falta nada', async () => {
  const mod = await pedidoMinimo(() => response(shipped))
  assert.equal(mod.faltaParaMinimo(1.6), 18.4)
  assert.equal(mod.faltaParaMinimo(19.99), 0.01)
  assert.equal(mod.faltaParaMinimo(0.1 + 0.2 + 19.7), 0)
  assert.equal(mod.faltaParaMinimo(20), 0)
  assert.equal(mod.faltaParaMinimo(24), 0)
  assert.deepEqual({ ...mod.avisoMinimo(1.6) }, { falta: 'R$ 18,40', minimo: 'R$ 20' })
  assert.equal(mod.avisoMinimo(20), null)
})

test('carrinho com subtotal 1,60: aviso "Faltam R$ 18,40" e Finalizar compra desabilitado', async () => {
  const mod = await pedidoMinimo(() => response(shipped))
  const { button, notices } = mountCart(mod, 1.6)
  assert.equal(notices.length, 1)
  assert.equal(noticeText(notices[0].componentOptions.propsData.aviso), 'Faltam R$ 18,40 para o pedido mínimo de R$ 20')
  assert.equal(button.data.attrs.href, null)
  assert.equal(button.data.attrs['aria-disabled'], 'true')
  assert.equal(button.data.attrs.tabindex, -1)
  assert.ok(button.data.class[1].disabled, 'botão com a classe disabled')
})

test('carrinho com subtotal 20,00: sem aviso e Finalizar compra liberado', async () => {
  const mod = await pedidoMinimo(() => response(shipped))
  const { button, notices } = mountCart(mod, 20)
  assert.equal(notices.length, 0)
  assert.equal(button.data.attrs.href, '/app/#/checkout')
  assert.equal(button.data.attrs['aria-disabled'], null)
  assert.ok(!button.data.class[1].disabled)
})

test('avisoPedidoMinimo: false (rollback) não mostra nada novo, nem com 1,60', async () => {
  const mod = await pedidoMinimo(() => response({ ...shipped, avisoPedidoMinimo: false }))
  assert.equal(mod.avisoMinimo(1.6), null)
  const { button, notices } = mountCart(mod, 1.6)
  assert.equal(notices.length, 0)
  assert.equal(button.data.attrs.href, '/app/#/checkout')
  assert.ok(!button.data.class[1].disabled)
})

test('pedidoMinimo fora de 1 a 100 ou inválido volta para R$ 20', async () => {
  for (const pedidoMinimo_ of [0, -5, 200, '30', null, undefined, NaN]) {
    const mod = await pedidoMinimo(() => response({ ...shipped, pedidoMinimo: pedidoMinimo_ }))
    assert.equal(mod.state.minimo, 20, String(pedidoMinimo_))
  }
  const mod = await pedidoMinimo(() => response({ ...shipped, pedidoMinimo: 30 }))
  assert.equal(mod.state.minimo, 30)
  assert.deepEqual({ ...mod.avisoMinimo(25) }, { falta: 'R$ 5,00', minimo: 'R$ 30' })
})

// Tela de pagamento (PaymentMethods): continua barrando abaixo do mínimo, mesmo com o arquivo fora do ar.
function mountPayment (mod, subtotal) {
  const i18nNames = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) })
  const options = load('template/js/custom-js/js/PaymentMethods.js', {
    '@ecomplus/i18n': i18nNames,
    '@ecomplus/utils': { i18n: s => s, price: item => item.price, formatMoney: v => 'R$ ' + v.toFixed(2).replace('.', ','), $ecomConfig: { get: () => '' } },
    '@ecomplus/client': { modules: () => new Promise(() => {}) },
    '@ecomplus/shopping-cart': { __esModule: true, default: { data: { items: [] } } },
    '@ecomplus/storefront-app/src/lib/load-payment-client': { __esModule: true, default: () => Promise.resolve() },
    '@ecomplus/storefront-app/src/lib/utils': { sortApps () {} },
    '../pedido-minimo': mod
  }, { window: { location: { hostname: 'test' } } }).default
  const { render, staticRenderFns } = compiler.compileToFunctions('<div>' + fs.readFileSync(path.join(root, 'template/js/custom-js/html/PaymentMethods.html'), 'utf8') + '</div>')
  // Como componente (Vue.extend), igual à loja: o computed minToBuy vence a prop "minToBuy: 20" de mesmo nome.
  const instance = new (Vue.extend({ ...options, render, staticRenderFns }))({
    propsData: { amount: { subtotal, total: subtotal }, cartItems: [{ price: subtotal, quantity: 1, currency_id: 'BRL' }], paymentGateways: [], canUpdateGateways: false }
  })
  const tree = instance._render()
  return { instance, payment: findAll(tree, node => node.data && node.data.staticClass === 'payment'), text: textOf(tree) }
}

test('pagamento com o arquivo fora do ar: mínimo continua R$ 20 e barra 1,60 (libera 20,00)', async () => {
  const mod = await pedidoMinimo(() => Promise.reject(new Error('rede')))
  assert.equal(mod.state.minimo, 20)
  assert.equal(mod.state.aviso, false)
  const below = mountPayment(mod, 1.6)
  assert.equal(below.instance.minToBuy, 20)
  assert.equal(below.payment.length, 0, 'formas de pagamento escondidas')
  assert.match(below.text, /R\$ 18,40/)
  const at = mountPayment(mod, 20)
  assert.equal(at.payment.length, 1, 'formas de pagamento liberadas')
})

test('pagamento com resposta 404 ou JSON quebrado também fica em R$ 20', async () => {
  for (const fetchImpl of [() => response({}, false), () => Promise.resolve({ ok: true, json: () => Promise.reject(new Error('json')) })]) {
    const mod = await pedidoMinimo(fetchImpl)
    assert.equal(mod.state.minimo, 20)
    assert.equal(mountPayment(mod, 1.6).payment.length, 0)
  }
})

test('pagamento: o mínimo vem do mesmo arquivo (fonte única), ignorando avisoPedidoMinimo', async () => {
  const mod = await pedidoMinimo(() => response({ ...shipped, pedidoMinimo: 30, avisoPedidoMinimo: false }))
  const { instance, payment } = mountPayment(mod, 25)
  assert.equal(instance.minToBuy, 30)
  assert.equal(payment.length, 0)
})

// PDP nova: o mesmo aviso na caixa de compra, com o carrinho de agora + o que está escolhido (botões não travam).
function pdpMinimo (mod, state) {
  const any = new Proxy(function () {}, { get: (target, key) => key === '__esModule' ? true : key === 'default' ? any : any, apply: () => any })
  const real = new Set(['../pedido-minimo', '@ecomplus/i18n'])
  const mocks = new Proxy({ '../pedido-minimo': mod }, {
    has: (target, id) => !real.has(id) || id in target,
    get: (target, id) => id in target ? target[id] : any
  })
  const options = load('template/js/custom-js/js/TheProduct.js', mocks, { window: {}, document: {} }).default
  return options.computed.peMinimo.call(state)
}

test('PDP: carrinho vazio e 1 pacote de 1,60 mostra "Faltam R$ 18,40"; com R$ 20 somados some', async () => {
  const mod = await pedidoMinimo(() => response(shipped))
  const one = { isOnCart: false, ghostProductForPrices: { price: 1.6 }, qntToBuy: 1, peCartSubtotal: 0 }
  assert.deepEqual({ ...pdpMinimo(mod, one) }, { falta: 'R$ 18,40', minimo: 'R$ 20' })
  assert.equal(pdpMinimo(mod, { ...one, peCartSubtotal: 18.4 }), null)
  assert.equal(pdpMinimo(mod, { ...one, ghostProductForPrices: { price: 20 } }), null)
  // Depois de adicionar, o item já está no subtotal do carrinho: não conta duas vezes.
  assert.deepEqual({ ...pdpMinimo(mod, { ...one, isOnCart: true, peCartSubtotal: 10, ghostProductForPrices: { price: 10 } }) }, { falta: 'R$ 10,00', minimo: 'R$ 20' })
  const off = await pedidoMinimo(() => response({ ...shipped, avisoPedidoMinimo: false }))
  assert.equal(pdpMinimo(off, one), null)
})

test('PDP: aviso fica na caixa de compra, antes dos botões', () => {
  const html = fs.readFileSync(path.join(root, 'template/js/custom-js/html/TheProduct.html'), 'utf8')
  const box = html.slice(html.indexOf('<div class="pdp-buy-box">'), html.indexOf('class="product__buy"', html.indexOf('<div class="pdp-buy-box">')))
  assert.match(box, /<pe-min-order\s+v-if="isVariationInStock && hasBuyButton && peMinimo"\s+:aviso="peMinimo"/)
})
