// Delivery wording for the v2 UI. The business-day rule and the holiday list live only in
// content/code.json (html_head), which exposes them as window.peDeliveryDate.
// Same sum the native ShippingLine uses: posting + transport + production days.
export function deliveryDays (line, productionDays = 0) {
  if (!line) return null
  const posting = line.posting_deadline
  const transport = line.delivery_time
  if (!posting && !transport) return null
  const days = (posting && posting.days ? posting.days : 0) + (transport && transport.days ? transport.days : 0) + (productionDays || 0)
  const working = Boolean((posting && posting.working_days) || (transport && transport.working_days))
  return { days, working }
}

export function productionDays (items) {
  let max = 0
  ;(items || []).forEach(item => {
    if (item.quantity && item.production_time) {
      const { days, cumulative } = item.production_time
      const value = cumulative ? days * item.quantity : days
      if (value > max) max = value
    }
  })
  return max
}

// "Chega até 13/10 (ter)". Calendar days keep the plain "Até N dias" wording of the site today.
// Without the head script the text is a lone "N dias úteis" node, which that script converts later.
export function deliveryText (line, production = 0) {
  const info = deliveryDays(line, production)
  if (!info || !(info.days > 0)) return ''
  const shared = typeof window === 'object' && window.peDeliveryDate
  if (!info.working) return `Até ${info.days} ${info.days === 1 ? 'dia' : 'dias'}`
  if (shared && typeof shared.textoData === 'function') return shared.textoData(info.days)
  return `${info.days} ${info.days === 1 ? 'dia útil' : 'dias úteis'}`
}
