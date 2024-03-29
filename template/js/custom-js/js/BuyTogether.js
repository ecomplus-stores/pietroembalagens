// import { i19buyTogetherWith } from '@ecomplus/i18n'
import { formatMoney, price as getPrice, recommendedIds } from '@ecomplus/utils'
import { modules, graphs } from '@ecomplus/client'
import ecomCart from '@ecomplus/shopping-cart'
import EcomSearch from '@ecomplus/search-engine'
import APrices from '@ecomplus/storefront-components/src/APrices.vue'
import ProductCard from '@ecomplus/storefront-components/src/ProductCard.vue'

const storefront = (typeof window === 'object' && window.storefront) || {}
const getContextBody = () => (storefront.context && storefront.context.body) || {}
const sanitizeProductBody = body => {
  const product = Object.assign({}, body)
  delete product.body_html
  delete product.body_text
  delete product.specifications
  delete product.inventory_records
  delete product.price_change_records
  return product
}

export default {
  name: 'BuyTogether',

  components: {
    APrices,
    ProductCard
  },

  props: {
    baseProduct: {
      type: Object,
      default () {
        return getContextBody()
      }
    },
    ecomCart: {
      type: Object,
      default () {
        return ecomCart
      }
    },
    productCardProps: {
      type: Object,
      default () {
        return {
          isSmall: true
        }
      }
    },
    fallbackMatchType: {
      type: String,
      default: (typeof window === 'object' && window.ecomRecommendationsType) || 'recommended'
    }
  },

  data () {
    return {
      ecomSearch: new EcomSearch()
        .mergeFilter({
          range: {
            quantity: {
              gt: 0
            }
          }
        })
        .mergeFilter({
          term: {
            available: true
          }
        }),
      hasLoadedIds: false,
      hasLoadedItems: false,
      productQnts: {},
      recommendedItems: [],
      discount: 0,
      discountType: 'fixed',
      discountValue: 0
    }
  },

  computed: {
    i19buyTogether: () => 'Compre junto',
    i19buyTogetherWith: () => 'Compre junto com',

    items () {
      return [
        this.baseProduct,
        ...this.recommendedItems
      ]
    },

    productIds () {
      return Object.keys(this.productQnts)
    },

    relatedProducts () {
      const relatedProducts = this.baseProduct.related_products && this.baseProduct.related_products[0]
      return relatedProducts && relatedProducts.product_ids.length
        ? relatedProducts.product_ids
        : []
    },

    subtotal () {
      return this.items.reduce((acc, item) => {
        return acc + (this.productQnts[item._id] || 1) * getPrice(item)
      }, 0)
    },

    canAddToCart () {
      return !this.items.find((item) => {
        return item.variations || item.customizations || item.kit_composition
      })
    }
  },

  methods: {
    formatMoney,

    buy () {
      const discountFactor = (this.subtotal - this.discount) / this.subtotal
      this.items.forEach((item) => {
        const cartItem = this.ecomCart.parseProduct({
          ...item,
          base_price: getPrice(item),
          price: getPrice(item) * discountFactor,
          price_effective_date: {}
        })
        cartItem.quantity = (this.productQnts[item._id] || 1)
        cartItem.keep_item_quantity = true
        this.ecomCart.addItem(cartItem)
      })
    },

    calcDiscount () {
      if (this.discountType === 'fixed') {
        this.discount = this.discountValue
      } else {
        this.discount = this.subtotal * this.discountValue / 100
      }
    },

    setProductQnts (productsIds) {
      if (productsIds.length) {
        const productQnts = {}
        productsIds.slice(0, 2).forEach(id => {
          productQnts[id] = 1
        })
        this.productQnts = productQnts
      }
    },

    fetchItems () {
      if (!this.productIds.length) {
        this.hasLoadedItems = true
        return
      }
      this.ecomSearch.setProductIds(this.productIds)
      delete this.ecomSearch.dsl.aggs
      this.ecomSearch.fetch().then(() => {
        this.recommendedItems = this.recommendedItems.concat(this.ecomSearch.getItems())
        this.recommendedItems = this.recommendedItems.filter(item => !item.variations)
      }).finally(() => {
        this.hasLoadedItems = true
      })
    }
  },

  watch: {
    subtotal: {
      handler (subtotal, oldSubtotal) {
        if (subtotal !== oldSubtotal) {
          this.calcDiscount()
        }
      },
      immediate: true
    }
  },

  created () {
    if (this.baseProduct && this.baseProduct._id) {
      const cartItem = ecomCart.parseProduct(sanitizeProductBody(this.baseProduct))
      const subtotal = getPrice(cartItem) * cartItem.quantity
      modules({
        url: '/apply_discount.json',
        method: 'POST',
        data: {
          amount: {
            subtotal,
            total: subtotal,
            discount: 0
          },
          items: [cartItem]
        }
      }).then(({ data }) => {
        for (let i = 0; i < data.result.length; i++) {
          const { validated, error, response } = data.result[i]
          if (validated && !error && response.buy_together) {
            const buyTogether = response.buy_together.sort((a, b) => {
              if (a.products && a.products.length) {
                if (!b.products || !b.products.length) {
                  return -1
                }
                if (
                  a.products.length <= b.products.length &&
                  a.discount.value >= b.discount.value
                ) {
                  return -1
                }
                return 0
              }
              return 1
            })
            if (buyTogether[0]) {
              const { products, discount } = buyTogether[0]
              this.productQnts = products || []
              this.discountType = discount.type
              this.discountValue = discount.value
              this.$nextTick(() => {
                this.calcDiscount()
              })
            }
          }
        }
      }).finally(() => {
        this.hasLoadedIds = true
        this.$nextTick(() => {
          if (!this.productIds.length) {
            if (this.relatedProducts.length) {
              this.setProductQnts(this.relatedProducts)
              this.fetchItems()
            } else if (this.fallbackMatchType) {
              graphs({ url: `/products/${this.baseProduct._id}/${this.fallbackMatchType}.json` })
                .then(({ data }) => {
                  this.setProductQnts(recommendedIds(data))
                  this.$nextTick(() => {
                    this.fetchItems()
                  })
                })
            }
          } else {
            this.fetchItems()
          }
        })
      })
    }
  }
}
