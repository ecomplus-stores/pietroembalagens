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

test('chave da PDP nova: desligada por padrão no arquivo publicado', () => {
  const shipped = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../template/public/pe-pdp-nova.json'), 'utf8'))
  assert.deepEqual(shipped, { enabled: false })
})

test('chave da PDP nova: ?pdp=nova e ?pdp=antiga mandam sobre o arquivo, e a escolha da aba segue valendo', () => {
  const f = path.resolve(__dirname, '../template/js/custom-js/pdp-nova.js')
  const m = { exports: {} }
  new Function('module', 'exports', babel.transformSync(fs.readFileSync(f, 'utf8'), { filename: f, presets: [['@babel/preset-env', { targets: { node: '20' } }]], babelrc: false, configFile: false }).code)(m, m.exports)
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
