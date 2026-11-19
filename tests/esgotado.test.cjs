// T114: item que esgotou (quantidade 0 no carrinho) avisado na tela de pagamento (template/js/custom-js/esgotado.js).
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const babel = require('@babel/core')
const Vue = require('vue')
const compiler = require('vue-template-compiler')
const root = path.resolve(__dirname, '..')

Vue.config.productionTip = false
Vue.config.devtools = false
Vue.config.warnHandler = msg => { if (!msg.includes('"minToBuy" is already defined as a prop')) console.error('[Vue warn]: ' + msg) }

function load (file, mocks = {}, globals = {}) {
  const filename = path.join(root, file)
  let source = fs.readFileSync(filename, 'utf8')
  if (file.endsWith('.vue')) source = compiler.parseComponent(source).script.content
  const code = babel.transformSync(source, { filename, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code
  const module = { exports: {} }
  const localRequire = id => (id in mocks) ? mocks[id] : require(id)
  vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, setTimeout, clearTimeout, console, ...globals }, { filename })
  return module.exports
}

// Componente .vue de verdade (script + template), para o texto do aviso aparecer no render.
function loadVue (file) {
  const options = load(file).default
  const template = compiler.parseComponent(fs.readFileSync(path.join(root, file), 'utf8')).template.content
  return { __esModule: true, default: { ...options, ...compiler.compileToFunctions(template) } }
}

function walk (vnode, visit) {
  if (!vnode) return
  if (Array.isArray(vnode)) return vnode.forEach(child => walk(child, visit))
  visit(vnode)
  walk(vnode.children, visit)
  if (vnode.componentOptions) walk(vnode.componentOptions.children, visit)
}
const findAll = (tree, test_) => { const found = []; walk(tree, node => { if (test_(node)) found.push(node) }); return found }

const esgotado = load('template/js/custom-js/esgotado.js')
const minimo = { __esModule: true, state: { minimo: 20, aviso: true }, loadPedidoMinimo: () => Promise.resolve() }

// Tela de pagamento (PaymentMethods) renderizada sem DOM; o aviso (PeOutOfStock) é renderizado com as props que recebeu.
const PeOutOfStock = loadVue('template/js/custom-js/components/PeOutOfStock.vue').default
const textOf = vnode => {
  let text = ''
  walk(vnode, node => {
    if (node.text) text += node.text
    if (node.data && node.data.attrs && node.data.attrs.href) text += ` [href=${node.data.attrs.href}]`
    if (node.componentOptions && node.componentOptions.tag === 'pe-out-of-stock') {
      text += ' ' + textOf(new (Vue.extend(PeOutOfStock))({ propsData: node.componentOptions.propsData })._render())
    }
  })
  return text.replace(/\s+/g, ' ').trim()
}
async function payment (subtotal, items) {
  const i18nNames = new Proxy({ __esModule: true }, { get: (target, key) => key in target ? target[key] : String(key) })
  const options = load('template/js/custom-js/js/PaymentMethods.js', {
    '@ecomplus/i18n': i18nNames,
    '@ecomplus/utils': { i18n: s => s, price: item => item.price, formatMoney: v => 'R$ ' + v.toFixed(2).replace('.', ','), $ecomConfig: { get: () => '' } },
    '@ecomplus/client': { modules: () => new Promise(() => {}) },
    '@ecomplus/shopping-cart': { __esModule: true, default: { data: { items: [] } } },
    '@ecomplus/storefront-app/src/lib/load-payment-client': { __esModule: true, default: () => Promise.resolve() },
    '@ecomplus/storefront-app/src/lib/utils': { sortApps () {} },
    '@ecomplus/storefront-app/src/components/CreditCardForm.vue': { __esModule: true, default: { render: h => h('div') } },
    '../pedido-minimo': minimo,
    '../esgotado': esgotado,
    '../components/PeOutOfStock.vue': { __esModule: true, default: PeOutOfStock }
  }, { window: { location: { hostname: 'test' } } }).default
  const { render, staticRenderFns } = compiler.compileToFunctions('<div>' + fs.readFileSync(path.join(root, 'template/js/custom-js/html/PaymentMethods.html'), 'utf8') + '</div>')
  const tree = new (Vue.extend({ ...options, render, staticRenderFns }))({
    propsData: { amount: { subtotal, total: subtotal }, cartItems: items, paymentGateways: [], canUpdateGateways: false }
  })._render()
  const hasPayment = findAll(tree, node => node.data && node.data.staticClass === 'payment').length > 0
  return textOf(tree) + (hasPayment ? ' [formas de pagamento]' : '')
}

const sacola = 'Sacola Branca Delivery M com Alça de Gorgurão - 26x17x23cm (05 unidades)| Pietro Embalagens / Preta'

test('itensEsgotados: só quantidade 0, sem brinde, e tira o "| Pietro Embalagens" do nome', () => {
  const nomes = esgotado.itensEsgotados([
    { name: sacola, quantity: 0 },
    { name: 'Caixa', quantity: 3 },
    { name: 'Brinde', quantity: 0, flags: ['freebie'] }
  ])
  assert.deepEqual([...nomes], ['Sacola Branca Delivery M com Alça de Gorgurão - 26x17x23cm (05 unidades) / Preta'])
  assert.deepEqual([...esgotado.itensEsgotados(undefined)], [])
})

test('tudo esgotou (total R$ 0): avisa o item, leva ao carrinho e some o "Necessário inserir R$ 20"', async () => {
  const out = await payment(0, [{ name: sacola, quantity: 0, price: 28.49 }])
  assert.match(out, /Ops! Sacola Branca Delivery M .* \/ Preta esgotou e saiu do seu pedido\. \[href=\/app\/#\/cart\]Voltar ao carrinho/)
  assert.doesNotMatch(out, /Necessário inserir/)
})

test('um esgotou e o resto passa do mínimo: aviso em cima e formas de pagamento liberadas', async () => {
  const out = await payment(30, [{ name: sacola, quantity: 0, price: 28.49 }, { name: 'Caixa', quantity: 2, price: 15 }])
  assert.match(out, /esgotou e saiu do seu pedido/)
  assert.match(out, /\[formas de pagamento\]/)
})

test('dois esgotados: lista os dois nomes', async () => {
  const out = await payment(30, [{ name: 'Caixa A', quantity: 0 }, { name: 'Caixa B', quantity: 0 }, { name: 'Caixa C', quantity: 2, price: 15 }])
  assert.match(out, /Estes itens esgotaram e saíram do seu pedido: Caixa A, Caixa B\./)
})

test('um esgotou e o resto fica abaixo do mínimo: aviso e o botão do mínimo continuam', async () => {
  const out = await payment(5, [{ name: sacola, quantity: 0 }, { name: 'Caixa', quantity: 1, price: 5 }])
  assert.match(out, /esgotou e saiu do seu pedido/)
  assert.match(out, /Necessário inserir R\$ 15,00/)
})

test('nada esgotado: sem aviso, tela igual a antes', async () => {
  const below = await payment(1.6, [{ name: 'Caixa', quantity: 1, price: 1.6 }])
  assert.doesNotMatch(below, /esgot/)
  assert.match(below, /Necessário inserir R\$ 18,40/)
  const ok = await payment(30, [{ name: 'Caixa', quantity: 2, price: 15 }])
  assert.doesNotMatch(ok, /esgot/)
  assert.match(ok, /\[formas de pagamento\]/)
})
