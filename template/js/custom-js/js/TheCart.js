import Native from '@ecomplus/storefront-components/src/js/TheCart.js'
import FreightSuggestions from '../components/FreightSuggestions.vue'
import PeMinOrder from '../components/PeMinOrder.vue'
import core from '../freight/core'
import { runtime, enabled, uiVersion, init } from '../freight/runtime'
import { avisoMinimo, loadPedidoMinimo } from '../pedido-minimo'
import { isWholesaleVisit, remainingWholesale, wholesaleMessage, wholesaleWhatsapp } from '../wholesale-cart'

export default {
  ...Native,
  components: { ...Native.components, FreightSuggestions, PeMinOrder },
  mixins: [{
    data () {
      return { peQuote: null, peHasSuggestions: false, peWholesale: false, peWholesaleCopy: '' }
    },
    computed: {
      peEnabled () { return runtime.ready && enabled() },
      peV2 () { return runtime.ready && uiVersion() === 'v2' },
      peShowLegacy () {
        return !this.peEnabled || (!this.peHasSuggestions && !(this.peQuote && this.peQuote.services.some(core.isFreeDelivery)))
      },
      // Abaixo do pedido mínimo: aviso junto do botão e "Finalizar compra" desabilitado (pedido-minimo.js).
      peMinimo () { return avisoMinimo(this.cart.subtotal) },
      peWholesaleRemaining () { return remainingWholesale(this.cart.subtotal) },
      peWholesaleMessage () { return wholesaleMessage(this.cart.items) },
      peWholesaleLink () { return wholesaleWhatsapp(this.peWholesaleMessage) }
    },
    mounted () {
      init()
      loadPedidoMinimo()
      this.peWholesale = isWholesaleVisit()
    },
    methods: {
      async peCopyWholesale () {
        try {
          await navigator.clipboard.writeText(this.peWholesaleMessage)
          this.peWholesaleCopy = 'Carrinho copiado. Abra o WhatsApp e cole a lista.'
        } catch (error) {
          this.peWholesaleCopy = 'Selecione e copie a lista acima para enviar no WhatsApp.'
        }
      }
    }
  }]
}
