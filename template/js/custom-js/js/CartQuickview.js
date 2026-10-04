import Native from '@ecomplus/storefront-components/src/js/CartQuickview.js'
import FreightSuggestions from '../components/FreightSuggestions.vue'
import core from '../freight/core'
import { runtime, enabled, init } from '../freight/runtime'
import { noMinicart } from '../cart-ui'

export default {
  ...Native,
  components: { ...Native.components, FreightSuggestions },
  methods: {
    ...Native.methods,
    // Teste sem minicart (cart-ui.js): nada abre o painel; fechar continua funcionando.
    toggle (isVisible) {
      if (noMinicart() && isVisible !== false) return undefined
      return Native.methods.toggle.call(this, isVisible)
    }
  },
  mixins: [{
    data () { return { peQuote: null, peHasSuggestions: false } },
    computed: {
      peEnabled () { return runtime.ready && enabled() },
      peShowLegacy () {
        return !this.peEnabled || (!this.peHasSuggestions && !(this.peQuote && this.peQuote.services.some(core.isFreeDelivery)))
      }
    },
    mounted () { init() }
  }]
}
