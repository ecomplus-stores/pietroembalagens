// Add your custom JavaScript for storefront pages here.
$('body').on('click','.search-engine__aside-open, .search-engine__aside .card-header .close, .search-engine__toggles > button',function(){
    $('body .search-engine__aside').toggleClass('active')
})