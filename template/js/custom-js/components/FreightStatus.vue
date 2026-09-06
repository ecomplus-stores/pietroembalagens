<template>
  <section class="pe-freight-status" aria-live="polite" aria-atomic="true">
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
</template>

<script>
import { formatMoney } from '@ecomplus/utils'
import core from '../freight/core'
import { track } from '../freight/runtime'
export default {
  props: { quote: { type: Object, required: true } },
  data () { return { lastTracked: '' } },
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
    workingDays () { return this.free && this.free.shipping_line.delivery_time && this.free.shipping_line.delivery_time.working_days !== false }
  },
  methods: { formatMoney }
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
</style>
