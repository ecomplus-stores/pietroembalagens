// Avaliações do Mercado Livre na página de produto (site/alteracoes-no-site/58-avaliacoes-ml-pdp.md no ccos-ratos).
// /pe-ml-reviews.json liga/desliga e aponta para o resumo do PIMI (só produto com 3+ avaliações, catálogo fora).
// Qualquer falha, arquivo desligado ou resumo velho demais: nada aparece (sem buraco no layout).
const CONFIG = '/pe-ml-reviews.json'
const ALLOWED_SOURCE = 'https://reviews.pietroembalagens.com.br/'
const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000
const MIN_TOTAL = 3
// Avaliações das compras do site, aprovadas na tela Reviews do PIMI (site/alteracoes-no-site/63-avaliacoes-site-pdp.md).
const SITE_SOURCE = ALLOWED_SOURCE + 'api/codex/reviews/public/'
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
let pending

export const isUsable = (data, now = Date.now()) => {
  if (!data || data.enabled !== true || !data.items || typeof data.items !== 'object') return false
  const updated = Date.parse(data.updated_at)
  return !Number.isNaN(updated) && now - updated <= MAX_AGE_MS
}

const validReview = r => r && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5 &&
  typeof r.text === 'string' && r.text.trim() !== ''

export const findMlReviews = (data, sku, now) => {
  if (!sku || !isUsable(data, now)) return null
  const item = Object.prototype.hasOwnProperty.call(data.items, sku) ? data.items[sku] : null
  if (!item || !Number.isInteger(item.total) || item.total < MIN_TOTAL) return null
  if (typeof item.rating !== 'number' || item.rating < 1 || item.rating > 5) return null
  return { rating: item.rating, total: item.total, reviews: (Array.isArray(item.reviews) ? item.reviews : []).filter(validReview) }
}

export const formatRating = rating => rating.toFixed(1).replace('.', ',')

export const formatMonth = date => {
  const m = /^(\d{4})-(\d{2})/.exec(date || '')
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${MONTHS[+m[2] - 1]}/${m[1]}` : ''
}

const getJson = (url, options) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeout = controller && setTimeout(() => controller.abort(), 5000)
  return fetch(url, { ...options, signal: controller && controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('ml-reviews')
      return response.json()
    })
    .finally(() => clearTimeout(timeout))
}

export const loadMlReviews = () => {
  if (pending) return pending
  pending = getJson(CONFIG + '?v=' + Math.floor(Date.now() / 600000), { credentials: 'same-origin' })
    .then(config => {
      if (!config || config.enabled !== true) return null
      // Só o PIMI da Pietro: um endereço qualquer no arquivo não é buscado.
      if (typeof config.source !== 'string' || !config.source.startsWith(ALLOWED_SOURCE)) return null
      return getJson(config.source, { credentials: 'omit' })
        .then(summary => ({ ...summary, enabled: true }))
    })
    .catch(() => null)
  return pending
}

const siteCache = {}

// Fotos que a cliente mandou junto com a avaliação (opcionais, até 3). O PIMI só entrega as de avaliação aprovada;
// aqui só passa nome de arquivo no formato que ele grava, para o endereço da foto nunca sair do PIMI da Pietro.
const PHOTO_NAME = /^\d+-[\w-]{16}\.jpg$/
const sitePhotos = photos => (Array.isArray(photos) ? photos : [])
  .filter(name => typeof name === 'string' && PHOTO_NAME.test(name))
  .slice(0, 3)
  .map(name => SITE_SOURCE + 'foto/' + name)

// Avaliações do site aparecem a partir de 1 (decisão do Rafael, 12/11); falha = lista vazia.
export const loadSiteReviews = sku => {
  if (!sku) return Promise.resolve([])
  if (!siteCache[sku]) {
    siteCache[sku] = getJson(SITE_SOURCE + encodeURIComponent(sku) + '?limit=50', { credentials: 'omit' })
      .then(body => (body && Array.isArray(body.reviews) ? body.reviews : [])
        .filter(r => r && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5)
        .map(r => ({ rating: r.rating, text: typeof r.comment === 'string' ? r.comment : '', date: r.responded_at, source: 'site', photos: sitePhotos(r.photos) })))
      .catch(() => [])
  }
  return siteCache[sku]
}

// Junta ML (já filtrado pelo mínimo de 3) e site. Nota no topo só com 3+ no total; sem texto nem foto, nada aparece.
export const combineReviews = (ml, site) => {
  const mlTotal = ml ? ml.total : 0
  const total = mlTotal + site.length
  const reviews = site.filter(r => validReview(r) || (r.photos && r.photos.length > 0)).concat(ml ? ml.reviews : [])
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  if (!reviews.length) return null
  const sum = (ml ? ml.rating * mlTotal : 0) + site.reduce((acc, r) => acc + r.rating, 0)
  return { rating: sum / total, total, showScore: total >= MIN_TOTAL, hasMl: mlTotal > 0, hasSite: site.length > 0, reviews }
}
