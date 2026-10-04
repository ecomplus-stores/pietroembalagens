// Quadros personalizados da home (content/home.json -> seção "personalized-boxes").
// O histórico (produtos vistos e último termo buscado) fica só no localStorage do navegador; nada vai ao servidor.
import EcomSearch from '@ecomplus/search-engine'
import { graphs } from '@ecomplus/client'
import {
  formatMoney, img, inStock, name as getName, onPromotion, price as getPrice, recommendedIds
} from '@ecomplus/utils'
import {
  addViewed, composeBoxes, escapeHtml, installmentsOf, readTerm, readViewed, safeId, saveTerm, sortByViewed
} from './core'

const storage = (() => { try { return window.localStorage } catch (_) { return null } })()
const body = document.body

// O registro vale em todas as páginas, com a seção ligada ou não: o cliente que já navegou chega à home personalizada.
if (body && body.getAttribute('data-resource') === 'products') {
  addViewed(storage, body.getAttribute('data-resource-id'))
}
if (/^\/search\/?$/.test(window.location.pathname)) {
  saveTerm(storage, new URLSearchParams(window.location.search).get('term'))
}

const $root = document.querySelector('.pe-boxes')

const showable = item => item.available !== false && item.visible !== false && item.slug &&
  inStock(item) && getPrice(item) > 0 && Array.isArray(item.pictures) && item.pictures.length > 0

const fetchItems = (configure, size = 12) => {
  const search = new EcomSearch()
  configure(search)
  search.setPageSize(size)
  return search.fetch().then(() => search.getItems() || []).catch(() => [])
}

const fetchRelated = async viewed => {
  const lists = await Promise.all(viewed.slice(0, 2).map(id => {
    return graphs({ url: `/products/${id}/recommended.json`, axiosConfig: { timeout: 5000 } })
      .then(({ data }) => recommendedIds(data).filter(safeId))
      .catch(() => [])
  }))
  const ids = [...new Set([].concat(...lists))].filter(id => !viewed.includes(id)).slice(0, 12)
  return ids.length ? fetchItems(search => search.setProductIds(ids)) : []
}

const cardHtml = ({ title, item }) => {
  const picture = img(item, null, 'big') || img(item)
  const current = getPrice(item)
  const discount = onPromotion(item) ? Math.round(((item.base_price - current) * 100) / item.base_price) : 0
  const label = getName(item)
  return `<a class="pe-boxes__card" href="/${escapeHtml(item.slug)}" title="${escapeHtml(label)}">` +
    `<span class="pe-boxes__title">${escapeHtml(title)}</span>` +
    `<span class="pe-boxes__pic"><img src="${escapeHtml(picture && picture.url)}" alt="${escapeHtml((picture && picture.alt) || label)}" loading="lazy" decoding="async"></span>` +
    `<span class="pe-boxes__name">${escapeHtml(label)}</span>` +
    (discount > 0 ? `<span class="pe-boxes__old">${escapeHtml(formatMoney(item.base_price))}</span>` : '') +
    `<span class="pe-boxes__price">${escapeHtml(formatMoney(current))}` +
    (discount > 0 ? ` <span class="pe-boxes__off">${discount}% OFF</span>` : '') +
    `</span><span class="pe-boxes__inst" data-price="${current}"></span></a>`
}

// As parcelas dependem da configuração de pagamento da loja, que o tema carrega por conta própria (pode chegar depois
// dos quadros). Sem ela os quadros ficam sem a linha de parcelas; nada quebra.
const fillInstallments = $root => {
  const option = window.storefront && window.storefront.info && window.storefront.info.list_payments &&
    window.storefront.info.list_payments.installments_option
  if (!option) return false
  $root.querySelectorAll('.pe-boxes__inst').forEach($inst => {
    const inst = installmentsOf(Number($inst.getAttribute('data-price')), option)
    $inst.innerHTML = inst
      ? `em até ${inst.number}x de ${escapeHtml(formatMoney(inst.value))}` + (inst.interestFree ? '<br>sem juros' : '')
      : ''
  })
  return true
}

const setupArrows = $root => {
  const $track = $root.querySelector('.pe-boxes__track')
  const $prev = $root.querySelector('.pe-boxes__arrow--prev')
  const $next = $root.querySelector('.pe-boxes__arrow--next')
  const update = () => {
    const max = $track.scrollWidth - $track.clientWidth
    $prev.hidden = $track.scrollLeft < 8
    $next.hidden = max < 8 || $track.scrollLeft > max - 8
  }
  const scroll = direction => () => {
    const $card = $track.querySelector('.pe-boxes__card')
    $track.scrollBy({ left: direction * ($card ? $card.offsetWidth + 16 : $track.clientWidth / 2), behavior: 'smooth' })
  }
  $prev.addEventListener('click', scroll(-1))
  $next.addEventListener('click', scroll(1))
  $track.addEventListener('scroll', update, { passive: true })
  window.addEventListener('resize', update)
  update()
}

const render = async $root => {
  const viewed = readViewed(storage)
  const term = readTerm(storage)
  const [seen, searched, related, sales, offers, news] = await Promise.all([
    viewed.length ? fetchItems(search => search.setProductIds(viewed)) : [],
    term ? fetchItems(search => search.setSearchTerm(term), 8) : [],
    viewed.length ? fetchRelated(viewed) : [],
    fetchItems(search => search.setSortOrder('sales')),
    fetchItems(search => search.setSortOrder('offers'), 24).then(items => items.filter(onPromotion)),
    fetchItems(search => search.setSortOrder('news'))
  ])
  const boxes = composeBoxes([
    { key: 'viewed', title: 'Visto recentemente', items: sortByViewed(seen, viewed) },
    { key: 'search', title: 'Sua busca', items: searched },
    { key: 'related', title: 'Também te interessa', items: related },
    { key: 'sales', title: 'Mais vendidos', items: sales },
    { key: 'offers', title: 'Promoções', items: offers },
    { key: 'news', title: 'Novidades', items: news }
  ], showable)
  if (!boxes.length) {
    $root.hidden = true
    return
  }
  $root.querySelector('.pe-boxes__track').innerHTML = boxes.map(cardHtml).join('')
  $root.classList.add('pe-boxes--ready')
  setupArrows($root)
  if (!fillInstallments($root) && window.storefront && typeof window.storefront.on === 'function') {
    window.storefront.on('info:list_payments', () => { fillInstallments($root) })
  }
}

if ($root) render($root).catch(() => { $root.hidden = true })
