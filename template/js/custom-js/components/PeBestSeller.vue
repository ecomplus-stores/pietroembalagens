<template>
  <span
    v-if="item"
    class="pe-best-seller"
    :class="{ 'pe-best-seller--pdp': withCategory }"
  >{{ withCategory ? `${item.rank}º mais vendido em ${item.category}` : `${item.rank}º mais vendido` }}</span>
</template>

<script>
// Etiqueta "Nº mais vendido" (1º a 5º) no card (sobre a foto) e na página do produto (acima do nome).
import { loadBestSellers, findBestSeller } from '../best-sellers'

export default {
  name: 'PeBestSeller',

  props: {
    sku: String,
    withCategory: Boolean
  },

  data () {
    return { item: null }
  },

  created () {
    if (!this.sku) return
    loadBestSellers().then(data => {
      this.item = findBestSeller(data, this.sku)
    })
  }
}
</script>
