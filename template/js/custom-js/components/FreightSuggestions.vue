<template>
  <section v-if="visible" class="pe-freight-suggestions" :class="{ 'pe-freight-suggestions--compact': compact }" aria-label="Sugestões para completar o pedido" :aria-busy="loading || Boolean(adding)">
    <h3 class="pe-freight-suggestions__title">Que tal aproveitar o frete?</h3>
    <p class="pe-freight-suggestions__intro">Escolha uma opção para completar seu pedido.</p>
    <p v-if="message" role="status" class="pe-freight-suggestions__message">{{ message }}</p>
    <article v-for="candidate in displayed" :key="candidate.key" class="pe-freight-suggestions__item">
      <a :href="productUrl(candidate)" tabindex="-1" aria-hidden="true"><img v-if="candidate.image" :src="candidate.image" alt="" width="64" height="64" loading="lazy"></a>
      <div class="pe-freight-suggestions__description">
        <small>{{ candidate.label }}</small>
        <a :href="productUrl(candidate)" class="pe-freight-suggestions__name">{{ candidate.title }}</a>
        <p>{{ candidate.quantity }} × este anúncio · <strong>+ {{ formatMoney(candidate.additional / 100) }}</strong> em produtos</p>
        <p v-if="candidate.confirmed" class="pe-freight-suggestions__effect">Frete grátis disponível nesta simulação. <span v-if="deliveryDays(candidate)">Transporte: {{ deliveryDays(candidate) }} dias{{ workingDays(candidate) ? ' úteis' : '' }}, além da preparação.</span></p>
        <p v-else-if="candidate.remaining > 0" class="pe-freight-suggestions__effect">Após adicionar, faltarão {{ formatMoney(candidate.remaining / 100) }} em produtos. Frete sujeito a novo cálculo.</p>
        <p v-else class="pe-freight-suggestions__effect">Atinge o valor mínimo. Confirme as condições no cálculo de frete.</p>
        <button type="button" class="pe-freight-suggestions__add" :disabled="Boolean(adding) || sharedBusy || loading" :aria-label="'Adicionar ' + candidate.quantity + ' × ' + candidate.title" @click="add(candidate)">{{ adding === candidate.key ? 'Adicionando…' : 'Adicionar ' + candidate.quantity + ' ×' }}</button>
      </div>
    </article>
    <p class="pe-freight-suggestions__footnote">A quantidade se refere ao anúncio completo. O total e as opções de entrega serão atualizados ao adicionar.</p>
  </section>
</template>

<script>
import ecomCart from '@ecomplus/shopping-cart'
import { formatMoney } from '@ecomplus/utils'
import core from '../freight/core'
import { runtime, enabled, track, init } from '../freight/runtime'
import { recommendations, fetchProduct, prepare, simulate } from '../freight/service'

export default {
  props: { quote: Object, compact: Boolean, active: { type: Boolean, default: true } },
  data () { return { candidates: [], loading: false, adding: '', message: '', generation: 0, updateTimer: null, destroyed: false, lastViewed: '' } },
  computed: {
    sharedBusy () { return runtime.busy },
    eligible () { return enabled() && this.active && this.quote && this.quote.status === 'ready' && this.quote.threshold > this.quote.subtotal && !this.quote.services.some(core.isFreeDelivery) },
    displayed () { return this.candidates.slice(0, this.compact ? 2 : 3) },
    visible () { return enabled() && this.active && ((this.eligible && this.displayed.length > 0) || Boolean(this.adding) || Boolean(this.message)) },
    requestKey () { return JSON.stringify([runtime.enabled, this.active, this.quote && this.quote.key, this.quote && this.quote.status, this.quote && this.quote.threshold]) }
  },
  watch: {
    requestKey: { handler () { this.schedule() }, immediate: true },
    sharedBusy (busy) { if (!busy) this.schedule() },
    visible: { handler (visible) { this.$emit('availability', visible) }, immediate: true }
  },
  methods: {
    formatMoney,
    productUrl (candidate) { return '/' + String(candidate.slug || '').replace(/^\/+/, '') + (candidate.variationId ? '?variation_id=' + encodeURIComponent(candidate.variationId) : '') },
    deliveryDays (candidate) { return candidate.free && candidate.free.shipping_line.delivery_time && candidate.free.shipping_line.delivery_time.days },
    workingDays (candidate) { return candidate.free && candidate.free.shipping_line.delivery_time && candidate.free.shipping_line.delivery_time.working_days !== false },
    schedule () {
      this.generation++
      clearTimeout(this.updateTimer)
      if (this.adding || runtime.busy) return
      this.candidates = []
      if (!this.eligible) { this.loading = false; if (this.quote && this.quote.status === 'ready') this.message = ''; return }
      this.loading = true
      this.updateTimer = setTimeout(this.load, 350)
    },
    async load () {
      const generation = this.generation
      const alive = () => !this.destroyed && generation === this.generation && this.eligible && !runtime.busy
      try {
        const cart = JSON.parse(JSON.stringify(ecomCart.data))
        const quote = JSON.parse(JSON.stringify(this.quote))
        const candidates = await recommendations(cart, quote, alive)
        if (alive()) {
          this.candidates = candidates
          const viewKey = quote.key + candidates.map(c => c.key + ':' + c.quantity).join(',')
          if (candidates.length && this.lastViewed !== viewKey) {
            this.lastViewed = viewKey
            track('pe_freight_suggestions_view', { pe_freight_surface: this.compact ? 'minicart' : 'cart', pe_freight_gap: (quote.threshold - quote.subtotal) / 100, items: candidates.slice(0, this.compact ? 2 : 3).map(c => ({ item_id: c.id, quantity: c.quantity, price: c.additional / c.quantity / 100 })) })
          }
        }
      } catch (_) { if (alive()) this.candidates = [] }
      finally { if (!this.destroyed && generation === this.generation) this.loading = false }
    },
    async add (candidate) {
      if (runtime.busy || this.adding || !this.eligible) return
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
        track('pe_freight_suggestion_add', { pe_freight_surface: this.compact ? 'minicart' : 'cart', value: refreshed.additional / 100, currency: 'BRL', items: [{ item_id: candidate.id, quantity: candidate.quantity }] })
      } catch (_) {
        this.message = 'As condições foram atualizadas. Confira as novas opções antes de adicionar.'
        track('pe_freight_suggestion_refresh', { pe_freight_surface: this.compact ? 'minicart' : 'cart' })
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
.pe-freight-suggestions__title{font-size:1.05rem;font-weight:700;margin:0 0 .25rem}
.pe-freight-suggestions__intro,.pe-freight-suggestions__footnote{font-size:.78rem;margin:0 0 .75rem;line-height:1.4}
.pe-freight-suggestions__footnote{margin:.65rem 0 0}
.pe-freight-suggestions__item{display:flex;gap:.7rem;padding:.8rem 0;border-top:1px solid #ead9c7}
.pe-freight-suggestions__item img{object-fit:contain;border-radius:8px;max-width:none}
.pe-freight-suggestions__description{min-width:0;flex:1}
.pe-freight-suggestions__description>small{font-size:.7rem;color:#705c50}
.pe-freight-suggestions__name{display:block;font-size:.85rem;line-height:1.35;font-weight:700;color:#4b413d;overflow-wrap:anywhere}
.pe-freight-suggestions__description p{margin:.3rem 0;font-size:.8rem;line-height:1.4}
.pe-freight-suggestions__description .pe-freight-suggestions__effect{font-size:.74rem}
.pe-freight-suggestions__add{background:#fd8043;color:#26170e;border:0;border-radius:8px;padding:.55rem .8rem;min-height:40px;font-size:.8rem;font-weight:700;cursor:pointer}
.pe-freight-suggestions__add:disabled{opacity:.55;cursor:wait}
.pe-freight-suggestions__add:focus-visible{outline:2px solid #874015;outline-offset:3px}
.pe-freight-suggestions__message{font-size:.8rem;font-weight:700}
.minicart__body .pe-freight-suggestions{margin:.5rem 0}.pe-freight-suggestions--compact{padding:.75rem}
</style>
