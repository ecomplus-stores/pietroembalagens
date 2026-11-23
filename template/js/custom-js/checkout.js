import './passport-oauth'
import router from '@ecomplus/storefront-app/src/router'
// Add your custom JavaScript for checkout here.

// T115: cada deploy apaga os arquivos (chunks) da versão anterior. A tela de confirmação só era baixada depois
// de o pedido ser criado; quem abriu o checkout antes de um deploy ficava parado na etapa de pagamento, sem QR.
// 1) Baixa a confirmação assim que a página carrega. 2) Se mesmo assim falhar, manda para o pagamento do pedido.
const confirmationRoute = router.options.routes.find(({ name }) => name === 'confirmation')
const preloadConfirmation = () => {
  Promise.resolve().then(confirmationRoute.component).catch(() => {})
}
if (document.readyState === 'complete') {
  preloadConfirmation()
} else {
  window.addEventListener('load', preloadConfirmation)
}

let pendingRoute
let isFallbackDone = false
router.beforeEach((to, from, next) => {
  pendingRoute = to
  next()
})
router.onError(err => {
  const to = pendingRoute
  if (isFallbackDone || !to || to.name !== 'confirmation' || !/ChunkLoadError|Loading (CSS )?chunk/.test(`${err && err.name} ${err && err.message}`)) {
    return
  }
  isFallbackDone = true
  const store = router.app && router.app.$store
  const order = ((store && store.getters.orders) || []).find(({ _id }) => _id === to.params.id)
  const transaction = order && (order.transactions || []).find(({ payment_link: link }) => /^https:\/\//.test(link || ''))
  ;(window.dataLayer = window.dataLayer || []).push({
    event: 'pe_chunk_fallback',
    pe_order_number: order && order.number,
    pe_fallback: transaction ? 'payment_link' : 'reload'
  })
  // T84: a ponte do pixel PIMI (content/code.json) registra a compra antes de a página sair.
  try {
    window.dispatchEvent(new window.CustomEvent('pe:confirmation-chunk-error', { detail: { order, route: to } }))
  } catch (e) {}
  if (transaction) {
    window.location.href = transaction.payment_link
    return
  }
  try {
    if (sessionStorage.getItem('pe_chunk_reload') === to.params.id) return
    sessionStorage.setItem('pe_chunk_reload', to.params.id)
  } catch (e) {}
  window.location.hash = router.resolve(to).href
  window.location.reload()
})
