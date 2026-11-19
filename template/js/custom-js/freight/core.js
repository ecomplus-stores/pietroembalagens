// Pure rules shared by the calculator, suggestions and regression tests.
import { parseDay, orderShipping } from '../pdp-frete'
const cents = value => value !== null && value !== '' && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? Math.round(Number(value) * 100) : null
const zip = value => String(value || '').replace(/\D/g, '')
const money = item => typeof item.final_price === 'number' ? item.final_price : item.price
const subtotal = items => Math.round(items.reduce((sum, item) => sum + (Number(money(item)) || 0) * (Number(item.quantity) || 0) * 100, 0))
const serviceKey = service => service ? [service.app_id, service.service_code, service.shipping_line && service.shipping_line.from && JSON.stringify(service.shipping_line.from)].join(':') : ''
const serviceCost = service => {
  const line = service && service.shipping_line
  if (!line) return null
  return cents(line.total_price !== undefined ? line.total_price : line.price)
}
const normalizeServiceText = value => String(value || '').trim().toLowerCase()
const hasTwoDayPostingDeadline = service => {
  const carrier = normalizeServiceText(service && service.carrier)
  const serviceName = normalizeServiceText(service && [service.service_name, service.label, service.service_code].filter(Boolean).join(' '))
  return (carrier === 'jet' && /\bstandard\b/.test(serviceName)) ||
    (carrier === 'loggi' && /\bexpress\b/.test(serviceName))
}
// Correios and Jadlog: payment approved before 12h on a working day is posted the same day (head script decides the clock).
const hasSameDayCutoff = service => /correios|jadlog|jad log/.test(normalizeServiceText(service && [service.carrier, service.service_name, service.label].filter(Boolean).join(' ')))
const postsToday = () => typeof window === 'object' && window.peDeliveryDate && typeof window.peDeliveryDate.postaHoje === 'function' && window.peDeliveryDate.postaHoje()
const applyPostingDeadline = service => {
  if (service && service.shipping_line && hasSameDayCutoff(service)) {
    const posting = service.shipping_line.posting_deadline || {}
    return {
      ...service,
      pe_cutoff: true,
      shipping_line: {
        ...service.shipping_line,
        posting_deadline: { ...posting, days: posting.days === 1 && postsToday() ? 0 : posting.days, working_days: true, after_approval: true }
      }
    }
  }
  if (!hasTwoDayPostingDeadline(service) || !service.shipping_line) return service
  return {
    ...service,
    shipping_line: {
      ...service.shipping_line,
      posting_deadline: {
        ...(service.shipping_line.posting_deadline || {}),
        days: 2,
        working_days: true,
        after_approval: true
      }
    }
  }
}
const isPickup = service => Boolean(service && (service.pickup || service.is_pickup || (service.shipping_line && (service.shipping_line.pickup || service.shipping_line.is_pickup)) || /retir|pickup|pick.up|buscar na loja/i.test([service.label, service.service_code, service.shipping_line && service.shipping_line.title].join(' '))))
const isFreeDelivery = service => serviceCost(service) === 0 && !isPickup(service)
const reduceItem = item => {
  const out = {}
  ;['product_id', 'variation_id', 'sku', 'name', 'quantity', 'inventory', 'currency_id', 'currency_symbol', 'price', 'final_price', 'dimensions', 'weight', 'production_time', 'flags', 'kit_product', 'customizations'].forEach(key => {
    if (item[key] !== undefined) out[key] = item[key]
  })
  return out
}
// Match the native shipping API payload exactly; fingerprint retains more context.
const shippingItem = item => {
  const out = reduceItem(item)
  ;['production_time', 'flags', 'kit_product', 'customizations'].forEach(key => { delete out[key] })
  return out
}
const fingerprint = (items, postalCode, extra = {}) => JSON.stringify({ zip: zip(postalCode), items: items.map(reduceItem), extra })
const parseQuote = (results, skipIds = []) => {
  const services = []
  let threshold = null
  let valid = false
  ;(Array.isArray(results) ? results : []).forEach(result => {
    if (!result.validated || result.error || !result.response || skipIds.includes(result.app_id)) return
    const response = result.response
    if (!Array.isArray(response.shipping_services)) return
    valid = true
    response.shipping_services.forEach(service => {
      const candidate = applyPostingDeadline({ ...service, app_id: result.app_id })
      const cost = serviceCost(candidate)
      if (cost !== null && cost >= 0) services.push(candidate)
    })
    const value = cents(response.free_shipping_from_value)
    if (value > 0 && (threshold === null || value < threshold)) threshold = value
  })
  services.sort((a, b) => serviceCost(a) - serviceCost(b))
  return { services, threshold, valid, free: services.find(isFreeDelivery) || null }
}
const chooseService = (services, preferredKey, autoSelect = true) => {
  const preferred = services.findIndex(service => serviceKey(service) === preferredKey)
  if (preferredKey && preferred >= 0) return preferred
  // A vanished explicit choice must be chosen again, never silently substituted.
  if (preferredKey || !autoSelect) return -1
  const free = services.findIndex(isFreeDelivery)
  return free >= 0 ? free : services.findIndex(service => !isPickup(service))
}
// Carrinho, minicart e checkout: a opção que chega antes vai para o topo quando a regra da PDP (orderShipping) põe ela primeiro.
// Mais barato = preço e depois data; mais rápido = data que a cliente vê (whenText) e depois preço, como no pickShipping da PDP.
// Nada muda com frete grátis na lista, nem quando alguma opção (fora retirada) não tem data para comparar ("Até N dias").
const fastestFirst = (services, whenText, limit, now) => {
  if (services.some(isFreeDelivery)) return services
  const list = services.filter(service => !isPickup(service)).map(service => ({ service, cost: serviceCost(service) / 100, day: parseDay(whenText(service), now) }))
  if (list.length < 2 || list.some(option => option.day === null)) return services
  const cheapest = [...list].sort((a, b) => a.cost - b.cost || a.day - b.day)[0]
  const fastest = [...list].sort((a, b) => a.day - b.day || a.cost - b.cost)[0]
  if (fastest === cheapest || orderShipping({ cheapest, fastest }, limit)[0][1] !== fastest) return services
  return [fastest.service, ...services.filter(service => service !== fastest.service)]
}
const hasOptions = product => ['customizations', 'kit_composition'].some(key => Array.isArray(product[key]) && product[key].length)
const canRecommend = (product, variationId) => {
  if (!product || product.available !== true || product.visible === false || hasOptions(product) || (product.currency_id && product.currency_id !== 'BRL')) return false
  const variations = product.variations || []
  const selected = variations.length ? variations.find(v => v._id === variationId) : product
  return Boolean(selected && selected.available !== false && Number.isInteger(selected.quantity) && selected.quantity > 0)
}
const quantityFor = (gap, unitPrice, minimum, available) => {
  if (!(unitPrice > 0) || !(available > 0)) return 0
  const step = Math.max(1, Math.ceil(minimum || 1))
  const needed = Math.max(step, Math.ceil(Math.max(0, gap) / unitPrice / step) * step)
  return Math.min(needed, Math.floor(available / step) * step)
}
const rank = (a, b) => Number(b.confirmed) - Number(a.confirmed) || Number(b.completes) - Number(a.completes) || a.additional - b.additional || b.relevance - a.relevance || a.key.localeCompare(b.key)

export default { cents, zip, money, subtotal, serviceKey, serviceCost, hasTwoDayPostingDeadline, applyPostingDeadline, isPickup, isFreeDelivery, reduceItem, shippingItem, fingerprint, parseQuote, chooseService, fastestFirst, canRecommend, quantityFor, rank }
