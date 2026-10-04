// Quadros personalizados da home: histórico guardado só no navegador (localStorage) e montagem da fileira.
// Só funções puras; o que lê a página e chama a API fica em index.js.
export const KEYS = { viewed: 'pe-boxes-viewed', term: 'pe-boxes-term' }
export const MAX_VIEWED = 12
export const MAX_BOXES = 9

export const DEFAULT_TITLES = {
  viewed: 'Visto recentemente',
  search: 'Sua busca',
  related: 'Também te interessa',
  sales: 'Mais vendidos',
  offers: 'Promoções',
  news: 'Novidades'
}

// Quadros de reserva por categoria (o mais vendido de cada uma): ids e nomes das prateleiras da home (content/home.json).
export const DEFAULT_CATEGORIES = [
  { id: '64d032db2cd6b659590b9090', title: 'Caixas p/ Transporte' },
  { id: '684f22a8578b5f79543fbdd6', title: 'Caixas para presente' },
  { id: '6468b95ca0e875411e95fc22', title: 'Forminhas' }
]

export const safeId = value => /^[a-f0-9]{24}$/i.test(value || '')

export function readViewed (storage) {
  try {
    const list = JSON.parse(storage.getItem(KEYS.viewed))
    return Array.isArray(list)
      ? list.filter((id, i) => safeId(id) && list.indexOf(id) === i).slice(0, MAX_VIEWED)
      : []
  } catch (_) { return [] }
}

// O mais recente vai para o começo; repetido sobe em vez de duplicar.
export function addViewed (storage, id) {
  if (!safeId(id)) return
  const list = [id, ...readViewed(storage).filter(item => item !== id)].slice(0, MAX_VIEWED)
  try { storage.setItem(KEYS.viewed, JSON.stringify(list)) } catch (_) {}
}

export function cleanTerm (value) {
  const term = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 80)
  return term.length >= 2 ? term : ''
}

export function readTerm (storage) {
  try { return cleanTerm(storage.getItem(KEYS.term)) } catch (_) { return '' }
}

export function saveTerm (storage, value) {
  const term = cleanTerm(value)
  if (!term) return
  try { storage.setItem(KEYS.term, term) } catch (_) {}
}

// Cada quadro mostra 1 produto. Percorre os candidatos na ordem dada (pessoais primeiro, depois os de reserva),
// pega o primeiro produto exibível que ainda não apareceu em outro quadro e para em `max` quadros.
export function composeBoxes (candidates, showable, max = MAX_BOXES) {
  const used = new Set()
  const boxes = []
  for (const box of candidates) {
    if (boxes.length >= max) break
    const item = (box.items || []).find(it => it && !used.has(it._id) && showable(it))
    if (!item) continue
    used.add(item._id)
    boxes.push({ key: box.key, title: box.title, link: box.link, item })
  }
  return boxes
}

// Os produtos de um quadro "Visto recentemente" vêm da busca sem ordem garantida: reordena pela ordem do histórico.
export function sortByViewed (items, viewedIds) {
  return [...items].sort((a, b) => viewedIds.indexOf(a._id) - viewedIds.indexOf(b._id))
}

export function escapeHtml (value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ))
}

// Parcelas do jeito do tema (APrices): nº de parcelas = menor entre preço / parcela mínima (padrão R$ 5) e o máximo
// da loja; com juros mensais usa a tabela Price. `option` é window.storefront.info.list_payments.installments_option.
export function installmentsOf (price, option) {
  if (!option || !(price > 0)) return null
  const number = Math.min(Math.floor(price / (option.min_installment || 5)), option.max_number || 0)
  if (number < 2) return null
  const interest = (option.monthly_interest || 0) / 100
  const value = interest ? price * interest / (1 - Math.pow(1 + interest, -number)) : price / number
  return { number, value, interestFree: !interest }
}

const cleanTitle = (value, fallback) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 40) || fallback

// O painel guarda a categoria como "<id>:categories:<nome>:<caminho>" (o mesmo formato das prateleiras da home).
export function parseCategory (value, title) {
  const [id, , name] = String(value || '').split(':')
  if (!safeId(id)) return null
  const finalTitle = cleanTitle(title, cleanTitle(name, ''))
  return finalTitle ? { id, title: finalTitle } : null
}

// Configuração vinda do painel (atributo data-config da seção). Qualquer campo ausente ou inválido cai no padrão,
// então a seção sem configuração continua igual à de antes. Lista de categorias vazia ([]) é respeitada: sem reserva.
export function normalizeConfig (raw) {
  const config = raw && typeof raw === 'object' ? raw : {}
  const titles = {}
  for (const key in DEFAULT_TITLES) titles[key] = cleanTitle(config.titles && config.titles[key], DEFAULT_TITLES[key])
  return {
    max: Math.floor(Number(config.max)) >= 1 ? Math.min(12, Math.floor(Number(config.max))) : MAX_BOXES,
    titles,
    categories: Array.isArray(config.categories)
      ? config.categories.map(item => parseCategory(item && item.category, item && item.title)).filter(Boolean).slice(0, 6)
      : DEFAULT_CATEGORIES
  }
}
