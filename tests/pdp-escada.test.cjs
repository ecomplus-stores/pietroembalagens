const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const babel = require('@babel/core')
const file = path.resolve(__dirname, '../template/js/custom-js/pdp-escada.js')
const module_ = { exports: {} }
const code = babel.transformSync(fs.readFileSync(file, 'utf8'), { filename: file, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code
new Function('module', 'exports', code)(module_, module_.exports)
const { buildLadder, isChoice, buildBenefits, postingText, roundMoney } = module_.exports
const KITS = [{ qnt: 2, discount: 3 }, { qnt: 5, discount: 5 }]
const cents = n => Math.round(n * 100)

test('escada: totais de 1, 2 e 5 pacotes batem com a conta do carrinho', () => {
  const ladder = buildLadder({ price: 19.49, basePrice: 19.49, onPromotion: false, kitCta: KITS, packUnits: 10 })
  assert.deepEqual(ladder.map(s => s.qnt), [1, 2, 5])
  // TheProduct.buy(): unitário com desconto × quantidade; carrinho soma quantity × price sem arredondar antes.
  for (const { qnt, total } of ladder) {
    const d = qnt === 2 ? 3 : qnt === 5 ? 5 : 0
    const unit = 19.49 * (100 - d) / 100
    assert.equal(cents(qnt * unit), cents(total), `${qnt} pacotes`)
  }
  assert.deepEqual(ladder.map(s => cents(s.total)), [1949, 3781, 9258])
  assert.deepEqual(ladder.map(s => s.off), [0, 3, 5])
  assert.deepEqual(ladder.map(s => s.units), [10, 20, 50])
  assert.deepEqual(ladder.map(s => s.isBest), [false, false, true])
  assert.equal(cents(ladder[0].each), 195)
  assert.equal(ladder[0].compareTotal, 0)
})

test('escada: promoção mostra total cheio riscado e economia sobre o preço cheio (15, 17 e 19)', () => {
  const ladder = buildLadder({ price: 19.49, basePrice: 22.99, onPromotion: true, kitCta: KITS, packUnits: 10 })
  assert.deepEqual(ladder.map(s => s.off), [15, 17, 19])
  assert.deepEqual(ladder.map(s => cents(s.compareTotal)), [2299, 4598, 11495])
})

test('escada: sem pacote_com mostra preço por pacote, sem unidades', () => {
  const ladder = buildLadder({ price: 10, basePrice: 10, onPromotion: false, kitCta: KITS, packUnits: 0 })
  assert.equal(ladder[1].units, 0)
  assert.equal(cents(ladder[1].each), 970)
})

test('escada: sem desconto por quantidade fica um cartão fixo, não uma escolha', () => {
  for (const kitCta of [undefined, [], {}]) {
    const ladder = buildLadder({ price: 19.49, basePrice: 19.49, onPromotion: false, kitCta, packUnits: 10 })
    assert.equal(ladder.length, 1)
    assert.equal(isChoice(ladder), false)
    assert.equal(ladder[0].isBest, false)
  }
  assert.deepEqual(buildLadder({ price: 0, kitCta: KITS }), [])
})

test('benefícios: linha sem dado some e caixa sem dado some', () => {
  assert.deepEqual(buildBenefits(undefined), [])
  assert.deepEqual(buildBenefits({ serve_para: [], material: [{ text: ' ' }] }), [])
  assert.deepEqual(buildBenefits({ material: [{ text: 'Papel cartão' }], cuidado: [{ text: 'Só montar' }, { text: 'sem cola' }], outro: [{ text: 'x' }] }),
    [{ field: 'material', text: 'Papel cartão' }, { field: 'cuidado', text: 'Só montar · sem cola' }])
})

test('prazo: antes das 12h em dia útil posta hoje', () => {
  assert.equal(postingText(true), 'Pague até 12h e postamos hoje')
  assert.equal(postingText(false), 'Pague hoje e postamos no próximo dia útil')
})

test('chave da PDP nova: arquivo publicado é {"enabled": true|false}', () => {
  const shipped = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../template/public/pe-pdp-nova.json'), 'utf8'))
  assert.deepEqual(Object.keys(shipped), ['enabled'])
  assert.equal(typeof shipped.enabled, 'boolean')
})

test('chave da PDP nova: ?pdp=nova e ?pdp=antiga mandam sobre o arquivo, e a escolha da aba segue valendo', () => {
  const f = path.resolve(__dirname, '../template/js/custom-js/pdp-nova.js')
  const m = { exports: {} }
  new Function('module', 'exports', 'require', babel.transformSync(fs.readFileSync(f, 'utf8'), { filename: f, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code)(m, m.exports, () => ({ pickShipping () {} }))
  const { pickMode } = m.exports
  assert.equal(pickMode({ search: '', stored: null, enabled: false }).isNova, false)
  assert.equal(pickMode({ search: '', stored: null, enabled: true }).isNova, true)
  assert.equal(pickMode({ search: '', stored: null, enabled: 'true' }).isNova, false, 'só true de verdade liga')
  assert.deepEqual(pickMode({ search: '?pdp=nova', stored: null, enabled: false }), { isNova: true, remember: 'nova', isOverride: true })
  assert.equal(pickMode({ search: '?x=1&pdp=antiga', stored: null, enabled: true }).isNova, false)
  assert.equal(pickMode({ search: '', stored: 'nova', enabled: false }).isNova, true)
  assert.equal(pickMode({ search: '', stored: 'antiga', enabled: true }).isNova, false)
  assert.equal(pickMode({ search: '?pdp=nova', stored: 'antiga', enabled: false }).isNova, true)
  assert.equal(pickMode({ search: '?pdp=lixo', stored: 'lixo', enabled: false }).isNova, false)
})

test('arredondamento: meio centavo sobe igual no cartão e na caixa (promoção de 13,90, 5 pacotes = 66,03)', () => {
  assert.equal(roundMoney(13.9 * 5 * 0.95), 66.03)
  assert.equal(roundMoney(13.9 * 5 * 95 / 100), 66.03)
  assert.equal(roundMoney(19.49 * 5 * 0.95), 92.58)
  assert.equal(roundMoney(19.49), 19.49)
  const ladder = buildLadder({ price: 13.9, basePrice: 21.89, onPromotion: true, kitCta: KITS, packUnits: 0 })
  assert.equal(ladder[2].total, 66.03)
})

test('frete: resumo escolhe a opção mais barata e a mais rápida a partir do texto da lista', () => {
  const f = path.resolve(__dirname, '../template/js/custom-js/pdp-frete.js')
  const m = { exports: {} }
  new Function('module', 'exports', babel.transformSync(fs.readFileSync(f, 'utf8'), { filename: f, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code)(m, m.exports)
  const { parsePrice, parseDay, pickShipping, orderShipping } = m.exports
  assert.equal(parsePrice('R$\u00a09,38'), 9.38)
  assert.equal(parsePrice('R$ 1.234,50'), 1234.5)
  assert.equal(parsePrice('Grátis'), 0)
  assert.equal(parsePrice('sem preço'), null)
  const now = new Date(2026, 10, 2)
  assert.equal(new Date(parseDay('Chega até 06/11 (sex)', now)).getDate(), 6)
  assert.equal(new Date(parseDay('Chega até 05/01 (ter)', new Date(2026, 11, 28))).getFullYear(), 2027)
  const options = [
    { name: 'Standard', when: 'Chega até 06/11 (sex)', price: 'R$ 9,38' },
    { name: 'Loggi Ponto', when: 'Chega até 09/11 (seg)', price: 'R$ 9,91' },
    { name: 'Sedex', when: 'Chega até 04/11 (qua)', price: 'R$ 9,94' }
  ]
  const picked = pickShipping(options, now)
  assert.equal(picked.cheapest.name, 'Standard')
  assert.equal(picked.fastest.name, 'Sedex')
  assert.equal(picked.total, 3)
  assert.equal(pickShipping([{ name: 'A', when: 'Chega até 04/11 (qua)', price: 'R$ 5,00' }, { name: 'B', when: 'Chega até 06/11 (sex)', price: 'R$ 9,00' }], now).fastest, null)
  assert.equal(pickShipping([], now), null)
  // diferença R$ 0,56 (até R$ 5): mais rápido primeiro; acima: mais barato primeiro; limite 0: ordem antiga
  assert.deepEqual(orderShipping(picked, 5).map(l => l[0]), ['Mais rápido', 'Mais barato'])
  assert.deepEqual(orderShipping(picked, 0).map(l => l[0]), ['Mais barato', 'Mais rápido'])
  const far = pickShipping([{ name: 'A', when: 'Chega até 06/11 (sex)', price: 'R$ 9,00' }, { name: 'B', when: 'Chega até 04/11 (qua)', price: 'R$ 14,50' }], now)
  assert.deepEqual(orderShipping(far, 5).map(l => l[0]), ['Mais barato', 'Mais rápido'])
  const same = pickShipping([{ name: 'A', when: 'Chega até 04/11 (qua)', price: 'R$ 9,00' }, { name: 'B', when: 'Chega até 06/11 (sex)', price: 'R$ 9,00' }], now)
  assert.deepEqual(orderShipping(same, 5).map(l => l[1].name), ['A'])
  assert.deepEqual(orderShipping(null, 5), [])
})
