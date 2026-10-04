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
