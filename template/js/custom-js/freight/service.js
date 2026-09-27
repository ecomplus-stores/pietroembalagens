import { store, graphs, modules } from '@ecomplus/client'
import { price, img, recommendedIds } from '@ecomplus/utils'
import ecomCart from '@ecomplus/shopping-cart'
import core from './core'
import { runtime } from './runtime'

const catalog = new Map()
const histories = new Map()
const clone = value => JSON.parse(JSON.stringify(value))
const productKey = (id, variation) => `${id}:${variation || ''}`
const safeId = value => /^[a-f0-9]{24}$/i.test(value || '')

// Concurrent callers share one request. Only the click path (fresh) bypasses the edge cache.
export function fetchProduct (id, fresh = false) {
  if (!safeId(id)) return Promise.reject(new Error('invalid-product'))
  const cached = catalog.get(id)
  if (!fresh && cached && Date.now() - cached.at < 30000) return cached.promise
  const params = fresh ? { pe_fresh: Date.now() } : {}
  const entry = { at: Date.now(), promise: store({ url: `/products/${id}.json`, axiosConfig: { timeout: 8000, params } }).then(response => response.data) }
  catalog.set(id, entry)
  entry.promise.catch(() => { if (catalog.get(id) === entry) catalog.delete(id) })
  return entry.promise
}

async function history (id) {
  const cached = histories.get(id)
  if (cached && Date.now() - cached.at < 300000) return cached.ids
  try {
    const response = await graphs({ url: `/products/${id}/recommended.json`, axiosConfig: { timeout: 5000 } })
    const ids = recommendedIds(response.data).filter(safeId)
    histories.set(id, { at: Date.now(), ids })
    return ids
  } catch (_) { return [] }
}

const sourcesOf = items => [...items].filter(item => item.quantity > 0 && !(item.flags || []).includes('freebie'))
  .sort((a, b) => b.quantity * price(b) - a.quantity * price(a)).slice(0, 4)

function collector () {
  const candidates = new Map()
  const excluded = runtime.config.excludedProductIds || []
  const add = (id, variationId, relation, relevance) => {
    if (!safeId(id) || excluded.includes(id)) return
    const key = productKey(id, variationId)
    if (!candidates.has(key)) candidates.set(key, { id, variationId, key, relation, relevance })
  }
  return { candidates, add }
}

// Cart lines are known at once: no lookup is needed to name them.
export function ownDescriptors (items) {
  const { candidates, add } = collector()
  sourcesOf(items).forEach(item => add(item.product_id, item.variation_id, 'same', 3))
  return [...candidates.values()]
}

export async function discover (items) {
  const { candidates, add } = collector()
  const sources = sourcesOf(items)
  sources.forEach(item => add(item.product_id, item.variation_id, 'same', 3))
  ;(runtime.config.curatedPairs || []).forEach(pair => {
    if (sources.some(item => item.product_id === pair.sourceId && (!pair.sourceVariationId || pair.sourceVariationId === item.variation_id))) {
      add(pair.targetId, pair.variationId, 'curated', 4)
    }
  })
  const results = await Promise.all(sources.map(async item => {
    const [product, past] = await Promise.all([fetchProduct(item.product_id).catch(() => null), history(item.product_id)])
    let related = []
    ;((product && product.related_products) || []).forEach(group => { related = related.concat(group.product_ids || []) })
    return [...related, ...past]
  }))
  results.forEach(ids => ids.forEach(id => {
    if (!items.some(item => item.product_id === id)) add(id, null, 'related', 1)
  }))
  return [...candidates.values()].slice(0, Math.max(1, Math.min(24, runtime.config.maxCandidates || 12)))
}

// Rehearse the native cart operation in an isolated cart with no storage/listeners.
// Never change the shopper's basket while evaluating a suggestion.
export function prepare (descriptor, product, cart, quote, forcedQuantity) {
  if (!core.canRecommend(product, descriptor.variationId)) return null
  const variation = descriptor.variationId && (product.variations || []).find(v => v._id === descriptor.variationId)
  const sellable = variation ? { ...product, ...variation } : product
  if (sellable.available === false || core.canRecommend(product, descriptor.variationId) === false) return null
  const unitPrice = price(sellable)
  if (!(unitPrice > 0)) return null
  const matching = cart.items.filter(item => item.product_id === product._id && (item.variation_id || '') === (descriptor.variationId || ''))
  // A kit, gift or customized line must never merge with an ordinary suggestion.
  if (matching.some(item => item.kit_product || item.keep_item_quantity || (item.customizations || []).length || (item.flags || []).length)) return null
  if (matching.length > 1 || matching.some(item => core.cents(price(item)) !== core.cents(unitPrice))) return null
  const existingQuantity = matching.reduce((total, item) => total + item.quantity, 0)
  const available = sellable.quantity - existingQuantity
  const gap = Math.max(0, quote.threshold - quote.subtotal)
  // Quantity cap is a browsing guard, not a price threshold: never propose hundreds of packs.
  const quantityLimit = Math.max(1, Math.min(20, runtime.config.maxAdditionalQuantity || 5))
  const minimum = Math.max(1, Math.ceil(sellable.min_quantity || 1))
  const quantity = forcedQuantity === undefined
    ? core.quantityFor(gap, core.cents(unitPrice), minimum, Math.min(available, quantityLimit))
    : forcedQuantity
  if (!Number.isInteger(quantity) || quantity < minimum || quantity > available || quantity > quantityLimit) return null
  const parsed = ecomCart.parseProduct(clone(product), descriptor.variationId, quantity)
  if (!parsed || parsed.quantity !== quantity) return null
  parsed.price = unitPrice
  parsed.final_price = unitPrice
  const simulation = new ecomCart.Constructor(ecomCart.storeId, null, null)
  simulation.data = clone(cart)
  const added = simulation.addItem(clone(parsed), false)
  if (!added || added.quantity !== existingQuantity + quantity) return null
  const nextSubtotal = core.subtotal(simulation.data.items)
  const additional = nextSubtotal - core.subtotal(cart.items)
  if (!(additional > 0)) return null
  const picture = img(parsed, null, 'small')
  return {
    ...descriptor, product, parsed, quantity, additional, nextSubtotal,
    items: simulation.data.items, confirmed: false,
    completes: nextSubtotal >= quote.threshold,
    remaining: Math.max(0, quote.threshold - nextSubtotal),
    title: parsed.name || product.name, image: picture && picture.url,
    slug: product.slug, label: descriptor.relation === 'same' ? 'Mais do item escolhido' : descriptor.relation === 'curated' ? 'Complemento cadastrado' : 'Outra opção para seu pedido'
  }
}

export async function simulate (candidate, quote) {
  const response = await modules({
    url: quote.url || '/calculate_shipping.json', method: 'POST', storeId: ecomCart.storeId,
    data: { ...clone(quote.request), items: candidate.items.map(core.shippingItem), subtotal: candidate.nextSubtotal / 100 },
    axiosConfig: { timeout: 10000 }
  })
  const parsed = core.parseQuote(response.data.result, quote.skipIds)
  return { ...candidate, confirmed: Boolean(parsed.free), free: parsed.free, simulatedAt: Date.now(), completes: Boolean(parsed.free) }
}

// Progressive: cart lines first, then related products, then shipping confirmations.
// `onUpdate` receives the ranked list every time it improves; the resolved value is the final list.
export async function recommendations (cart, quote, alive, onUpdate = () => {}) {
  const prepared = new Map()
  const simulations = new Map()
  const limit = Math.max(1, Math.min(3, runtime.config.maxSimulations || 3))
  const ranked = () => [...prepared.values()].sort(core.rank)
  const emit = () => { if (alive()) onUpdate(ranked()) }
  const settle = descriptor => fetchProduct(descriptor.id)
    .then(product => prepare(descriptor, product, cart, quote)).catch(() => null)
    .then(candidate => { if (candidate) prepared.set(candidate.key, candidate) })
  // Quotation calls are bounded by `limit`; each confirmation refreshes the list as soon as it lands.
  const confirm = candidate => {
    if (!candidate || !candidate.completes || simulations.has(candidate.key) || simulations.size >= limit || !alive()) return
    simulations.set(candidate.key, simulate(candidate, quote)
      .catch(() => ({ ...candidate, completes: false, uncertain: true }))
      .then(result => { if (prepared.has(result.key)) prepared.set(result.key, result); emit() }))
  }
  const own = ownDescriptors(cart.items)
  await Promise.all(own.map(settle))
  if (!alive()) return []
  emit()
  confirm(ranked()[0])
  const others = (await discover(cart.items)).filter(descriptor => !own.some(known => known.key === descriptor.key))
  await Promise.all(others.map(settle))
  if (!alive()) return []
  emit()
  ranked().slice(0, limit).forEach(confirm)
  await Promise.all(simulations.values())
  return alive() ? ranked() : []
}
