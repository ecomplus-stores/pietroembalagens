import {
  i19addToFavorites,
  i19buy,
  i19connectionErrorProductMsg,
  i19outOfStock,
  i19unavailable
} from '@ecomplus/i18n'

import {
  i18n,
  name as getName,
  inStock as checkInStock,
  onPromotion as checkOnPromotion,
  price as getPrice
} from '@ecomplus/utils'

import Vue from 'vue'
import { store } from '@ecomplus/client'
import ecomCart from '@ecomplus/shopping-cart'
import ALink from '@ecomplus/storefront-components/src/ALink.vue'
import APicture from '@ecomplus/storefront-components/src/APicture.vue'
import APrices from '@ecomplus/storefront-components/src/APrices.vue'
import ecomPassport from '@ecomplus/passport-client'
import { toggleFavorite, checkFavorite } from '@ecomplus/storefront-components/src/js/helpers/favorite-products'

// const sanitizeProductBody = body => {
//   const product = Object.assign({}, body)
//   delete product.body_html
//   delete product.body_text
//   delete product.specifications
//   delete product.inventory_records
//   delete product.price_change_records
//   return product
// }

const getExternalHtml = (varName, product) => {
  if (typeof window === 'object') {
    varName = `productCard${varName}Html`
    const html = typeof window[varName] === 'function'
      ? window[varName](product)
      : window[varName]
    if (typeof html === 'string') {
      return html
    }
  }
  return undefined
}

export default {
  name: 'ProductCard',

  components: {
    ALink,
    APicture,
    APrices
  },

  props: {
    product: Object,
    productId: String,
    isSmall: Boolean,
    headingTag: {
      type: String,
      default: 'h3'
    },
    buyText: String,
    transitionClass: {
      type: String,
      default: 'animated fadeIn'
    },
    canAddToCart: {
      type: Boolean,
      default: true
    },
    ecomPassport: {
      type: Object,
      default () {
        return ecomPassport
      }
    },
    accountUrl: {
      type: String,
      default: '/app/#/account/'
    },
    isLoaded: Boolean,
    installmentsOption: Object,
    discountOption: Object
  },

  data () {
    return {
      body: {},
      isLoading: false,
      isWaitingBuy: false,
      isHovered: false,
      isFavorite: false,
      error: ''
    }
  },

  computed: {
    i19addToFavorites: () => i18n(i19addToFavorites),
    i19outOfStock: () => i18n(i19outOfStock),
    i19unavailable: () => i18n(i19unavailable),

    ratingHtml () {
      return getExternalHtml('Rating', this.body)
    },

    buyHtml () {
      return getExternalHtml('Buy', this.body)
    },

    footerHtml () {
      return getExternalHtml('Footer', this.body)
    },

    name () {
      return getName(this.body)
    },

    strBuy () {
      return this.buyText ||
        (typeof window === 'object' && window.productCardBuyText) ||
        i18n(i19buy)
    },

    isInStock () {
      return checkInStock(this.body)
    },

    isActive () {
      return this.body.available && this.body.visible && this.isInStock
    },

    isLogged () {
      return ecomPassport.checkAuthorization()
    },

    discount () {
      const { body } = this
      return checkOnPromotion(body)
        ? Math.round(((body.base_price - getPrice(body)) * 100) / body.base_price)
        : 0
    }
  },

  methods: {
    setBody (data) {
      this.body = Object.assign({}, data)
      delete this.body.body_html
      delete this.body.body_text
      delete this.body.inventory_records
      delete this.body.price_change_records
      this.isFavorite = checkFavorite(this.body._id, this.ecomPassport)
    },

    fetchItem () {
      if (this.productId) {
        this.isLoading = true
        store({ url: `/products/${this.productId}.json` })
          .then(({ data }) => {
            this.$emit('update:product', data)
            this.setBody(data)
            this.$emit('update:is-loaded', true)
          })
          .catch(err => {
            console.error(err)
            if (!this.body.name || !this.body.slug || !this.body.pictures) {
              this.error = i18n(i19connectionErrorProductMsg)
            }
          })
          .finally(() => {
            this.isLoading = false
          })
      }
    },

    toggleFavorite () {
      if (this.isLogged) {
        this.isFavorite = toggleFavorite(this.body._id, this.ecomPassport)
      }
    },
    qtd (el, quantity) {
      const input = document.querySelector(`[product_quantity="${el}"]`)
      if (!input) {
        return
      }
      const currentValue = parseInt(input.value, 10) || 1
      const nextValue = Math.max(1, currentValue + (parseInt(quantity, 10) || 0))
      input.value = nextValue
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },

    getListContext (element) {
      const cardEl = element && element.closest('.product-card')
      const wrappers = [
        '.search-engine__retail .row',
        '.search-engine__retail',
        '.products-carousel .swiper-wrapper',
        '.products-carousel',
        '.shelfs .row',
        '.shelfs',
        '.row'
      ]
      let listEl = null
      for (let i = 0; i < wrappers.length; i++) {
        listEl = cardEl && cardEl.closest(wrappers[i])
        if (listEl) {
          break
        }
      }

      let listName = ''
      if (listEl) {
        if (listEl.closest('.search-engine__retail')) {
          listName = 'Resultados da busca'
        } else {
          const sectionEl = listEl.closest('section, article, .products-carousel, .shelfs, .container')
          if (sectionEl) {
            const headingEl = sectionEl.querySelector('h1, h2, h3, .section-title, .products-carousel__title')
            if (headingEl && headingEl.textContent) {
              listName = headingEl.textContent.trim()
            }
          }
        }
      }

      let position = 1
      if (listEl && cardEl) {
        const cards = Array.from(listEl.querySelectorAll('.product-card'))
        const index = cards.indexOf(cardEl)
        if (index > -1) {
          position = index + 1
        }
      }

      return {
        listName,
        position
      }
    },

    trackSelectItem (event) {
      if (typeof window !== 'object') {
        return
      }

      const { listName, position } = this.getListContext(event && event.currentTarget)
      const item = {
        id: this.body.sku || this.body._id,
        name: this.name,
        position
      }
      const price = getPrice(this.body)
      if (price) {
        item.price = price
      }
      if (listName) {
        item.list = listName
      }

      window.dataLayer = window.dataLayer || []
      window.dataLayer.push({
        event: 'eec.click',
        ecommerce: {
          click: {
            actionField: listName
              ? { list: listName }
              : {},
            products: [item]
          }
        }
      })
    },

    buy () {
      const product = this.body
      this.$emit('buy', { product })
      if (this.canAddToCart) {
        this.isWaitingBuy = true
        store({ url: `/products/${product._id}.json` })
          .then(({ data }) => {
            const selectFields = ['variations', 'customizations', 'kit_composition']
            for (let i = 0; i < selectFields.length; i++) {
              const selectOptions = data[selectFields[i]]
              if (selectOptions && selectOptions.length) {
                return import('@ecomplus/storefront-components/src/ProductQuickview.vue')
                  .then(quickview => {
                    new Vue({
                      render: h => h(quickview.default, {
                        props: {
                          product: data
                        }
                      })
                    }).$mount(this.$refs.quickview)
                  })
              }
            }
            const quantityInput = document.querySelector(`[product_quantity="${product._id}"]`)
            const quantity = quantityInput ? parseInt(quantityInput.value, 10) : 1
            ecomCart.addProduct({ ...product }, '', quantity || 1)
          })
          .catch(err => {
            console.error(err)
            window.location = `/${product.slug}`
          })
          .finally(() => {
            this.isWaitingBuy = false
          })
      }
    }
  },

    // buy () {
    //   let product = sanitizeProductBody(this.body)
    //   product.quantity = $("[product_quantity='"+ product._id +"']");
    //   console.log(product)
    //   this.$emit('buy', { product })
    //   if (this.canAddToCart) {
    //     this.isWaitingBuy = true
    //     store({ url: `/products/${product._id}.json` })
    //       .then(({ data }) => {
    //         const selectFields = ['variations', 'customizations', 'kit_composition']
    //         for (let i = 0; i < selectFields.length; i++) {
    //           const selectOptions = data[selectFields[i]]
    //           if (selectOptions && selectOptions.length) {
    //             return import('@ecomplus/storefront-components/src/ProductQuickview.vue')
    //               .then(quickview => {
    //                 new Vue({
    //                   render: h => h(quickview.default, {
    //                     props: {
    //                       product: data
    //                     }
    //                   })
    //                 }).$mount(this.$refs.quickview)
    //               })
    //           }
    //         }
    //         const { price } = data
    //         //console.log({ ...product, price })
    //         ecomCart.addProduct({ ...product, price})
    //         //ecomCart.addItem({ ...product, price })
    //       })
    //       .catch(err => {
    //         console.error(err)
    //         window.location = `/${product.slug}`
    //       })
    //       .finally(() => {
    //         this.isWaitingBuy = false
    //       })
    //   }
    // }
  // },
  
  created () {
    if (this.product) {
      this.setBody(this.product)
      if (this.product.available === undefined) {
        this.body.available = true
      }
      if (this.product.visible === undefined) {
        this.body.visible = true
      }
    }
    if (!this.isLoaded) {
      this.fetchItem()
    }
  }
}
