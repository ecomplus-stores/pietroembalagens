import Native from '@ecomplus/storefront-components/src/js/CartQuickview.js'
import FreightSuggestions from '../components/FreightSuggestions.vue'
import FreightStatus from '../components/FreightStatus.vue'
import core from '../freight/core'
import { runtime, enabled, uiVersion, init } from '../freight/runtime'

export default {
  ...Native,
  components: { ...Native.components, FreightSuggestions, FreightStatus },
  mixins: [{
    data () { return { peQuote: null, peHasSuggestions: false } },
    computed: {
      peEnabled () { return runtime.ready && enabled() },
      peV2 () { return runtime.ready && uiVersion() === 'v2' },
      peShowLegacy () {
        return !this.peEnabled || (!this.peHasSuggestions && !(this.peQuote && this.peQuote.services.some(core.isFreeDelivery)))
      }
    },
    methods: {
      // The v2 status strip lives outside the scroll area, so it talks to the calculator by reference.
      peCall (method) { if (this.$refs.peCalc && this.$refs.peCalc[method]) this.$refs.peCalc[method]() },
      peSubmitZip (zip) { if (this.$refs.peCalc) this.$refs.peCalc.peSetZip(zip) }
    },
    mounted () { init() }
  }]
}
