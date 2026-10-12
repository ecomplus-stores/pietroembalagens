<template>
  <span
    v-if="item"
    class="pe-best-seller"
    :class="{ 'pe-best-seller--pdp': withCategory }"
  >{{ withCategory ? `1º mais vendido em ${item.category}` : '1º mais vendido' }}</span>
</template>

<script>
// Etiqueta "1º mais vendido" no card (sobre a foto) e na página do produto (acima do nome).
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
