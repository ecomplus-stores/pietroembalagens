// Add your custom JavaScript for storefront pages here.
$('body').on('click','.search-engine__aside-open, .search-engine__aside .card-header .close, .search-engine__toggles > button',function(){
    $('body .search-engine__aside').toggleClass('active')
})

$('#search-engine-snap > article > .row > div').removeClass('col-lg-3');

if (window.storefront && window.storefront.context && window.storefront.context.resource === 'categories') {
    window.storefront.on('widget:@ecomplus/widget-tag-manager', function () {
        setTimeout(() => {
            $('#search-engine-snap, #search-engine-load').appendTo('#search-engine .col-md-9.offset-md-1.col-12');
            $('.search-engine__retail .row').appendTo('#search-engine .col-md-9.offset-md-1.col-12');
        }, 800)
    })
}