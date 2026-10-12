// Etiqueta "Nº mais vendido" (docs/MAIS-VENDIDO.md). /pe-best-sellers.json liga/desliga a etiqueta e, quando traz `source`, aponta
// para o ranking calculado pelo PIMI (SKUs mais vendidos de cada categoria, posição de 1 a 5); sem `source`, vale o que estiver nele.
// Qualquer falha, arquivo desligado, vazio ou velho demais: a etiqueta simplesmente não aparece.
const CONFIG = '/pe-best-sellers.json'
const ALLOWED_SOURCE = 'https://reviews.pietroembalagens.com.br/'
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
const MAX_RANK = 5
let pending

// Ranking velho não pode afirmar "mais vendido": passa de 3 dias sem atualizar, a etiqueta some.
export const isUsable = (data, now = Date.now()) => {
  if (!data || data.enabled !== true || !data.items || typeof data.items !== 'object') return false
  const updated = Date.parse(data.updated_at)
  return !Number.isNaN(updated) && now - updated <= MAX_AGE_MS
}

export const findBestSeller = (data, sku, now) => {
  if (!sku || !isUsable(data, now)) return null
  const item = Object.prototype.hasOwnProperty.call(data.items, sku) ? data.items[sku] : null
  const validRank = item && Number.isInteger(item.rank) && item.rank >= 1 && item.rank <= MAX_RANK
  return validRank && typeof item.category === 'string' && item.category ? item : null
}

const getJson = (url, options) => {
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeout = controller && setTimeout(() => controller.abort(), 5000)
  return fetch(url, { ...options, signal: controller && controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('best-sellers')
      return response.json()
    })
    .finally(() => clearTimeout(timeout))
}

export const loadBestSellers = () => {
  if (pending) return pending
  pending = getJson(CONFIG + '?v=' + Math.floor(Date.now() / 600000), { credentials: 'same-origin' })
    .then(config => {
      if (!config || config.enabled !== true || config.source === undefined) return config
      // Só o PIMI da Pietro: um endereço qualquer no arquivo não é buscado.
      if (typeof config.source !== 'string' || !config.source.startsWith(ALLOWED_SOURCE)) return null
      return getJson(config.source, { credentials: 'omit' }).then(ranking => ({ ...ranking, enabled: true }))
    })
    .catch(() => null)
  return pending
}
