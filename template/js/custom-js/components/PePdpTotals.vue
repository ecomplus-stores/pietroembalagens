<template>
  <div
    class="pe-pdp-totals"
    :class="{ 'pe-pdp-totals--pay': onlyPay }"
  >
    <template v-if="!onlyPay">
      <p class="pe-pdp-totals__kicker">Seu pedido</p>
      <div class="pe-pdp-totals__main">
        R$ {{ mainParts[0] }}<span class="pe-pdp-totals__cents">{{ mainParts[1] }}</span>
      </div>
      <p
        v-if="label"
        class="pe-pdp-totals__label"
      >{{ label }}</p>
    </template>
    <p
      v-if="installmentsNumber > 1 && installmentValue"
      class="pe-pdp-totals__inst"
    >
      em até <strong>{{ installmentsNumber }}x de {{ formatMoney(installmentValue) }}<template v-if="!monthlyInterest"> sem juros</template></strong>
    </p>
    <p
      v-if="priceWithDiscount"
      class="pe-pdp-totals__pix"
    >
      <strong>{{ formatMoney(priceWithDiscount) }} no Pix</strong>
      <span
        v-if="pixLabel"
        class="pe-pdp-totals__chip"
      >{{ pixLabel }}</span>
    </p>
  </div>
</template>

<script>
// Total escolhido, parcelas e Pix da página de produto (site/alteracoes-no-site/59-pdp-nova-escada-3-colunas.md).
// Herda do APrices da loja: parcelas (min(máximo, piso(total ÷ parcela mínima))) e Pix saem da configuração de
// pagamento (list_payments), nunca de número escrito aqui.
import APrices from '@ecomplus/storefront-components/src/js/APrices.js'
import { roundMoney } from '../pdp-escada'

export default {
  name: 'PePdpTotals',
  extends: APrices,

  props: {
    // "total de 2 pacotes"; vazio esconde a linha.
    label: String,
    // Só parcelas e Pix (celular, logo abaixo da escada); o total fica por conta dos cartões.
    onlyPay: Boolean
  },

  computed: {
    // Mesmo arredondamento dos cartões da escada (roundMoney): o total da caixa e o do cartão nunca diferem em 1 centavo.
    mainParts () {
      return roundMoney(this.price).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(',')
    },

    pixLabel () {
      const { type, value } = this.discount
      return type === 'percentage' && value ? `${value}% à vista` : ''
    }
  }
}
</script>
