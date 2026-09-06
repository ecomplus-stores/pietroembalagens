import Native from '@ecomplus/storefront-components/src/js/TheCart.js'
import FreightSuggestions from '../components/FreightSuggestions.vue'
import core from '../freight/core'
import { runtime, enabled, init } from '../freight/runtime'

export default {
  ...Native,
  components: { ...Native.components, FreightSuggestions },
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
