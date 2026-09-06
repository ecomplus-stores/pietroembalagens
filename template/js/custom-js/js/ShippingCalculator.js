import core from '../freight/core'
import { runtime, enabled, init, getPreference, setPreference } from '../freight/runtime'
import FreightStatus from '../components/FreightStatus.vue'
import {
    i19add$1ToEarn,
    i19calculateShipping,
    i19freeShipping,
    i19zipCode
  } from '@ecomplus/i18n'
  
  import {
    $ecomConfig,
    i18n,
    price as getPrice,
    formatMoney
  } from '@ecomplus/utils'
  
  import { modules } from '@ecomplus/client'
  import sortApps from '@ecomplus/storefront-components/src/js/helpers/sort-apps'
  import CleaveInput from 'vue-cleave-component'
  import ShippingLine from '@ecomplus/storefront-components/src/ShippingLine.vue'
  
  const localStorage = typeof window === 'object' && window.localStorage
  const zipStorageKey = 'shipping-to-zip'
  
  const reduceItemBody = core.shippingItem
  
  export default {
    name: 'ShippingCalculator',
  
    components: {
      CleaveInput,
      ShippingLine,
      FreightStatus
    },
  
    props: {
      zipCode: String,
      canSelectServices: Boolean,
      canAutoSelectService: { type: Boolean, default: true },
      canInputZip: {
        type: Boolean,
        default: true
      },
      countryCode: {
        type: String,
        default: $ecomConfig.get('country_code')
      },
      shippedItems: {
        type: Array,
        default () {
          return []
        }
      },
      shippingResult: {
        type: Array,
        default () {
          return []
        }
      },
      shippingData: {
        type: Object,
        default () {
          return {}
        }
      },
      skipAppIds: Array,
      shippingAppsSort: {
        type: Array,
        default () {
          return window.ecomShippingApps || []
        }
      }
    },
  
    data () {
      return {
        localZipCode: null,
        peSequence: 0,
        peFetchTimer: null,
        peSettledKey: null,
        peError: false,
        peRequest: {},
        peRequestUrl: null,
        peDestroyed: false,
        localShippedItems: [],
        amountSubtotal: null,
        shippingServices: [],
        selectedService: null,
        hasPaidOption: false,
        hasFreeOption: false,
        freeFromValue: null,
        isScheduled: false,
        retryTimer: null,
        isWaiting: false,
        hasCalculated: false
      }
    },
  
    computed: {
      i19add$1ToEarn: () => i18n(i19add$1ToEarn),
      i19calculateShipping: () => i18n(i19calculateShipping),
      i19zipCode: () => i18n(i19zipCode),
      i19selectShippingMsg: () => 'Selecione uma opção de entrega',
      peEnabled () { return runtime.ready && enabled() && this.canSelectServices },
      peCurrentKey () {
        return core.fingerprint(this.shippedItems, this.localZipCode, { shippingData: this.shippingData, skipIds: this.skipAppIds, country: this.countryCode })
      },
      peSnapshot () {
        const postalCode = core.zip(this.localZipCode)
        const current = this.peSettledKey === this.peCurrentKey
        return {
          status: postalCode.length !== 8 ? 'idle' : this.isWaiting || !current ? 'loading' : this.peError ? 'error' : 'ready',
          key: this.peCurrentKey, zip: postalCode, subtotal: core.subtotal(this.shippedItems),
          threshold: current && this.freeFromValue ? core.cents(this.freeFromValue) : null,
          services: current && !this.isWaiting ? this.shippingServices : [],
          selected: current && this.selectedService !== null ? this.shippingServices[this.selectedService] : null,
          request: this.peRequest, url: this.peRequestUrl, skipIds: this.skipAppIds || []
        }
      },
      i19freeShipping: () => i18n(i19freeShipping).toLowerCase(),
  
      cleaveOptions () {
        return this.countryCode === 'BR'
          ? { blocks: [5, 3], delimiter: '-' }
          : { blocks: [30] }
      },
  
      freeFromPercentage () {
        return this.hasPaidOption && this.amountSubtotal < this.freeFromValue
          ? Math.round(this.amountSubtotal * 100 / this.freeFromValue)
          : null
      },
  
      productionDeadline () {
        let maxDeadline = 0
        this.shippedItems.forEach(item => {
          if (item.quantity && item.production_time) {
            const { days, cumulative } = item.production_time
            const itemDeadline = cumulative ? days * item.quantity : days
            if (itemDeadline > maxDeadline) {
              maxDeadline = itemDeadline
            }
          }
        })
        return maxDeadline
      }
    },
  
    methods: {
      formatMoney,
  
      updateZipCode () {
        this.$emit('update:zip-code', this.localZipCode)
      },
  
      parseShippingOptions (shippingResult = []) {
        const result = core.parseQuote(shippingResult, this.skipAppIds || [])
        this.freeFromValue = result.threshold === null ? null : result.threshold / 100
        this.shippingServices = Array.isArray(this.shippingAppsSort) && this.shippingAppsSort.length
          ? sortApps(result.services, this.shippingAppsSort)
          : result.services
        this.hasPaidOption = this.shippingServices.some(service => core.serviceCost(service) > 0)
        this.hasFreeOption = this.shippingServices.some(core.isFreeDelivery)
        this.peError = !result.valid || !this.shippingServices.length
        this.selectedService = null
        const preferred = getPreference(core.zip(this.localZipCode))
        const index = core.chooseService(this.shippingServices, preferred, this.canAutoSelectService)
        if (index >= 0) this.setSelectedService(index, false)
        else if (this.canSelectServices) this.$emit('select-service', {})
      },
  
      scheduleRetry (timeout = 10000) {
        clearTimeout(this.retryTimer)
        this.retryTimer = setTimeout(() => {
          if (this.localZipCode && !this.shippingServices.length && this.shippedItems.length) {
            this.fetchShippingServices(true)
          }
        }, timeout)
      },
  
      fetchShippingServices () {
        clearTimeout(this.peFetchTimer)
        clearTimeout(this.retryTimer)
        const sequence = ++this.peSequence
        this.isScheduled = false
        this.peError = false
        if (core.zip(this.localZipCode).length !== 8 || !this.shippedItems.length) {
          this.isWaiting = false
          this.shippingServices = []
          this.freeFromValue = null
          this.selectedService = null
          this.peSettledKey = null
          if (this.canSelectServices) this.$emit('select-service', {})
          return
        }
        this.isWaiting = true
        this.freeFromValue = null
        this.selectedService = null
        if (this.canSelectServices) this.$emit('select-service', {})
        this.peFetchTimer = setTimeout(() => {
          const requestKey = this.peCurrentKey
          let url = '/calculate_shipping.json'
          if (this.skipAppIds && this.skipAppIds.length) url += '?skip_ids=' + this.skipAppIds.join(',')
          const data = {
            ...this.shippingData,
            to: { ...this.shippingData.to, zip: this.localZipCode },
            items: this.shippedItems.map(reduceItemBody),
            subtotal: this.shippedItems.reduce((sum, item) => sum + getPrice(item) * item.quantity, 0)
          }
          this.peRequest = JSON.parse(JSON.stringify(data))
          this.peRequestUrl = url
          const current = () => !this.peDestroyed && sequence === this.peSequence && requestKey === this.peCurrentKey
          modules({ url, method: 'POST', storeId: this.storeId, data, axiosConfig: { timeout: 15000 } })
            .then(({ data }) => {
              if (current()) this.parseShippingOptions(data.result)
            })
            .catch(() => {
              if (current()) {
                this.peError = true
                this.shippingServices = []
                if (this.canSelectServices) this.$emit('select-service', {})
              }
            })
            .finally(() => {
              if (current()) {
                this.peSettledKey = requestKey
                this.hasCalculated = true
                this.isWaiting = false
              }
            })
        }, this.hasCalculated ? 250 : 50)
      },
  
      submitZipCode () {
        this.updateZipCode()
        if (localStorage) {
          try { localStorage.setItem(zipStorageKey, this.localZipCode) } catch (_) {}
        }
        this.fetchShippingServices()
      },
  
      setSelectedService (i, explicit = true) {
        if (explicit && this.isWaiting) return
        const service = this.shippingServices[i]
        if (this.canSelectServices && service) {
          if (explicit) setPreference(core.zip(this.localZipCode), core.serviceKey(service))
          this.selectedService = i
          this.$emit('select-service', service)
        }
      },
      peSelectFree () {
        const index = this.shippingServices.findIndex(core.isFreeDelivery)
        if (index >= 0) this.setSelectedService(index)
      }
    },

    watch: {
      peSnapshot: {
        handler (snapshot) { this.$emit('pe-quote', snapshot) },
        deep: true, immediate: true
      },
      shippedItems: {
        handler () {
          this.localShippedItems = this.shippedItems.map(reduceItemBody)
          this.amountSubtotal = this.shippedItems.reduce((sum, item) => sum + getPrice(item) * item.quantity, 0)
          this.fetchShippingServices()
        },
        deep: true, immediate: true
      },
      localZipCode () {
        if (core.zip(this.localZipCode).length === 8) this.submitZipCode()
        else this.fetchShippingServices()
      },
      zipCode: {
        handler (value) { if (value !== undefined && value !== this.localZipCode) this.localZipCode = value },
        immediate: true
      },
      shippingData: { handler () { this.fetchShippingServices() }, deep: true },
      skipAppIds () { this.fetchShippingServices() },
      shippingResult: {
        handler (result) {
          if (result.length) {
            clearTimeout(this.peFetchTimer)
            this.peSequence++
            this.parseShippingOptions(result)
            this.peSettledKey = this.peCurrentKey
            this.hasCalculated = true
            this.isWaiting = false
          }
        },
        immediate: true
      }
    },
    beforeDestroy () {
      this.peDestroyed = true
      this.peSequence++
      clearTimeout(this.peFetchTimer)
      clearTimeout(this.retryTimer)
    },

    created () {
      init()
      if (!this.zipCode && localStorage) {
        let storedZip
        try { storedZip = localStorage.getItem(zipStorageKey) } catch (_) {}
        if (storedZip) {
          this.localZipCode = storedZip
        }
      }
    }
  }
  