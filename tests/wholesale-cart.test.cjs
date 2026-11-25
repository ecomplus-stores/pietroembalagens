const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { test } = require('node:test')

const source = readFileSync(join(__dirname, '../template/js/custom-js/wholesale-cart.js'), 'utf8')
const wholesale = import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

test('CA-ATC-002: habilita exatamente aos R$ 700 em produtos', async () => {
  const { remainingWholesale } = await wholesale
  assert.equal(remainingWholesale(699.99), 0.01)
  assert.equal(remainingWholesale(700), 0)
  assert.equal(remainingWholesale(1000), 0)
})

test('CA-ATC-003: conserva a seleção e as quantidades no WhatsApp', async () => {
  const { wholesaleMessage, wholesaleWhatsapp } = await wholesale
  const message = wholesaleMessage([
    { name: 'Caixa Natal', sku: 'NATAL-10', quantity: 2 },
    { name: 'Caixa com visor', sku: 'VISOR-20', quantity: 1 },
    { name: 'Brinde', flags: ['freebie'], quantity: 1 }
  ])
  const url = new URL(wholesaleWhatsapp(message))
  assert.equal(url.origin + url.pathname, 'https://wa.me/551151995309')
  assert.equal(url.searchParams.get('text'), message)
  assert.match(message, /2 pacotes — Caixa Natal \(cód\. NATAL-10\)/)
  assert.match(message, /1 pacote — Caixa com visor \(cód\. VISOR-20\)/)
  assert.doesNotMatch(message, /Brinde/)
  assert.equal(wholesaleWhatsapp(message.repeat(100)), '')
})

test('CA-ATC-004: origem do catálogo permanece na aba ao navegar', async () => {
  const { isWholesaleVisit } = await wholesale
  const stored = new Map()
  global.window = { location: { search: '?utm_source=varejo' }, sessionStorage: {
    setItem: (key, value) => stored.set(key, value), getItem: key => stored.get(key)
  } }
  try {
    assert.equal(isWholesaleVisit(), false)
    window.location.search = '?utm_source=catalogo_revenda'
    assert.equal(isWholesaleVisit(), true)
    window.location.search = ''
    assert.equal(isWholesaleVisit(), true)
  } finally {
    delete global.window
  }
})
