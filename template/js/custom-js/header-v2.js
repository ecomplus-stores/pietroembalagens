// Topo da home v2: só faz algo se o markup v2 (.pe-h2) estiver na página (content/header.json -> pe_header_v2).
const $stripe = document.querySelector('.pe-h2.top-bar')

if ($stripe) {
  const messages = Array.from($stripe.querySelectorAll('.pe-h2__msg'))
  const interval = Number($stripe.getAttribute('data-rotate-ms')) || 4000
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let current = 0
  // Com movimento reduzido a tarja fica parada na primeira mensagem. As duas continuam no DOM.
  if (messages.length > 1 && !reduceMotion) {
    setInterval(() => {
      if (document.hidden) return
      messages[current].classList.remove('is-active')
      current = (current + 1) % messages.length
      messages[current].classList.add('is-active')
    }, interval)
  }
}

// "Ver todas" das categorias: celular abre o menu lateral; computador abre o megamenu "Ver todas" do topo.
document.addEventListener('click', event => {
  const link = event.target.closest && event.target.closest('[data-pe-see-all]')
  if (!link) return
  event.preventDefault()
  if (window.innerWidth < 992) {
    if (typeof window.toggleSidenav === 'function') window.toggleSidenav()
    return
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
  const $all = document.getElementById('cd-all')
  if ($all) $all.click()
})

// Banner: a altura acompanha o slide que está na tela. Slides com proporções diferentes (1920×500 e 1597×700, por
// exemplo) deixavam um vazio branco embaixo do menor, porque a caixa tinha a altura do maior.
const $banner = document.querySelector('.pe-h2.banner-slider')

if ($banner) {
  const fit = () => {
    const slide = $banner.querySelector('.glide__slide--active') || $banner.querySelector('.glide__slide')
    const img = slide && slide.querySelector('img')
    if (!img || !img.complete || !img.clientWidth) return
    const height = img.getBoundingClientRect().height
    if (height > 40) $banner.style.setProperty('height', Math.round(height) + 'px', 'important')
  }
  $banner.addEventListener('load', fit, true)
  window.addEventListener('resize', fit)
  if (window.MutationObserver) {
    new MutationObserver(fit).observe($banner, { attributes: true, attributeFilter: ['class'], subtree: true })
  }
  fit()
}
