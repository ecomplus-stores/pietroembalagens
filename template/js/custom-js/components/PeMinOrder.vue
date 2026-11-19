<template>
  <p
    class="pe-min-order"
    role="status"
  >Faltam <strong>{{ aviso.falta }}</strong> para o pedido mínimo de {{ aviso.minimo }}</p>
</template>

<script>
// Aviso de pedido mínimo junto do botão (carrinho e PDP); o texto sai de avisoMinimo() em pedido-minimo.js.
export default {
  name: 'PeMinOrder',
  props: {
    aviso: { type: Object, required: true }
  }
}
</script>

<style>
.pe-min-order{margin:0 0 10px;padding:10px 14px;background:#fff7f3;border-left:3px solid #fd8043;border-radius:8px;color:inherit;font-size:15px;line-height:1.35;text-align:left}
.pe-min-order strong{font-weight:700}
.pdp-buy-box>.pe-min-order{order:4;margin:10px 0 0}
</style>
