// Pedido mínimo (T113): aviso "Faltam R$ X para o pedido mínimo de R$ 20" no carrinho e na página de produto,
// e "Finalizar compra" do carrinho desabilitado abaixo do mínimo.
// /pe-cart-config.json: "pedidoMinimo" é o valor (fonte única, vale também para a trava da tela de pagamento) e
// "avisoPedidoMinimo": false desliga o aviso e a trava novos do carrinho/PDP (a do pagamento continua).
// Falha ao carregar o arquivo ou valor fora de 1 a 100: mínimo de R$ 20 no pagamento e nada novo no carrinho/PDP.
import Vue from 'vue'

export const MINIMO_PADRAO = 20
const MINIMO_MAXIMO = 100

export const state = Vue.observable({ minimo: MINIMO_PADRAO, aviso: false })
let pending

export const applyConfig = config => {
  const value = config && config.pedidoMinimo
  state.minimo = typeof value === 'number' && value >= 1 && value <= MINIMO_MAXIMO ? value : MINIMO_PADRAO
  state.aviso = Boolean(config) && config.avisoPedidoMinimo === true
}

export const loadPedidoMinimo = () => {
  if (pending) return pending
  pending = fetch('/pe-cart-config.json?v=' + Date.now(), { cache: 'no-store', credentials: 'same-origin' })
    .then(response => {
      if (!response.ok) throw new Error('pe-cart-config')
      return response.json()
    })
    .then(applyConfig)
    .catch(() => applyConfig(null))
  return pending
}

// Quanto falta (em reais) para o subtotal chegar ao mínimo; 0 quando já chegou. Conta em centavos.
export const faltaParaMinimo = (subtotal, minimo = state.minimo) => {
  const cents = Math.round(minimo * 100) - Math.round((Number(subtotal) || 0) * 100)
  return cents > 0 ? cents / 100 : 0
}

// "R$ 18,40"; valor inteiro sem centavos ("R$ 20").
export const reais = (value, isShort) => isShort && Number.isInteger(value)
  ? 'R$ ' + value
  : 'R$ ' + value.toFixed(2).replace('.', ',')

// O que o carrinho e a PDP mostram: null quando o aviso está desligado ou o subtotal já chegou ao mínimo.
export const avisoMinimo = subtotal => {
  if (!state.aviso) return null
  const falta = faltaParaMinimo(subtotal)
  return falta > 0 ? { falta: reais(falta), minimo: reais(state.minimo, true) } : null
}
