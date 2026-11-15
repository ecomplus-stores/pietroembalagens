// Chave do cartão "Outra quantidade" da página de produto nova (site/alteracoes-no-site/ no ccos-ratos).
// /pe-pdp-qtd.json liga e desliga para todo mundo; ?qtd=nova mostra e ?qtd=antiga esconde (guardado na aba).
// Qualquer falha ou arquivo desligado: a escada de 1, 2 e 5 pacotes de hoje, sem mudança nenhuma.
const CONFIG = '/pe-pdp-qtd.json'
const STORE_KEY = 'pe-qtd'
const MODES = ['nova', 'antiga']
let pending

export const pickQtdMode = ({ search, stored, enabled }) => {
  let param = null
  try { param = new URLSearchParams(search || '').get('qtd') } catch (e) {}
  if (MODES.includes(param)) return { isNova: param === 'nova', remember: param, isOverride: true }
  if (MODES.includes(stored)) return { isNova: stored === 'nova', remember: null, isOverride: true }
  return { isNova: enabled === true, remember: null, isOverride: false }
}

const readStored = () => { try { return window.sessionStorage.getItem(STORE_KEY) } catch (e) { return null } }
const writeStored = value => { try { window.sessionStorage.setItem(STORE_KEY, value) } catch (e) {} }

export const loadPdpQtd = () => {
  if (pending) return pending
  const mode = pickQtdMode({ search: window.location.search, stored: readStored(), enabled: false })
  if (mode.remember) writeStored(mode.remember)
  pending = mode.isOverride
    ? Promise.resolve(mode.isNova)
    : fetch(CONFIG + '?v=' + Math.floor(Date.now() / 60000), { credentials: 'same-origin', cache: 'no-cache' })
      .then(response => {
        if (!response.ok) throw new Error('pdp-qtd')
        return response.json()
      })
      .then(config => Boolean(config) && config.enabled === true)
      .catch(() => false)
  return pending
}
