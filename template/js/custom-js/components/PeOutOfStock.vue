<template>
  <p
    class="pe-out-of-stock"
    role="alert"
  >
    <template v-if="nomes.length === 1">Ops! <strong>{{ nomes[0] }}</strong> esgotou e saiu do seu pedido.</template>
    <template v-else>Ops! Estes itens esgotaram e saíram do seu pedido: <strong>{{ nomes.join(', ') }}</strong>.</template>
    <a :href="cartUrl">Voltar ao carrinho</a>
  </p>
</template>

<script>
// Aviso de item esgotado na tela de pagamento; os nomes saem de itensEsgotados() em esgotado.js.
export default {
  name: 'PeOutOfStock',
  props: {
    nomes: { type: Array, required: true },
    cartUrl: { type: String, default: '/app/#/cart' }
  }
}
</script>

<style>
.pe-out-of-stock{margin:0 0 12px;padding:10px 14px;background:#fff7f3;border-left:3px solid #fd8043;border-radius:8px;color:inherit;font-size:15px;line-height:1.35;text-align:left}
.pe-out-of-stock strong{font-weight:700}
.pe-out-of-stock a{display:inline-block;margin-left:4px;font-weight:700;text-decoration:underline}
</style>
