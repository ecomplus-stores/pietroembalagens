// Escada de pacotes da página de produto (site/alteracoes-no-site/59-pdp-nova-escada-3-colunas.md no ccos-ratos).
// Mesmos degraus e descontos de window.productKitCtas; só muda como aparecem. O total é o mesmo que TheProduct.buy()
// manda ao carrinho: preço unitário × pacotes × (100 − desconto) / 100, sem arredondar antes (o carrinho soma assim).
// Meio centavo sobe, sem o ruído do ponto flutuante (13,9 × 5 × 0,95 dá 66,02499… numa ordem de contas e 66,0250… em outra).
export const roundMoney = value => Math.round(value * 100 + 1e-6) / 100

const discountOf = kit => (kit && kit.discount > 0 ? kit.discount : 0)

const makeStep = ({ qnt, discount, price, basePrice, hasFullPrice, packUnits }) => {
  const total = roundMoney(price * qnt * (100 - discount) / 100)
  const compareTotal = hasFullPrice ? roundMoney(basePrice * qnt) : 0
  const units = packUnits > 1 ? packUnits * qnt : 0
  return {
    qnt,
    units,
    discount,
    total,
    compareTotal,
    each: total / (units || qnt),
    // Promoção: economia total sobre o preço cheio, arredondada para baixo. Sem promoção: o desconto por quantidade.
    off: compareTotal ? Math.floor((compareTotal - total) * 100 / compareTotal) : discount
  }
}

const kitsOf = kitCta => (Array.isArray(kitCta) ? kitCta : [])
  .filter(kit => kit && Number.isInteger(kit.qnt) && kit.qnt > 1)
  .sort((a, b) => a.qnt - b.qnt)

export const buildLadder = ({ price, basePrice, onPromotion, kitCta, packUnits }) => {
  if (!(price > 0)) return []
  const steps = [{ qnt: 1, discount: 0 }]
  kitsOf(kitCta).forEach(kit => {
    if (!steps.some(step => step.qnt === kit.qnt)) steps.push({ qnt: kit.qnt, discount: discountOf(kit) })
  })
  steps.sort((a, b) => a.qnt - b.qnt)
  const hasFullPrice = Boolean(onPromotion) && basePrice > price
  const bestDiscount = Math.max(...steps.map(step => step.discount))
  return steps.map(({ qnt, discount }) => ({
    ...makeStep({ qnt, discount, price, basePrice, hasFullPrice, packUnits }),
    isBest: steps.length > 1 && discount > 0 && discount === bestDiscount
  }))
}

// "Outra quantidade": vale o maior degrau já alcançado (7 pacotes ganham o desconto dos 5; 3 e 4, o dos 2).
// tier é o degrau (1 quando nenhum); o carrinho guarda tier como quantidade mínima, para o desconto não se perder ao reduzir.
export const tierFor = (qnt, kitCta) => {
  const reached = kitsOf(kitCta).filter(kit => kit.qnt <= qnt)
  const kit = reached[reached.length - 1]
  return kit ? { qnt: kit.qnt, discount: discountOf(kit) } : { qnt: 1, discount: 0 }
}

export const MAX_CUSTOM_QNT = 999

// Quantidade digitada vira inteiro entre 1 e o máximo (estoque ou 999); vazio e lixo voltam ao mínimo.
export const clampQnt = (value, max) => {
  const limit = Math.max(1, Math.min(MAX_CUSTOM_QNT, Number.isFinite(max) && max > 0 ? Math.floor(max) : MAX_CUSTOM_QNT))
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, limit) : 1
}

export const buildCustomStep = ({ qnt, price, basePrice, onPromotion, kitCta, packUnits }) => {
  if (!(price > 0)) return null
  const { discount } = tierFor(qnt, kitCta)
  const hasFullPrice = Boolean(onPromotion) && basePrice > price
  return makeStep({ qnt, discount, price, basePrice, hasFullPrice, packUnits })
}

// Empurrãozinho: só quando falta 1 pacote para o degrau mais econômico (ex.: 4 → 5). Fora disso, null.
// extra = quanto o total sobe ao ir para o degrau; off = o selo do cartão desse degrau.
export const nudgeFor = (customStep, ladder) => {
  const best = (ladder || []).find(step => step.isBest)
  if (!customStep || !best || customStep.qnt !== best.qnt - 1 || customStep.qnt < 2) return null
  return { qnt: best.qnt, extra: roundMoney(best.total - customStep.total), off: best.off }
}

// "3% OFF a partir de 2, 5% a partir de 5", a partir dos degraus da escada.
export const discountHint = ladder => (ladder || [])
  .filter(step => step.discount > 0)
  .map((step, i) => `${step.discount}%${i ? '' : ' OFF'} a partir de ${step.qnt}`)
  .join(', ')

// Escada só vira escolha quando há mais de um degrau; um degrau só é cartão fixo, sem cara de opção.
export const isChoice = ladder => ladder.length > 1

export const BENEFIT_FIELDS = ['serve_para', 'material', 'cuidado']

// Lê serve_para, material e cuidado das especificações; linha sem dado some, sem nenhuma a caixa some.
export const buildBenefits = specifications => {
  const specs = specifications || {}
  return BENEFIT_FIELDS.map(field => {
    const values = Array.isArray(specs[field]) ? specs[field] : []
    const text = values.map(value => value && String(value.text || value.value || '').trim()).filter(Boolean).join(' · ')
    return text ? { field, text } : null
  }).filter(Boolean)
}

// Prazo de postagem: a regra é a do item 56 (window.peDeliveryDate.postaHoje, em code.json, com a lista de feriados).
export const postingText = postsToday => postsToday
  ? 'Pague até 12h e postamos hoje'
  : 'Pague hoje e postamos no próximo dia útil'
