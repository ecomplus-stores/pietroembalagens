// Topo da home v2: só faz algo se o markup v2 (.pe-h2) estiver na página (content/header.json -> pe_header_v2).
// Cápsula de promoções: alterna as mensagens (todas ficam no DOM) a cada promo_rotate_ms.
const $promo = document.querySelector('.pe-h2__promo')

if ($promo) {
  const messages = Array.from($promo.querySelectorAll('.pe-h2__promo-msg'))
  const interval = Number($promo.getAttribute('data-rotate-ms')) || 4000
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let current = 0
  let paused = false
  // Com movimento reduzido a cápsula fica parada na primeira mensagem. Passar o mouse ou focar pausa a troca.
  if (messages.length > 1 && !reduceMotion) {
    $promo.addEventListener('mouseenter', () => { paused = true })
    $promo.addEventListener('mouseleave', () => { paused = false })
    $promo.addEventListener('focusin', () => { paused = true })
    $promo.addEventListener('focusout', () => { paused = false })
    setInterval(() => {
      if (document.hidden || paused) return
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
    // No computador a altura é fixa (CSS); aqui só se acompanha o slide em telas menores.
    if (window.matchMedia('(min-width: 992px)').matches) {
      $banner.style.removeProperty('height')
      return
    }
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
