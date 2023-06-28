// Add your custom JavaScript for storefront pages here.
$('body').on('click','.search-engine__aside-open, .search-engine__aside .card-header .close, .search-engine__toggles > button',function(){
    $('body .search-engine__aside').toggleClass('active')
})
$('#search-engine-snap, #search-engine-load').wrap('<div class="container"></div>').wrap('<div class="row"></div>').wrap('<div class="col-md-9 col-12 offset-md-3"></div>');
$('#search-engine-snap > article > .row > div').removeClass('col-lg-3');
$('#c-645995294bd2e929c1f2d64f').replaceWith('<a href="/caixas-embalagens-para-doces-e-brigadeiro" id="c-645995294bd2e929c1f2d64f" class="menu__item"><span>Embalagem para Doces</span></a>')
$('#goToCart').on('click', (e) => {
    $('#addCart').click()
    window.ecomCart.on('addItem', (data) => { 
        console.log(data)
        window.location = '/app/#/cart/'
    })
})