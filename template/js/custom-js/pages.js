import Vue from 'vue'
import AffiliateLink from './components/AffiliateLink.vue'
// Add your custom JavaScript for storefront pages here.
const screenWidth = document.body ? document.body.offsetWidth : window.screen.width

const affiliateLinkDiv = document.getElementById('affiliate-link')
if (affiliateLinkDiv) {
  new Vue(AffiliateLink).$mount(affiliateLinkDiv)
}

if (screenWidth >= 992) {
    if (window.storefront && window.storefront.context && window.storefront.context.resource === 'categories') {
        window.storefront.on('widget:@ecomplus/widget-tag-manager', function () {
            setTimeout(() => {
                $('#search-engine-snap, #search-engine-load').appendTo('#search-engine .col-md-9.col-12');
                $('.search-engine__retail .row').appendTo('#search-engine .col-md-9.col-12');
            }, 800)
        })
    }
    $('body').on('click','.search-engine__aside-open, .search-engine__aside .card-header .close, .search-engine__toggles > button',function(){
        $('body .search-engine__aside').toggleClass('active')
    })

    
    
    $('#search-engine-snap > article > .row > div').removeClass('col-lg-3');
}
