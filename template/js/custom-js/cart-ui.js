// Teste "sem minicart": com "minicart": false em /pe-cart-config.json, o botão do carrinho vai direto
// para a página do carrinho e, ao adicionar um produto, aparece um aviso com o botão "Ver carrinho".
// Qualquer falha ao carregar a configuração mantém o comportamento de hoje (minicart aberto).
import ecomCart from '@ecomplus/shopping-cart'
import { img } from '@ecomplus/utils'

const state = { minicart: true }
let bucket = Math.floor(Math.random() * 100)
try {
  const saved = window.localStorage.getItem('pe-cart-bucket-v1')
  bucket = saved === null ? bucket : Number(saved)
  window.localStorage.setItem('pe-cart-bucket-v1', String(bucket))
} catch (_) {}

export const noMinicart = () => !state.minicart

const track = (event, data = {}) => {
  try {
    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event, pe_cart_ui: noMinicart() ? 'no_minicart' : 'minicart', ...data })
  } catch (_) {}
}

fetch('/pe-cart-config.json?v=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
  .then(response => {
    if (!response.ok) throw new Error('config')
    return response.json()
  })
  .then(config => {
    const percent = config.noMinicartPercent === undefined ? 100 : config.noMinicartPercent
    state.minicart = !(config.minicart === false && bucket < percent)
    if (noMinicart()) track('pe_cart_ui')
  })
  .catch(() => { state.minicart = true })

// The minicart widget listens on the button itself; stopping the event in the capture phase keeps
// that listener from running, and the link (href="/app/#/cart") does the navigation.
document.addEventListener('click', event => {
  if (state.minicart) return
  const button = event.target && event.target.closest && event.target.closest('#cart-button')
  if (button) event.stopImmediatePropagation()
}, true)

const CSS = `
.pe-cart-notice{position:fixed;z-index:1090;top:84px;right:16px;width:340px;max-width:calc(100vw - 24px);box-sizing:border-box;padding:14px 16px;background:#fff;border:1px solid #f0f0f0;border-left:4px solid #fd8043;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);color:#000;font-size:14px;line-height:1.35;opacity:0;transform:translateY(-8px);transition:opacity .2s ease,transform .2s ease}
.pe-cart-notice.is-open{opacity:1;transform:none}
.pe-cart-notice[hidden]{display:none}
.pe-cart-notice__head{display:flex;align-items:center;gap:10px}
.pe-cart-notice__icon{flex:none;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#fd8043;color:#fff;font-size:13px;font-weight:700}
.pe-cart-notice__title{flex:1;font-size:15px;font-weight:700}
.pe-cart-notice__close{flex:none;width:28px;height:28px;padding:0;border:0;background:none;font-size:22px;line-height:1;color:#777;cursor:pointer}
.pe-cart-notice__body{display:flex;align-items:center;gap:10px;margin-top:10px}
.pe-cart-notice__body img{flex:none;width:48px;height:48px;object-fit:contain;border-radius:6px;background:#f7f7f7}
.pe-cart-notice__name{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;color:#333;overflow-wrap:anywhere}
.pe-cart-notice__actions{display:flex;align-items:center;gap:14px;margin-top:12px}
.pe-cart-notice__go{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 20px;border-radius:50px;background:#fd8043;color:#fff!important;font-size:14px;font-weight:700;text-decoration:none!important}
.pe-cart-notice__keep{padding:0;border:0;background:none;font:inherit;font-size:13px;color:#333;text-decoration:underline;cursor:pointer}
.pe-cart-notice__close:focus-visible,.pe-cart-notice__go:focus-visible,.pe-cart-notice__keep:focus-visible{outline:2px solid #874015;outline-offset:2px}
@media (max-width:575px){.pe-cart-notice{top:64px;left:12px;right:12px;width:auto}}
@media (prefers-reduced-motion:reduce){.pe-cart-notice{transition:none}}
`

let $notice
let hideTimer
let batchTimer
let batch = []

const build = () => {
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  $notice = document.createElement('div')
  $notice.className = 'pe-cart-notice'
  $notice.setAttribute('role', 'status')
  $notice.setAttribute('aria-live', 'polite')
  $notice.hidden = true
  $notice.innerHTML = '<div class="pe-cart-notice__head"><span class="pe-cart-notice__icon" aria-hidden="true">✓</span>' +
    '<strong class="pe-cart-notice__title"></strong><button type="button" class="pe-cart-notice__close" aria-label="Fechar aviso">×</button></div>' +
    '<div class="pe-cart-notice__body"><img alt="" hidden><p class="pe-cart-notice__name"></p></div>' +
    '<div class="pe-cart-notice__actions"><a class="pe-cart-notice__go" href="/app/#/cart">Ver carrinho</a>' +
    '<button type="button" class="pe-cart-notice__keep">Continuar comprando</button></div>'
  document.body.appendChild($notice)
  $notice.querySelector('.pe-cart-notice__close').addEventListener('click', () => hide())
  $notice.querySelector('.pe-cart-notice__keep').addEventListener('click', () => { track('pe_cart_notice_click', { pe_cart_action: 'keep' }); hide() })
  $notice.querySelector('.pe-cart-notice__go').addEventListener('click', () => track('pe_cart_notice_click', { pe_cart_action: 'go' }))
  $notice.addEventListener('mouseenter', () => clearTimeout(hideTimer))
  $notice.addEventListener('mouseleave', () => schedule())
  document.addEventListener('keydown', event => { if (event.key === 'Escape') hide() })
}

const hide = () => {
  clearTimeout(hideTimer)
  if (!$notice) return
  $notice.classList.remove('is-open')
  setTimeout(() => { if (!$notice.classList.contains('is-open')) $notice.hidden = true }, 220)
}
const schedule = () => {
  clearTimeout(hideTimer)
  hideTimer = setTimeout(hide, 7000)
}

const show = items => {
  if (!$notice) build()
  const names = items.map(item => item.name).filter(Boolean)
  const count = new Set(names).size
  $notice.querySelector('.pe-cart-notice__title').textContent = count > 1 ? count + ' produtos adicionados ao carrinho' : 'Produto adicionado ao carrinho'
  $notice.querySelector('.pe-cart-notice__name').textContent = count > 1 ? names.slice(0, 2).join(' · ') + (count > 2 ? ' e mais ' + (count - 2) : '') : (names[0] || '')
  const $image = $notice.querySelector('img')
  let url
  try { const picture = count === 1 && img(items[0], null, 'small'); url = picture && picture.url } catch (_) {}
  $image.hidden = !url
  if (url) $image.src = url
  $notice.hidden = false
  // next frame so the transition runs from the hidden state
  requestAnimationFrame(() => $notice.classList.add('is-open'))
  schedule()
  track('pe_cart_notice_view', { pe_cart_count: count })
}

// Cart page and checkout already show the cart itself.
const insideCartFlow = () => window.location.pathname.indexOf('/app') === 0 && /^#\/(cart|checkout)/.test(window.location.hash)

ecomCart.on('addItem', ({ item }) => {
  if (state.minicart || !item || insideCartFlow()) return
  // Several lines added together (e.g. "Compre junto") become one notice.
  batch.push(item)
  clearTimeout(batchTimer)
  batchTimer = setTimeout(() => { const items = batch; batch = []; show(items) }, 350)
})
