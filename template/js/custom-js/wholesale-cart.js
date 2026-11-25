const source = 'catalogo_revenda'
const storageKey = 'pe_wholesale_visit'
const whatsapp = 'https://wa.me/551151995309'

export function isWholesaleVisit () {
  const fromCatalog = new URLSearchParams(window.location.search).get('utm_source') === source
  try {
    if (fromCatalog) window.sessionStorage.setItem(storageKey, '1')
    return fromCatalog || window.sessionStorage.getItem(storageKey) === '1'
  } catch (error) {
    return fromCatalog
  }
}

export function remainingWholesale (subtotal) {
  return Math.max(0, 70000 - Math.round((Number(subtotal) || 0) * 100)) / 100
}

export function wholesaleMessage (items) {
  const lines = items
    .filter(item => item.quantity > 0 && !(item.flags || []).includes('freebie'))
    .map(item => {
      const code = item.sku || item.product_id
      const details = [code && `cód. ${code}`, item.variation_id && `variação ${item.variation_id}`].filter(Boolean)
      return `- ${item.quantity} ${item.quantity === 1 ? 'pacote' : 'pacotes'} — ${item.name}${details.length ? ` (${details.join(', ')})` : ''}`
    })
  return lines.length ? ['Olá, Rafa! Montei este carrinho para atacado:', '', ...lines, '', 'Pode confirmar as condições, o frete e o valor final?'].join('\n') : ''
}

export function wholesaleWhatsapp (message) {
  const link = `${whatsapp}?text=${encodeURIComponent(message)}`
  return message && link.length <= 2000 ? link : ''
}
