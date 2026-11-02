<template>
  <a
    v-if="data && !section"
    class="pe-ml-reviews-summary"
    href="#avaliacoes"
  >
    <span
      class="pe-ml-reviews__stars"
      :aria-label="`Nota ${rating} de 5`"
    >
      <svg
        v-for="i in 5"
        :key="i"
        viewBox="0 0 24 24"
        aria-hidden="true"
        :class="{ 'is-on': i <= rounded }"
      ><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>
    </span>
    <b>{{ rating }}</b>
    <span class="pe-ml-reviews-summary__count">{{ data.total }} avaliações no Mercado Livre</span>
  </a>

  <section
    v-else-if="data"
    id="avaliacoes"
    class="pe-ml-reviews container"
  >
    <h2 class="pe-ml-reviews__title">O que as clientes dizem</h2>
    <div class="pe-ml-reviews__score">
      <strong>{{ rating }}</strong>
      <div>
        <span
          class="pe-ml-reviews__stars"
          :aria-label="`Nota ${rating} de 5`"
        >
          <svg
            v-for="i in 5"
            :key="i"
            viewBox="0 0 24 24"
            aria-hidden="true"
            :class="{ 'is-on': i <= rounded }"
          ><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>
        </span>
        <p>{{ data.total }} avaliações de compras verificadas no Mercado Livre</p>
      </div>
    </div>

    <article
      v-for="(review, index) in shown"
      :key="index"
      class="pe-ml-reviews__item"
    >
      <span
        class="pe-ml-reviews__stars"
        :aria-label="`Nota ${review.rating} de 5`"
      >
        <svg
          v-for="i in 5"
          :key="i"
          viewBox="0 0 24 24"
          aria-hidden="true"
          :class="{ 'is-on': i <= review.rating }"
        ><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>
      </span>
      <p class="pe-ml-reviews__text">{{ review.text }}</p>
      <p class="pe-ml-reviews__meta">
        {{ meta(review) }}
      </p>
    </article>

    <div
      v-if="!expanded && data.reviews.length > collapsed"
      class="pe-ml-reviews__actions"
    >
      <button
        type="button"
        class="pe-ml-reviews__more"
        @click="expanded = true"
      >
        Ver mais avaliações
      </button>
    </div>
  </section>
</template>

<script>
// Avaliações do Mercado Livre: resumo abaixo do nome (padrão) e seção completa depois da descrição (prop `section`).
// Sem nome de quem avaliou (dado pessoal) e sem link para o ML (decisão do Rafael, 02/11: não mandar a cliente comparar preço lá);
// todas as notas, das mais recentes para as mais antigas, sem filtro.
import { loadMlReviews, findMlReviews, formatRating, formatMonth } from '../ml-reviews'

export default {
  name: 'PeMlReviews',

  props: {
    sku: String,
    section: Boolean
  },

  data () {
    return { data: null, expanded: false, collapsed: 4 }
  },

  computed: {
    rating () {
      return formatRating(this.data.rating)
    },
    rounded () {
      return Math.round(this.data.rating)
    },
    shown () {
      return this.expanded ? this.data.reviews : this.data.reviews.slice(0, this.collapsed)
    }
  },

  methods: {
    meta (review) {
      return [
        formatMonth(review.date),
        Number.isInteger(review.pack) && review.pack > 1 ? `Comprou: pacote com ${review.pack}` : '',
        'Compra verificada no Mercado Livre'
      ].filter(Boolean).join(' · ')
    }
  },

  created () {
    if (!this.sku) return
    loadMlReviews().then(data => {
      this.data = findMlReviews(data, this.sku)
    })
  }
}
</script>
