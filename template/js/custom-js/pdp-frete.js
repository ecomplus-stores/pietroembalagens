// Resumo do frete na caixa de compra da PDP nova: lê o texto das opções que o calculador já mostra (sem mexer no cálculo)
// e destaca a mais barata e a mais rápida; a lista completa fica atrás de "ver outras opções".
export const parsePrice = text => {
  if (/gr[áa]tis/i.test(text || '')) return 0
  const match = /(\d{1,3}(?:\.\d{3})*,\d{2})/.exec(text || '')
  return match ? Number(match[1].replace(/\./g, '').replace(',', '.')) : null
}

// "Chega até 06/11 (sex)" -> instante do dia 06/11 (vira o ano seguinte quando a data já passou há mais de um mês).
export const parseDay = (text, now = new Date()) => {
  const match = /(\d{2})\/(\d{2})/.exec(text || '')
  if (!match) return null
  const day = new Date(now.getFullYear(), Number(match[2]) - 1, Number(match[1]))
  if (day < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 31)) day.setFullYear(day.getFullYear() + 1)
  return day.getTime()
}

// Ordem das duas linhas do resumo. Diferença de preço pequena (até `limit` reais): mais rápido primeiro; maior: mais barato primeiro.
// limit 0 (ou inválido) = ordem antiga (barato, rápido). Quando a mesma opção é a mais barata e a mais rápida, só há uma linha.
export const orderShipping = (picked, limit) => {
  if (!picked) return []
  const cheap = ['Mais barato', picked.cheapest]
  if (!picked.fastest) return [cheap]
  const fast = ['Mais rápido', picked.fastest]
  const max = Number(limit)
  const diff = Math.round((picked.fastest.cost - picked.cheapest.cost) * 100) / 100
  return max > 0 && diff <= max ? [fast, cheap] : [cheap, fast]
}

export const pickShipping = (options, now) => {
  const list = (options || [])
    .map(option => ({ ...option, cost: parsePrice(option.price), day: parseDay(option.when, now) }))
    .filter(option => option.cost !== null)
  if (!list.length) return null
  const late = Infinity
  const cheapest = [...list].sort((a, b) => a.cost - b.cost || (a.day === null ? late : a.day) - (b.day === null ? late : b.day))[0]
  const fastest = [...list].filter(option => option.day !== null).sort((a, b) => a.day - b.day || a.cost - b.cost)[0]
  return { cheapest, fastest: fastest && fastest !== cheapest ? fastest : null, total: list.length }
}
