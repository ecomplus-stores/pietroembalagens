const test = require('node:test')
const { before, after } = test
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const zlib = require('node:zlib')

const functionsRequire = createRequire(path.resolve(__dirname, '../.functions/package.json'))
const express = functionsRequire('express')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-compression-'))
fs.writeFileSync(path.join(directory, 'bundles.json'), JSON.stringify({ assetsByChunkName: {} }))
fs.writeFileSync(path.join(directory, 'data.json'), JSON.stringify({ data: {} }))
process.env.STOREFRONT_BUNDLES_PATH = path.join(directory, 'bundles.json')
process.env.STORE_DATA_CACHE_PATH = path.join(directory, 'data.json')
process.env.STORE_DATA_FROM_CACHE = 'true'
// Controlled views; the renderer's HTTP handler, minifier and Firebase export are real.
process.env.NODE_ENV = 'development'
const library = functionsRequire('@ecomplus/storefront-renderer')
const html = '<!doctype html><html lang="pt-br"><head><title>Caixas Pietro</title></head><body>' +
  '<p>Caixa kraft com berço: R$ 12,90 — quantidade 4, frete e variações.</p>'.repeat(180) +
  '<script type="application/ld+json">{"@type":"Product","name":"Caixa com berço","offers":{"price":"12.90"}}</script></body></html>'
const view = library.renderer
library.renderer = async url => {
  if (url === '/render-error') throw new Error('Expected renderer failure fixture')
  if (url === '/missing' || url.startsWith('/~reverse-proxy/') || url === '/redirect/') return null
  if (url === '/small') return '<html><body>Pequeno</body></html>'
  return html
}
const originalSsr = functionsRequire('@ecomplus/storefront-renderer/functions/').ssr
library.renderer = view
const exportedSsr = functionsRequire('./index.js').ssr
let originalPort, compressedPort, upstreamPort
const servers = []

async function listen (handler) {
  const server = http.createServer(handler)
  servers.push(server)
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return server.address().port
}

function app (handler) {
  const server = express()
  server.use((req, res) => {
    res.set('Vary', 'Cookie')
    const send = res.send
    res.send = function (body) {
      if (req.path === '/json') this.type('application/json')
      if (req.path === '/no-transform') this.set('Cache-Control', 'private, no-transform')
      if (req.path === '/encoded') {
        this.type('html').set('Content-Encoding', 'gzip')
        body = zlib.gzipSync(body)
      }
      if (req.path.startsWith('/~reverse-proxy/')) {
        this.set('X-Test-Compression-Installed', String(typeof this.flush === 'function'))
      }
      return send.call(this, body)
    }
    Promise.resolve(handler(req, res)).catch(error => {
      res.status(500).send(error.message)
    })
  })
  return server
}

function request (port, route = '/product', encoding = 'gzip', method = 'GET') {
  return new Promise((resolve, reject) => {
    const headers = encoding === null ? {} : { 'Accept-Encoding': encoding }
    const req = http.request({ hostname: '127.0.0.1', port, path: route, method, headers }, res => {
      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
      res.on('error', reject)
    })
    req.setTimeout(5000, () => req.destroy(new Error('Local HTTP response timed out')))
    req.on('error', reject)
    req.end()
  })
}

function decode (response) {
  switch (response.headers['content-encoding']) {
    case 'gzip': return zlib.gunzipSync(response.body)
    case 'br': return zlib.brotliDecompressSync(response.body)
    case 'deflate': return zlib.inflateSync(response.body)
    default: return response.body
  }
}

before(async () => {
  originalPort = await listen(app(originalSsr))
  compressedPort = await listen(app(exportedSsr))
  upstreamPort = await listen((req, res) => {
    res.setHeader('Content-Type', req.url === '/html' ? 'text/html' : 'application/javascript')
    res.setHeader('Vary', 'Origin')
    res.setHeader('Cache-Control', 'public, max-age=120')
    res.end(req.url === '/html' ? html : 'window.proxyPreserved = true;'.repeat(100))
  })
  // Only the test's loopback upstream bypasses the inherited HTTP proxy.
  process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1'].filter(Boolean).join(',')
})

after(async () => {
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
  fs.rmSync(directory, { recursive: true, force: true })
})

for (const encoding of ['gzip', 'br', 'deflate']) {
  test(`${encoding}: exported Firebase handler preserves the exact renderer HTML and cache`, async () => {
    const original = await request(originalPort, '/product', 'identity')
    const compressed = await request(compressedPort, '/product', encoding)
    assert.equal(compressed.status, 200)
    assert.equal(compressed.headers['content-encoding'], encoding)
    assert.deepEqual(decode(compressed), original.body)
    assert.ok(compressed.body.length < original.body.length / 2)
    assert.equal(compressed.headers['content-length'], undefined)
    assert.equal(compressed.headers['cache-control'], original.headers['cache-control'])
    assert.equal(compressed.headers['content-type'], original.headers['content-type'])
    assert.match(compressed.headers.vary, /Cookie/)
    assert.match(compressed.headers.vary, /Accept-Encoding/)
  })
}

for (const [encoding, expected] of [
  ['br, gzip', 'br'],
  ['br;q=0, gzip;q=1', 'gzip'],
  ['gzip;q=0, br;q=1', 'br'],
  ['br;q=0.2, gzip;q=0.8', 'gzip'],
  ['gzip;q=0, br;q=0, deflate;q=0, identity;q=1', undefined],
  ['identity', undefined],
  [null, undefined]
]) {
  test(`Accept-Encoding ${encoding}: respects encoding preferences and refusals`, async () => {
    const original = await request(originalPort, '/product', 'identity')
    const result = await request(compressedPort, '/product', encoding)
    assert.equal(result.headers['content-encoding'], expected)
    assert.deepEqual(decode(result), original.body)
    if (!expected) assert.equal(Number(result.headers['content-length']), original.body.length)
  })
}

test('HEAD keeps the original content length and never sends a compressed body', async () => {
  const original = await request(originalPort, '/product', 'gzip', 'HEAD')
  const result = await request(compressedPort, '/product', 'gzip', 'HEAD')
  assert.equal(result.status, original.status)
  assert.equal(result.headers['content-encoding'], undefined)
  assert.equal(result.headers['content-length'], original.headers['content-length'])
  assert.equal(result.body.length, 0)
  assert.match(result.headers.vary, /Accept-Encoding/)
})

for (const route of ['/redirect/', '/missing', '/small']) {
  test(`${route}: preserves redirect, 404 and small responses without unnecessary compression`, async () => {
    const original = await request(originalPort, route)
    const result = await request(compressedPort, route)
    assert.equal(result.status, original.status)
    assert.equal(result.headers.location, original.headers.location)
    assert.equal(result.headers['content-encoding'], undefined)
    assert.equal(result.headers['cache-control'], original.headers['cache-control'])
    assert.deepEqual(result.body, original.body)
  })
}

test('renderer rejection retains its existing 404 fallback and completes the HTTP response', async () => {
  const previous = console.error
  const errors = []
  console.error = error => errors.push(error)
  try {
    const original = await request(originalPort, '/render-error')
    const result = await request(compressedPort, '/render-error')
    assert.equal(result.status, 404)
    assert.deepEqual(result.body, original.body)
    assert.equal(errors.length, 2)
  } finally { console.error = previous }
})

for (const route of ['/json', '/no-transform', '/encoded']) {
  test(`${route}: leaves non-HTML, no-transform and already encoded responses alone`, async () => {
    const original = await request(originalPort, route)
    const result = await request(compressedPort, route)
    assert.equal(result.status, original.status)
    assert.equal(result.headers['content-encoding'], original.headers['content-encoding'])
    assert.equal(result.headers['content-length'], original.headers['content-length'])
    assert.equal(result.headers['cache-control'], original.headers['cache-control'])
    assert.deepEqual(result.body, original.body)
    if (route === '/encoded') assert.match(decode(result).toString(), /R\$ 12,90/)
    if (route === '/json') assert.equal(result.headers.vary, 'Cookie')
  })
}

for (const resource of ['html', 'script']) {
  test(`reverse proxy ${resource}: preserves the real upstream response and bypasses middleware entirely`, async () => {
    const route = '/~reverse-proxy/?url=' + encodeURIComponent(`http://127.0.0.1:${upstreamPort}/${resource}`)
    const original = await request(originalPort, route)
    const result = await request(compressedPort, route)
    assert.equal(result.status, 200)
    for (const header of ['content-type', 'content-length', 'content-encoding', 'cache-control', 'vary', 'access-control-allow-origin']) {
      assert.equal(result.headers[header], original.headers[header], header)
    }
    assert.equal(result.headers['x-test-compression-installed'], 'false')
    assert.deepEqual(result.body, original.body)
  })
}
