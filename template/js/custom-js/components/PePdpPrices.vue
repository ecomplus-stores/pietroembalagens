<template>
  <div class="pe-pdp-prices">
    <div
      v-if="offPercent > 0"
      class="pe-pdp-prices__from"
    >
      <slot name="from"/>
      <s>{{ formatMoney(comparePrice) }}</s>
    </div>
    <small
      v-if="hasVariedPrices"
      class="pe-pdp-prices__varied"
    >
      a partir de
    </small>
    <div class="pe-pdp-prices__row">
      <span class="pe-pdp-prices__main">
        R$ {{ mainParts[0] }}<span class="pe-pdp-prices__cents">{{ mainParts[1] }}</span>
      </span>
      <span
        v-if="offPercent > 0"
        class="pe-pdp-prices__tag"
      >{{ offPercent }}% OFF</span>
      <span
        v-if="priceWithDiscount"
        class="pe-pdp-prices__pix"
      >no Pix</span>
    </div>
    <div
      v-if="installmentsNumber > 1 && installmentValue"
      class="pe-pdp-prices__inst"
    >
      <template v-if="priceWithDiscount">ou {{ formatMoney(price) }} em </template>
      <strong>{{ installmentsNumber }}x de {{ formatMoney(installmentValue) }}<template v-if="!monthlyInterest"> sem juros</template></strong>
    </div>
    <div
      v-else-if="priceWithDiscount"
      class="pe-pdp-prices__inst"
    >
      ou {{ formatMoney(price) }} em outros meios
    </div>
    <div
      v-if="earnPointsFactor > 0 && !(pointsMinPrice > price)"
      class="pe-pdp-prices__points"
    >
      <i class="i-check-circle"></i>
      {{ i19youEarn }} +{{ (earnPointsFactor * price).toFixed(1) }} <em>{{ pointsProgramName }}</em>
    </div>
  </div>
</template>

<script>
// Preço da página de produto no modelo do Mercado Livre (site/alteracoes-no-site/26-pdp-preco-ml.md).
// Mesmas contas e regras do card (PeCardPrices, que herda o APrices da loja); só o visual é maior.
import PeCardPrices from './PeCardPrices.vue'

export default {
  name: 'PePdpPrices',
  extends: PeCardPrices
}
</script>
