// Escada de pacotes da página de produto (site/alteracoes-no-site/59-pdp-nova-escada-3-colunas.md no ccos-ratos).
// Mesmos degraus e descontos de window.productKitCtas; só muda como aparecem. O total é o mesmo que TheProduct.buy()
// manda ao carrinho: preço unitário × pacotes × (100 − desconto) / 100, sem arredondar antes (o carrinho soma assim).
// Meio centavo sobe, sem o ruído do ponto flutuante (13,9 × 5 × 0,95 dá 66,02499… numa ordem de contas e 66,0250… em outra).
export const roundMoney = value => Math.round(value * 100 + 1e-6) / 100

const discountOf = kit => (kit && kit.discount > 0 ? kit.discount : 0)

export const buildLadder = ({ price, basePrice, onPromotion, kitCta, packUnits }) => {
  if (!(price > 0)) return []
  const steps = [{ qnt: 1, discount: 0 }]
  ;(Array.isArray(kitCta) ? kitCta : []).forEach(kit => {
    if (kit && Number.isInteger(kit.qnt) && kit.qnt > 1 && !steps.some(step => step.qnt === kit.qnt)) {
      steps.push({ qnt: kit.qnt, discount: discountOf(kit) })
    }
  })
  steps.sort((a, b) => a.qnt - b.qnt)
  const hasFullPrice = Boolean(onPromotion) && basePrice > price
  const bestDiscount = Math.max(...steps.map(step => step.discount))
  return steps.map(({ qnt, discount }) => {
    const total = roundMoney(price * qnt * (100 - discount) / 100)
    const compareTotal = hasFullPrice ? roundMoney(basePrice * qnt) : 0
    const units = packUnits > 1 ? packUnits * qnt : 0
    return {
      qnt,
      units,
      total,
      compareTotal,
      each: total / (units || qnt),
      // Promoção: economia total sobre o preço cheio, arredondada para baixo. Sem promoção: o desconto por quantidade.
      off: compareTotal ? Math.floor((compareTotal - total) * 100 / compareTotal) : discount,
      isBest: steps.length > 1 && discount > 0 && discount === bestDiscount
    }
  })
}

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
