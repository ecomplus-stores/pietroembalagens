// Etiqueta "1º mais vendido" (docs/MAIS-VENDIDO.md). Lê /pe-best-sellers.json, que traz só o SKU líder de cada categoria.
// Qualquer falha, arquivo desligado, vazio ou velho demais: a etiqueta simplesmente não aparece.
const SOURCE = '/pe-best-sellers.json'
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
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
  return item && typeof item.category === 'string' && item.category ? item : null
}

export const loadBestSellers = () => {
  if (pending) return pending
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  const timeout = controller && setTimeout(() => controller.abort(), 5000)
  pending = fetch(SOURCE + '?v=' + Math.floor(Date.now() / 600000), { credentials: 'same-origin', signal: controller && controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('best-sellers')
      return response.json()
    })
    .catch(() => null)
    .then(data => {
      clearTimeout(timeout)
      return data
    })
  return pending
}
