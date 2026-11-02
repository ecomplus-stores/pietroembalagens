// Chave da nova página de produto (site/alteracoes-no-site/59-pdp-nova-escada-3-colunas.md no ccos-ratos).
// /pe-pdp-nova.json liga e desliga para todo mundo; ?pdp=nova mostra a nova e ?pdp=antiga força a de antes
// (guardado na aba, para seguir navegando). Qualquer falha ou arquivo desligado: a página de hoje, sem mudança nenhuma.
const CONFIG = '/pe-pdp-nova.json'
const STORE_KEY = 'pe-pdp'
const MODES = ['nova', 'antiga']
let pending

export const pickMode = ({ search, stored, enabled }) => {
  let param = null
  try { param = new URLSearchParams(search || '').get('pdp') } catch (e) {}
  if (MODES.includes(param)) return { isNova: param === 'nova', remember: param, isOverride: true }
  if (MODES.includes(stored)) return { isNova: stored === 'nova', remember: null, isOverride: true }
  return { isNova: enabled === true, remember: null, isOverride: false }
}

const readStored = () => { try { return window.sessionStorage.getItem(STORE_KEY) } catch (e) { return null } }
const writeStored = value => { try { window.sessionStorage.setItem(STORE_KEY, value) } catch (e) {} }

// Coluna da caixa de compra: só existe na página nova (na de hoje a linha tem duas colunas, e o CSS da loja conta com isso).
const prepareDom = () => {
  const $block = document.getElementById('product-block')
  const $row = $block && $block.querySelector('#product > .row')
  if (!$row) return false
  $block.classList.add('pdp-nova')
  $row.classList.add('pdp-grid')
  $row.children[0] && $row.children[0].classList.add('pdp-gallery')
  $row.children[1] && $row.children[1].classList.add('pdp-info')
  const $sku = $block.querySelector('.product__sku')
  if ($sku && !document.getElementById('pe-ml-reviews-summary')) {
    const $summary = document.createElement('div')
    $summary.id = 'pe-ml-reviews-summary'
    const $product = $block.querySelector('#product')
    $summary.dataset.sku = ($product && $product.dataset.sku) || ''
    $sku.insertAdjacentElement('afterend', $summary)
  }
  if (!document.getElementById('product-buybox')) {
    const $col = document.createElement('div')
    $col.className = 'col-12 pdp-buybox-col'
    $col.innerHTML = '<aside id="product-buybox" class="pdp-buybox"></aside>'
    $row.appendChild($col)
  }
  return true
}

export const loadPdpNova = () => {
  if (pending) return pending
  const mode = pickMode({ search: window.location.search, stored: readStored(), enabled: false })
  if (mode.remember) writeStored(mode.remember)
  const decide = mode.isOverride
    ? Promise.resolve(mode.isNova)
    : fetch(CONFIG + '?v=' + Math.floor(Date.now() / 60000), { credentials: 'same-origin', cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error('pdp-nova')
        return response.json()
      })
      .then(config => Boolean(config) && config.enabled === true)
      .catch(() => false)
  pending = decide.then(isNova => isNova && prepareDom())
  return pending
}
