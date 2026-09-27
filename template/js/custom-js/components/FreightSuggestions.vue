<template>
  <section v-if="visible" class="pe-freight-suggestions" :class="{ 'pe-freight-suggestions--compact': compact }" aria-label="Sugestões para ganhar frete grátis" :aria-busy="loading || Boolean(adding)">
    <h3 v-if="gap > 0" class="pe-freight-suggestions__title">Faltam <strong>{{ formatMoney(gap / 100) }}</strong> para o <span class="pe-freight-suggestions__badge">frete grátis</span></h3>
    <h3 v-else class="pe-freight-suggestions__title">Que tal aproveitar o <span class="pe-freight-suggestions__badge">frete grátis</span>?</h3>
    <div v-if="gap > 0" class="pe-freight-suggestions__track" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso para o frete grátis"><span :style="{ width: progress + '%' }"></span></div>
    <p v-if="gap > 0" class="pe-freight-suggestions__intro">Seu pedido está em {{ formatMoney(quote.subtotal / 100) }}. Adicione uma das opções abaixo e complete o mínimo de {{ formatMoney(threshold / 100) }}.</p>
    <p v-if="message" role="status" class="pe-freight-suggestions__message">{{ message }}</p>
    <article v-for="candidate in displayed" :key="candidate.key" class="pe-freight-suggestions__item">
      <a :href="productUrl(candidate)" tabindex="-1" aria-hidden="true" @click="trackClick(candidate, 'image')" @auxclick.middle="trackClick(candidate, 'image')"><img v-if="candidate.image" :src="candidate.image" alt="" width="64" height="64" loading="lazy"></a>
      <div class="pe-freight-suggestions__description">
        <small>{{ candidate.label }}</small>
        <a :href="productUrl(candidate)" class="pe-freight-suggestions__name" @click="trackClick(candidate, 'name')" @auxclick.middle="trackClick(candidate, 'name')">{{ candidate.title }}</a>
        <p>{{ candidate.quantity }} × este anúncio · <strong>+ {{ formatMoney(candidate.additional / 100) }}</strong> em produtos</p>
        <p v-if="candidate.confirmed" class="pe-freight-suggestions__effect pe-freight-suggestions__effect--free">✓ Frete grátis confirmado<span v-if="deliveryDays(candidate)"> · transporte em {{ deliveryDays(candidate) }} dias{{ workingDays(candidate) ? ' úteis' : '' }} após a postagem</span></p>
        <p v-else-if="candidate.remaining > 0" class="pe-freight-suggestions__effect">Ainda faltarão {{ formatMoney(candidate.remaining / 100) }} depois de adicionar.</p>
        <p v-else class="pe-freight-suggestions__effect">Atinge o mínimo do frete grátis{{ loading ? ' · conferindo a entrega…' : '. Confira as condições no cálculo de frete.' }}</p>
        <button type="button" class="pe-freight-suggestions__add" :disabled="Boolean(adding) || sharedBusy" :aria-label="'Adicionar ' + candidate.quantity + ' × ' + candidate.title" @click="add(candidate)">{{ adding === candidate.key ? 'Adicionando…' : 'Adicionar ' + candidate.quantity + ' ×' }}</button>
      </div>
    </article>
    <p class="pe-freight-suggestions__footnote">A quantidade se refere ao anúncio completo. O total e as opções de entrega serão atualizados ao adicionar.</p>
  </section>
</template>

<script>
import ecomCart from '@ecomplus/shopping-cart'
import { formatMoney } from '@ecomplus/utils'
import core from '../freight/core'
import { runtime, enabled, track, init, readSuggestions, saveSuggestions } from '../freight/runtime'
import { recommendations, fetchProduct, prepare, simulate } from '../freight/service'

// Stored suggestions keep only what the template and the click path use.
const slim = ({ product, parsed, items, free, ...rest }) => ({ ...rest, free: free ? { shipping_line: { delivery_time: free.shipping_line.delivery_time } } : null })

export default {
  props: { quote: Object, compact: Boolean, active: { type: Boolean, default: true } },
  data () { return { candidates: [], loading: false, adding: '', message: '', generation: 0, updateTimer: null, destroyed: false, lastViewed: '', cachedThreshold: null } },
  computed: {
    sharedBusy () { return runtime.busy },
    eligible () { return enabled() && this.active && this.quote && this.quote.status === 'ready' && this.quote.threshold > this.quote.subtotal && !this.quote.services.some(core.isFreeDelivery) },
    // While the calculator is still answering, a stored answer for the same cart and CEP is shown right away.
    threshold () { return this.quote && this.quote.status === 'ready' ? this.quote.threshold : this.cachedThreshold },
    gap () { return this.quote && this.threshold ? Math.max(0, this.threshold - this.quote.subtotal) : 0 },
    progress () { return this.gap > 0 ? Math.min(100, Math.floor(this.quote.subtotal * 100 / this.threshold)) : 0 },
    previewing () { return enabled() && this.active && Boolean(this.quote) && this.quote.status === 'loading' && this.gap > 0 },
    displayed () { return this.candidates.slice(0, this.compact ? 2 : 3) },
    visible () { return enabled() && this.active && (((this.eligible || this.previewing) && this.displayed.length > 0) || Boolean(this.adding) || Boolean(this.message)) },
    requestKey () { return JSON.stringify([runtime.enabled, this.active, this.quote && this.quote.key, this.quote && this.quote.status, this.quote && this.quote.threshold]) }
  },
  watch: {
    requestKey: { handler () { this.schedule() }, immediate: true },
    sharedBusy (busy) { if (!busy) this.schedule() },
    visible: { handler (visible) { this.$emit('availability', visible) }, immediate: true }
  },
  methods: {
    formatMoney,
    eventData (candidate, action) {
      return {
        pe_freight_surface: this.compact ? 'minicart' : 'cart',
        pe_freight_action: action,
        pe_freight_product_id: candidate.id,
        pe_freight_variation_id: candidate.variationId || '',
        pe_freight_quantity: candidate.quantity,
        pe_freight_position: this.displayed.findIndex(item => item.key === candidate.key) + 1,
        pe_freight_gap: Math.max(0, this.quote.threshold - this.quote.subtotal) / 100,
        value: candidate.additional / 100, currency: 'BRL',
        items: [{ item_id: candidate.id, item_variant: candidate.variationId || '', quantity: candidate.quantity, price: candidate.additional / candidate.quantity / 100, item_list_id: this.compact ? 'pe_freight_minicart' : 'pe_freight_cart' }]
      }
    },
    trackClick (candidate, action) {
      if (this.active && enabled()) track('pe_freight_suggestion_click', this.eventData(candidate, action))
    },
    trackView (candidates) {
      const viewKey = this.quote.key + candidates.map(c => c.key + ':' + c.quantity).join(',')
      if (candidates.length && this.lastViewed !== viewKey) {
        this.lastViewed = viewKey
        track('pe_freight_suggestions_view', { pe_freight_surface: this.compact ? 'minicart' : 'cart', pe_freight_gap: (this.quote.threshold - this.quote.subtotal) / 100, items: candidates.slice(0, this.compact ? 2 : 3).map(c => ({ item_id: c.id, quantity: c.quantity, price: c.additional / c.quantity / 100 })) })
      }
    },
    productUrl (candidate) { return '/' + String(candidate.slug || '').replace(/^\/+/, '') + (candidate.variationId ? '?variation_id=' + encodeURIComponent(candidate.variationId) : '') },
    deliveryDays (candidate) { return candidate.free && candidate.free.shipping_line.delivery_time && candidate.free.shipping_line.delivery_time.days },
    workingDays (candidate) { return candidate.free && candidate.free.shipping_line.delivery_time && candidate.free.shipping_line.delivery_time.working_days !== false },
    schedule () {
      this.generation++
      clearTimeout(this.updateTimer)
      if (this.adding || runtime.busy) return
      const ready = Boolean(this.quote) && this.quote.status === 'ready'
      const stored = this.quote ? readSuggestions(this.quote.key) : null
      this.cachedThreshold = stored ? stored.threshold : null
      if (stored && (this.quote.status === 'loading' || (this.eligible && stored.threshold === this.quote.threshold))) {
        this.candidates = stored.candidates
        this.loading = false
        if (ready) this.trackView(stored.candidates)
        return
      }
      this.candidates = []
      if (!this.eligible) { this.loading = false; if (ready) this.message = ''; return }
      this.loading = true
      this.updateTimer = setTimeout(this.load, 50)
    },
    async load () {
      const generation = this.generation
      const alive = () => !this.destroyed && generation === this.generation && this.eligible && !runtime.busy
      try {
        const cart = JSON.parse(JSON.stringify(ecomCart.data))
        const quote = JSON.parse(JSON.stringify(this.quote))
        const candidates = await recommendations(cart, quote, alive, partial => { if (alive()) this.candidates = partial })
        if (alive()) {
          this.candidates = candidates
          saveSuggestions({ key: quote.key, threshold: quote.threshold, at: Date.now(), candidates: candidates.map(slim) })
          this.trackView(candidates)
        }
      } catch (_) { if (alive()) this.candidates = [] }
      finally { if (!this.destroyed && generation === this.generation) this.loading = false }
    },
    async add (candidate) {
      if (runtime.busy || this.adding || !this.eligible) return
      this.trackClick(candidate, 'add')
      runtime.busy = true
      this.adding = candidate.key
      this.message = ''
      const cartKey = core.fingerprint(ecomCart.data.items, this.quote.zip)
      const quoteKey = this.quote.key
      const current = () => !this.destroyed && enabled() && this.active && this.quote.status === 'ready' && this.quote.key === quoteKey && core.fingerprint(ecomCart.data.items, this.quote.zip) === cartKey
      try {
        const product = await fetchProduct(candidate.id, true)
        if (!current()) throw new Error('changed')
        let refreshed = prepare(candidate, product, ecomCart.data, this.quote, candidate.quantity)
        if (!refreshed || refreshed.additional !== candidate.additional || refreshed.title !== candidate.title) throw new Error('changed')
        if (candidate.confirmed) {
          refreshed = await simulate(refreshed, this.quote)
          if (!refreshed.confirmed) throw new Error('changed')
        }
        if (!current()) throw new Error('changed')
        const before = core.subtotal(ecomCart.data.items)
        const added = ecomCart.addItem(refreshed.parsed)
        if (!added || core.subtotal(ecomCart.data.items) - before !== refreshed.additional) throw new Error('addition')
        this.message = 'Produto adicionado. Atualizando o total e o frete.'
        track('pe_freight_suggestion_add', this.eventData(refreshed, 'add'))
      } catch (_) {
        this.message = 'As condições foram atualizadas. Confira as novas opções antes de adicionar.'
        track('pe_freight_suggestion_refresh', this.eventData(candidate, 'add'))
      } finally {
        this.adding = ''
        runtime.busy = false
        this.schedule()
      }
    }
  },
  mounted () { init() },
  beforeDestroy () { this.destroyed = true; this.generation++; clearTimeout(this.updateTimer) }
}
</script>

<style>
.pe-freight-suggestions{margin:1rem 0;padding:1rem;background:#fffadb;border:1px solid #ead9c7;border-radius:12px;color:#4b413d;text-align:left}
.pe-freight-suggestions__title{font-size:1.15rem;font-weight:700;margin:0 0 .5rem;line-height:1.35}
.pe-freight-suggestions__badge{display:inline-block;background:#fd8043;color:#26170e;padding:.05rem .45rem;border-radius:6px;text-transform:uppercase;letter-spacing:.02em;font-size:.9em;white-space:nowrap}
.pe-freight-suggestions__track{height:8px;background:#e9ddd3;border-radius:9px;overflow:hidden;margin:0 0 .5rem}
.pe-freight-suggestions__track span{display:block;height:100%;background:#fd8043;transition:width .2s}
.pe-freight-suggestions__intro,.pe-freight-suggestions__footnote{font-size:.78rem;margin:0 0 .75rem;line-height:1.4}
.pe-freight-suggestions__footnote{margin:.65rem 0 0}
.pe-freight-suggestions__item{display:flex;gap:.7rem;padding:.8rem 0;border-top:1px solid #ead9c7}
.pe-freight-suggestions__item img{object-fit:contain;border-radius:8px;max-width:none}
.pe-freight-suggestions__description{min-width:0;flex:1}
.pe-freight-suggestions__description>small{font-size:.7rem;color:#705c50}
.pe-freight-suggestions__name{display:block;font-size:.85rem;line-height:1.35;font-weight:700;color:#4b413d;overflow-wrap:anywhere}
.pe-freight-suggestions__description p{margin:.3rem 0;font-size:.8rem;line-height:1.4}
.pe-freight-suggestions__description .pe-freight-suggestions__effect{font-size:.74rem}
.pe-freight-suggestions__effect--free{color:#874015;font-weight:700}
.pe-freight-suggestions__add{background:#fd8043;color:#26170e;border:0;border-radius:8px;padding:.55rem .8rem;min-height:40px;font-size:.8rem;font-weight:700;cursor:pointer}
.pe-freight-suggestions__add:disabled{opacity:.55;cursor:wait}
.pe-freight-suggestions__add:focus-visible{outline:2px solid #874015;outline-offset:3px}
.pe-freight-suggestions__message{font-size:.8rem;font-weight:700}
.minicart__body .pe-freight-suggestions{margin:.5rem 0}.pe-freight-suggestions--compact{padding:.75rem}
.pe-freight-suggestions--compact .pe-freight-suggestions__title{font-size:1rem}
</style>
