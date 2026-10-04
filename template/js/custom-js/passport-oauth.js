import ecomPassport from '@ecomplus/passport-client'

// Login com Google/Windows: o popup do Passport confere o cookie _passport_<loja>_sig, gravado pelo
// iframe invisível. Se o navegador manda um cookie de outra sessão (outra aba, ou navegador que guarda
// o cookie do iframe separado do popup, como o Comet), o Passport responde "Invalid session, restart
// flow at login.html". Abrir o popup pelo oauth-session?redirect= regrava o cookie certo dentro do
// próprio popup e segue para o provedor — é o mesmo caminho que o Passport usa quando não há cookie.
const OAUTH_LINK = /^(https:\/\/passport\.e-com\.plus\/v1\/)([a-z]+)\/(\d+\/[A-Za-z0-9]+\/\d+)\/oauth$/

export const viaOauthSession = url => {
  const match = typeof url === 'string' && url.match(OAUTH_LINK)
  // link com query (ex.: ?referral=) fica como está: o Passport junta ?is_redirect=true e estraga a query
  if (!match) return url
  const [, base, provider, path] = match
  return `${base}${path}/oauth-session?redirect=${encodeURIComponent(`/v1/${provider}/${path}/oauth`)}`
}

const { popupOauthLink } = ecomPassport
ecomPassport.popupOauthLink = url => popupOauthLink(viaOauthSession(url))
