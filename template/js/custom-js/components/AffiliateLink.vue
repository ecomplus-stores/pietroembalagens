<template>
  <div id="affiliate-link">
    <a-alert v-if="!isLogged">
      Faça login em sua conta da loja para acessar seu link indicação
    </a-alert>
    <button
      v-else
      class="btn btn-link"
      @click="share"
    >
      <mark>{{ link }}</mark>
    </button>
  </div>
</template>

<script>
import ecomPassport from '@ecomplus/passport-client'
import AAlert from '@ecomplus/storefront-components/src/AAlert.vue'
export default {
  name: 'AffiliateLink',
  components: {
    AAlert
  },
  data () {
    return {
      isLogged: false,
      link: ''
    }
  },
  methods: {
    setLink () {
      const customer = ecomPassport.getCustomer()
      this.link = `https://${window.location.host}/` +
        `?coupon=CONVITE_ESPECIAL&referral=${customer._id}`
    },
    share () {
      const text = 'Compre a melhor granola e outros alimentos saudáveis e deliciosos na Tia Sônia ' +
        'com R$ 25,00 de desconto através desse link!';
      const share = async () => {
        try {
          await navigator.share({
            title: 'Tia Sônia - Convite especial: Ganhe R$ 25,00',
            text,
            url: this.link
          });
        } catch (err) {
          console.error(err)
          const wppLink = 'https://web.whatsapp.com/send?text=' +
            encodeURIComponent(text + ' ' + this.link)
          window.open(wppLink, '_blank')
        }
      }
      share()
    }
  },
  created () {
    this.isLogged = ecomPassport.checkLogin()
    if (this.isLogged) {
      this.setLink()
    } else {
      ecomPassport.on('login', () => {
        this.isLogged = true
        this.setLink()
      })
    }
  },
}
</script>
