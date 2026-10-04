<template>
  <section v-if="!v2" class="pe-freight-status" aria-live="polite" aria-atomic="true">
    <p v-if="quote.status === 'idle'">Informe seu CEP para consultar as condições de frete.</p>
    <p v-else-if="quote.status === 'loading'">Atualizando o frete…</p>
    <p v-else-if="quote.status === 'error'">Não foi possível atualizar o frete. <button type="button" class="pe-text-button" @click="$emit('retry')">Tentar novamente</button></p>
    <template v-else-if="free">
      <p><strong>{{ applied ? 'Frete grátis aplicado ao pedido.' : 'Frete grátis disponível para seu CEP.' }}</strong></p>
      <template v-if="!applied">
        <p v-if="quote.selected">Sua opção de entrega atual foi mantida.</p>
        <p class="pe-freight-status__service">{{ free.label }}<span v-if="days"> · Prazo de transporte: {{ days }} {{ workingDays ? 'dias úteis' : 'dias' }}, além da preparação do pedido.</span></p>
        <button type="button" class="pe-text-button" @click="$emit('select-free')">Usar frete grátis</button>
      </template>
    </template>
    <template v-else-if="remaining > 0">
      <p>Faltam <strong>{{ formatMoney(remaining / 100) }} em produtos</strong> para atingir o mínimo do frete grátis.</p>
      <div class="pe-freight-status__track" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso para frete grátis"><span :style="{ width: progress + '%' }"></span></div>
    </template>
    <p v-else-if="quote.threshold">O valor mínimo foi atingido. Confira as modalidades disponíveis para este pedido.</p>
    <p v-else-if="!quote.selected && quote.services.length">Selecione uma opção de entrega acima.</p>
  </section>
  <section v-else class="pe-fs2-status" :class="['pe-fs2-status--' + surface, { 'pe-fs2-status--ok': ok, 'is-applied': ok && applied }]" aria-live="polite" aria-atomic="true">
    <template v-if="quote.status === 'idle'">
      <p class="pe-fs2-status__title">Seu pedido pode sair com frete grátis</p>
      <p class="pe-fs2-status__text">{{ surface === 'minicart' ? 'O valor mínimo muda por região. Informe seu CEP para ver quanto falta.' : 'Informe seu CEP para ver quanto falta.' }}</p>
      <form class="pe-fs2-zip" novalidate @submit.prevent="submitZip">
        <input v-model="zipInput" type="tel" inputmode="numeric" autocomplete="postal-code" maxlength="9" placeholder="00000-000" aria-label="CEP" :aria-invalid="zipError ? 'true' : null" @input="maskZip">
        <button type="submit">Consultar</button>
      </form>
      <p v-if="zipError" role="alert" class="pe-fs2-status__error">Informe os 8 números do CEP.</p>
    </template>
    <p v-else-if="quote.status === 'loading'" class="pe-fs2-status__text">Atualizando o frete…</p>
    <p v-else-if="quote.status === 'error'" class="pe-fs2-status__text">Não foi possível atualizar o frete. <button type="button" class="pe-text-button" @click="$emit('retry')">Tentar novamente</button></p>
    <template v-else-if="free">
      <template v-if="applied">
        <p class="pe-fs2-status__title">✓ Frete grátis aplicado</p>
        <p class="pe-fs2-status__text"><template v-if="reference">Você economizou {{ money(reference) }} de frete. </template><span v-if="date">{{ date }}</span><span v-if="date">.</span></p>
      </template>
      <template v-else>
        <p class="pe-fs2-status__title">Você atingiu o frete grátis</p>
        <button type="button" class="pe-fs2-status__use" @click="$emit('select-free')">{{ reference ? 'Usar frete grátis e economizar ' + money(reference) : 'Usar frete grátis' }}</button>
      </template>
    </template>
    <template v-else-if="remaining > 0">
      <p class="pe-fs2-status__lead">Faltam <strong>{{ money(remaining) }}</strong> para o <span class="pe-fs2-status__accent">frete grátis</span></p>
      <div class="pe-fs2-progress">
        <div class="pe-fs2-track" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" aria-label="Progresso para frete grátis"><span :style="{ width: progress + '%' }"></span></div>
        <small>{{ money(quote.threshold) }}</small>
      </div>
    </template>
    <p v-else-if="quote.threshold" class="pe-fs2-status__text">O valor mínimo foi atingido. Confira as modalidades disponíveis para este pedido.</p>
    <p v-else-if="!quote.selected && quote.services.length" class="pe-fs2-status__text">Selecione uma opção de entrega.</p>
  </section>
</template>

<script>
import { formatMoney } from '@ecomplus/utils'
import core from '../freight/core'
import { track } from '../freight/runtime'
import { deliveryText, productionDays } from '../freight/delivery-date'
export default {
  props: {
    quote: { type: Object, required: true },
    // v2 is opted into by the minicart and the cart page only; the checkout keeps the v1 block.
    v2: Boolean,
    surface: { type: String, default: 'cart' },
    items: { type: Array, default: () => [] }
  },
  data () { return { lastTracked: '', zipInput: '', zipError: false } },
  watch: {
    quote: { deep: true, immediate: true, handler (quote) {
      if (quote.status !== 'ready') return
      const state = core.isFreeDelivery(quote.selected) ? 'applied' : quote.services.some(core.isFreeDelivery) ? 'available' : 'below'
      const key = quote.key + ':' + state
      if (state !== 'below' && key !== this.lastTracked) {
        this.lastTracked = key
        track('pe_freight_' + state, { value: quote.subtotal / 100, currency: 'BRL' })
      }
    } }
  },
  computed: {
    free () { return (this.quote.services || []).find(core.isFreeDelivery) },
    applied () { return core.isFreeDelivery(this.quote.selected) },
    remaining () { return this.quote.threshold ? Math.max(0, this.quote.threshold - this.quote.subtotal) : 0 },
    progress () { return this.quote.threshold ? Math.min(100, Math.floor(this.quote.subtotal * 100 / this.quote.threshold)) : 0 },
    days () { return this.free && this.free.shipping_line.delivery_time && this.free.shipping_line.delivery_time.days },
    workingDays () { return this.free && this.free.shipping_line.delivery_time && this.free.shipping_line.delivery_time.working_days !== false },
    ok () { return this.quote.status === 'ready' && Boolean(this.free) },
    // What the shopper would pay otherwise: the selected paid service, or the cheapest paid one.
    reference () {
      const paid = service => service && !core.isPickup(service) && core.serviceCost(service) > 0
      if (paid(this.quote.selected)) return core.serviceCost(this.quote.selected)
      const costs = (this.quote.services || []).filter(paid).map(core.serviceCost)
      return costs.length ? Math.min(...costs) : 0
    },
    date () { return this.quote.selected ? deliveryText(this.quote.selected.shipping_line, productionDays(this.items)) : '' }
  },
  methods: {
    formatMoney,
    money (cents) { return formatMoney(cents / 100) },
    maskZip () {
      const digits = this.zipInput.replace(/\D/g, '').slice(0, 8)
      this.zipInput = digits.length > 5 ? digits.slice(0, 5) + '-' + digits.slice(5) : digits
      this.zipError = false
    },
    submitZip () {
      if (this.zipInput.replace(/\D/g, '').length !== 8) { this.zipError = true; return }
      this.zipError = false
      this.$emit('submit-zip', this.zipInput)
    }
  }
}
</script>

<style>
.pe-freight-status{margin:.8rem 0;padding:.75rem;border:1px solid #fd804355;border-radius:12px;background:#fffadb;color:#4b413d;font-size:.88rem;line-height:1.45}
.pe-freight-status:empty{display:none}
.pe-freight-status p{margin:0 0 .35rem}.pe-freight-status p:last-child{margin-bottom:0}
.pe-freight-status__service{font-size:.8rem}
.pe-freight-status__track{height:6px;background:#e9ddd3;border-radius:9px;overflow:hidden;margin-top:.55rem}
.pe-freight-status__track span{display:block;height:100%;background:#fd8043;transition:width .2s}
.pe-text-button{border:0;background:transparent;padding:.25rem 0;color:#874015;text-decoration:underline;font-weight:700;cursor:pointer}
.pe-text-button:focus-visible{outline:2px solid #874015;outline-offset:3px}
[data-pe-freight="on"] .shipping-calculator__free-from-value{display:none!important}
/* ===== v2 (ui: "v2"): status strip, shipping rows and page layout. Everything is under pe-fs2 so v1 never sees it. ===== */
.pe-fs2-status{background:#fff7f3;border:0 solid #fd8043;color:#000;font-size:14px;line-height:1.4;text-align:left}
.pe-fs2-status--ok{background:#eaf6ef;border-color:#1f7a45;color:#14532d}
.pe-fs2-status--minicart{padding:20px 14px;border-bottom-width:3px}
.pe-fs2-status--cart{padding:20px 14px;border-top-width:3px;border-radius:8px;margin:12px 0}
.pe-fs2-status p{margin:0}
.pe-fs2-status__title{font-size:18px;font-weight:700;line-height:1.3;color:#000}
.pe-fs2-status--ok .pe-fs2-status__title{color:#14532d}
.pe-fs2-status__text{margin-top:6px;font-size:14px;color:#333}
.pe-fs2-status--ok .pe-fs2-status__text{color:#14532d}
.pe-fs2-status__lead{font-size:18px;line-height:1.3;color:#000}
.pe-fs2-status__lead strong{font-weight:700}
.pe-fs2-status__accent{color:#874015;font-weight:700}
.pe-fs2-status__error{margin-top:6px;font-size:13px;font-weight:600;color:#b42318}
.pe-fs2-status.is-applied.pe-fs2-status--cart{padding:12px 14px;border-top-width:0}
.pe-fs2-status.is-applied.pe-fs2-status--cart .pe-fs2-status__title,.pe-fs2-status.is-applied.pe-fs2-status--cart .pe-fs2-status__text{display:inline;font-size:14px;margin:0}
.pe-fs2-status.is-applied.pe-fs2-status--cart .pe-fs2-status__title::after{content:". ";font-weight:700}
.pe-fs2-progress{display:flex;align-items:center;gap:12px;margin-top:12px}
.pe-fs2-track{flex:1;height:8px;background:#f0e2d8;border-radius:9px;overflow:hidden}
.pe-fs2-track span{display:block;height:100%;background:#fd8043;border-radius:9px;transition:width .3s ease}
.pe-fs2-progress small{font-size:12px;font-weight:700;color:#874015;white-space:nowrap}
.pe-fs2-zip{display:flex;gap:12px;margin-top:12px}
.pe-fs2-zip input{flex:1;min-width:0;height:44px;padding:0 18px;border:1px solid #e5d6cc;border-radius:50px;background:#fff;font:inherit;font-size:16px;color:#000}
.pe-fs2-zip input:focus-visible{outline:2px solid #874015;outline-offset:2px}
.pe-fs2-zip button,.pe-fs2-status__use{height:44px;padding:0 20px;border:0;border-radius:50px;font:inherit;font-size:14px;font-weight:700;color:#fff;background:#fd8043;cursor:pointer}
.pe-fs2-status__use{width:100%;margin-top:12px;background:#1f7a45}
.pe-fs2-zip button:focus-visible,.pe-fs2-status__use:focus-visible{outline:2px solid #874015;outline-offset:2px}
/* v2 shipping calculator rows (minicart line and cart options) */
.pe-fs2-calc{display:flex;flex-direction:column}
.pe-fs2-calc>.pe-fs2-status{order:-2}
.pe-fs2-calc>.pe-fs2-status.is-applied{order:1}
.pe-fs2-quiet .shipping-calculator__services::after{display:none}
.pe-fs2-line{margin:16px 0 4px}
.pe-fs2-line__main{display:flex;justify-content:space-between;gap:12px;font-size:14px;font-weight:600;line-height:1.35;color:#000}
.pe-fs2-line__main strong{flex:none;font-weight:700}
.pe-fs2-line__zip,.pe-fs2-cep{display:block;margin-top:2px;font-size:13px;font-weight:400;color:#333}
.pe-fs2-cep{margin:6px 0 12px}
.pe-fs2-link{padding:0;border:0;background:none;font:inherit;color:#874015;text-decoration:underline;cursor:pointer}
.pe-fs2-link:focus-visible{outline:2px solid #874015;outline-offset:2px}
.pe-fs2-options{display:flex;flex-direction:column;gap:12px;margin:12px 0}
.pe-fs2-option{position:relative;display:flex;align-items:center;gap:10px;margin:0;cursor:pointer;font-weight:400}
.pe-fs2-option input{position:absolute;opacity:0;pointer-events:none}
.pe-fs2-option__dot{flex:none;width:20px;height:20px;box-sizing:border-box;border:2px solid #8f8f8f;border-radius:50%;background:#fff}
.pe-fs2-option.is-active .pe-fs2-option__dot{border:6px solid #fd8043}
.pe-fs2-option.is-active.is-free .pe-fs2-option__dot{border-color:#1f7a45}
.pe-fs2-option input:focus-visible+.pe-fs2-option__dot{outline:2px solid #874015;outline-offset:2px}
.pe-fs2-option__body{display:flex;flex-direction:column;flex:1;min-width:0;line-height:1.3}
.pe-fs2-option__name{font-size:14px;color:#000}
.pe-fs2-option.is-active.is-free .pe-fs2-option__name{font-weight:700}
.pe-fs2-option__body small{font-size:12px;color:#333}
.pe-fs2-option__price{flex:none;font-size:14px;font-weight:700;color:#000}
.pe-fs2-option.is-free .pe-fs2-option__price{color:#1f7a45}
/* v2 minicart and cart page chrome */
.minicart.pe-fs2 .minicart__aside{display:flex;flex-direction:column}
.minicart.pe-fs2 .minicart__body{flex:1 1 auto;min-height:0;overflow-y:auto}
.minicart.pe-fs2 .minicart__shipping hr{margin:8px 0 0;border-top-color:#f2f2f2}
.minicart.pe-fs2 .minicart__summary{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px;font-size:14px;color:#000}
.minicart.pe-fs2 .minicart__subtotal{font-size:18px;font-weight:700}
.minicart.pe-fs2 .minicart__btn-checkout,.cart.pe-fs2 .pe-fs2-checkout{border:0;border-radius:50px;background:#fd8043;color:#fff;font-weight:700}
.minicart.pe-fs2 .minicart__btn-checkout{height:46px;font-size:16px}
.minicart.pe-fs2 .minicart__btn-cart{border:0;background:none;color:#000;font-weight:400;box-shadow:none}
.cart.pe-fs2 .pe-fs2-checkout{padding:.8rem 1rem;font-size:18px}
.cart.pe-fs2 .cart__total{font-size:18px;font-weight:700}
.pe-fs2-pay{margin:12px 0 0;text-align:center;font-size:14px;font-weight:600;color:#333}
.pe-fs2-pay b{color:#000}
.pe-fs2-pay b.pe-fs2-pay__pix{color:#874015}
</style>
