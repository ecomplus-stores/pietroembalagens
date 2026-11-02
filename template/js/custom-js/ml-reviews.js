// Avaliações do Mercado Livre na página de produto (site/alteracoes-no-site/58-avaliacoes-ml-pdp.md no ccos-ratos).
// /pe-ml-reviews.json liga/desliga e aponta para o resumo do PIMI (só produto com 3+ avaliações, catálogo fora).
// Qualquer falha, arquivo desligado ou resumo velho demais: nada aparece (sem buraco no layout).
const CONFIG = '/pe-ml-reviews.json'
const ALLOWED_SOURCE = 'https://reviews.pietroembalagens.com.br/'
const MAX_AGE_MS = 10 * 24 * 60 * 60 * 1000
const MIN_TOTAL = 3
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
