import Vue from 'vue'
import AffiliateLink from './components/AffiliateLink.vue'
import PeMlReviews from './components/PeMlReviews.vue'
import { loadPdpNova } from './pdp-nova'
import './cart-ui'
import './header-v2'
import './personalized-boxes'
import './passport-oauth'
// Add your custom JavaScript for storefront pages here.
const screenWidth = document.body ? document.body.offsetWidth : window.screen.width

const affiliateLinkDiv = document.getElementById('affiliate-link')
if (affiliateLinkDiv) {
  new Vue(AffiliateLink).$mount(affiliateLinkDiv)
}

// Avaliações do Mercado Livre depois da descrição (product-description.ejs); nada aparece sem 3+ avaliações.
const mlReviewsDiv = document.getElementById('pe-ml-reviews')
if (mlReviewsDiv && mlReviewsDiv.dataset.sku) {
  new Vue({ render: h => h(PeMlReviews, { props: { sku: mlReviewsDiv.dataset.sku, section: true } }) }).$mount(mlReviewsDiv)
}

// Página nova de produto: estrelas e nº de avaliações sob o código (criado em pdp-nova.js); nada aparece sem 3+ avaliações.
if (document.getElementById('product-block')) {
  loadPdpNova().then(isNova => {
    const mlReviewsSummaryDiv = isNova && document.getElementById('pe-ml-reviews-summary')
    if (mlReviewsSummaryDiv && mlReviewsSummaryDiv.dataset.sku) {
      new Vue({ render: h => h(PeMlReviews, { props: { sku: mlReviewsSummaryDiv.dataset.sku } }) }).$mount(mlReviewsSummaryDiv)
    }
  }).catch(() => {})
}

if (screenWidth >= 992) {
    if (window.storefront && window.storefront.context && window.storefront.context.resource === 'categories') {
        // A grade pré-renderizada (#search-engine-snap) nasce fora da coluna de produtos. Assim que o
        // SearchEngine monta a coluna (.col-md-9), move ela pra lá. Antes era um timer de 800 ms preso ao
        // tag manager: quando disparava antes do Vue montar, a grade ficava embaixo da coluna de filtros
        // e a categoria parecia vazia na primeira tela.
        const $searchEngine = document.getElementById('search-engine')
        const moveSnap = () => {
            const $col = $searchEngine.querySelector('.search-engine .col-md-9.col-12')
            if (!$col) return false
            $('#search-engine-snap, #search-engine-load').appendTo($col)
            return true
        }
        if ($searchEngine && !moveSnap()) {
            const observer = new MutationObserver(() => {
                if (moveSnap()) observer.disconnect()
            })
            observer.observe($searchEngine, { childList: true })
        }
    }
    $('body').on('click','.search-engine__aside-open, .search-engine__aside .card-header .close, .search-engine__toggles > button',function(){
        $('body .search-engine__aside').toggleClass('active')
    })

    $('body').on('click', '#custom-backdrop', function(){
        $('body .search-engine__aside').removeClass('active')
    })

    $('#search-engine-snap > article > .row > div').removeClass('col-lg-3');
}

// Fechar busca instantânea com ESC
document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' || e.keyCode === 27) {
    var backdrop = document.querySelector('#instant-search .backdrop')
    if (backdrop) backdrop.click()
    var searchInput = document.getElementById('search-input')
    if (searchInput) searchInput.blur()
  }
})
