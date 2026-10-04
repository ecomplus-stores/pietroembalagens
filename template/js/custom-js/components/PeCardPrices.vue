<template>
  <div class="pe-card-prices">
    <div
      v-if="offPercent > 0"
      class="pe-card-prices__off"
    >
      <span class="pe-card-prices__tag">{{ offPercent }}% OFF</span>
      <s class="pe-card-prices__from">{{ formatMoney(comparePrice) }}</s>
    </div>
    <small
      v-if="hasVariedPrices"
      class="pe-card-prices__varied"
    >
      a partir de
    </small>
    <div class="pe-card-prices__main">
      <span class="pe-card-prices__cur">R$</span>
      <span class="pe-card-prices__int">{{ mainParts[0] }}</span>
      <span class="pe-card-prices__cents">{{ mainParts[1] }}</span>
    </div>
    <div
      v-if="priceWithDiscount"
      class="pe-card-prices__pix"
    >
      no Pix
    </div>
    <div
      v-if="installmentsLine"
      class="pe-card-prices__inst"
    >
      {{ installmentsLine }}
    </div>
  </div>
</template>

<script>
// Preço do card no modelo do Mercado Livre (site/alteracoes-no-site/25-card-produto-ml.md).
// Herda as contas do APrices da loja (Pix, parcela mínima, promoção, desconto de campanha) e só troca o visual.
import APrices from '@ecomplus/storefront-components/src/js/APrices.js'

export default {
  name: 'PeCardPrices',
  extends: APrices,

  computed: {
    // Preço grande: o do Pix quando a forma de pagamento com desconto vale para o produto; senão, o preço normal.
    mainPrice () {
      return this.priceWithDiscount || this.price
    },

    mainParts () {
      return this.mainPrice.toFixed(2).split('.')
        .map((part, i) => i ? part : Number(part).toLocaleString('pt-BR'))
    },

    // Selo só em produto com preço "de" (promoção ou desconto de campanha); a conta é contra o preço grande.
    offPercent () {
      const from = this.comparePrice
      return from > this.mainPrice
        ? Math.round((from - this.mainPrice) * 100 / from)
        : 0
    },

    installmentsLine () {
      const n = this.installmentsNumber
      if (n < 2) return ''
      if (this.monthlyInterest) {
        return `ou ${n}x de ${this.formatMoney(this.installmentValue)}`
      }
      return this.priceWithDiscount
        ? `ou ${this.formatMoney(this.price)} em até ${n}x sem juros`
        : `em até ${n}x de ${this.formatMoney(this.installmentValue)} sem juros`
    }
  }
}
</script>
