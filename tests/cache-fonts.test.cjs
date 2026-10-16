const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { once } = require('node:events')
const { createHash } = require('node:crypto')
const superstatic = require('superstatic').default

const root = path.resolve(__dirname, '..')
const hosting = require('../firebase.json').hosting
const provenance = require('../template/public/assets/fonts/quicksand-sources.json')
const fontPaths = provenance.files.map(file => '/assets/fonts/' + file.file)
const longCache = 'public, max-age=31536000, immutable'
const assetCache = 'public, max-age=86400, s-maxage=600'
const cacheHeaders = rule => rule.headers.filter(header => header.key.toLowerCase() === 'cache-control')
const immutableRules = hosting.headers.filter(rule => cacheHeaders(rule).some(header => /\bimmutable\b/.test(header.value)))

test('immutable rules target only the three fonts whose names match their content hashes', () => {
  assert.equal(provenance.files.length, 3)
  assert.deepEqual(immutableRules.map(rule => rule.source).sort(), fontPaths.slice().sort())
  const genericIndex = hosting.headers.findIndex(rule => rule.source === '/assets/**')
  assert.ok(genericIndex >= 0)
  for (const file of provenance.files) {
    const bytes = fs.readFileSync(path.join(root, 'template/public/assets/fonts', file.file))
    const digest = createHash('sha256').update(bytes).digest('hex')
    assert.equal(digest, file.sha256, file.file + ' provenance')
    assert.equal(bytes.length, file.bytes)
    assert.ok(file.file.endsWith('.' + digest.slice(0, 12) + '.woff2'), 'Changed font bytes require a new filename')
    const rule = immutableRules.find(rule => rule.source === '/assets/fonts/' + file.file)
    assert.deepEqual(cacheHeaders(rule).map(header => header.value), [longCache])
    assert.ok(hosting.headers.indexOf(rule) > genericIndex, 'Exact font policy must override generic assets')
  }
})

async function server (t, config) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pietro-cache-'))
  const write = (name, bytes) => {
    const filename = path.join(directory, 'public', name.replace(/^\//, ''))
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, bytes)
  }
  for (const file of provenance.files) write('/assets/fonts/' + file.file, fs.readFileSync(path.join(root, 'template/public/assets/fonts', file.file)))
  for (const name of [
    '/assets/fonts/unversioned.woff2', '/assets/fonts/quicksand-latin.000000000000.woff2',
    '/assets/fonts/quicksand-sources.json', '/assets/fonts/OFL-Quicksand.txt',
    '/assets/icons/font-awesome/font/storefront-icons.woff2', '/assets/cms.css',
    '/img/uploads/banner.webp', '/img/logo.png', '/pe-freight-config.json',
    '/pe-cart-config.json', '/pe-best-sellers.json', '/manifest.json', '/sw.js',
    '/storefront.abcdef123456.js', '/storefront.js', '/index.html', '/app/index.html'
  ]) write(name, 'QA fixture')
  const app = superstatic({ cwd: directory, config: { ...structuredClone(config), public: 'public' }, fallthrough: false })
  const instance = http.createServer((request, response) => app(request, response, error => {
    response.statusCode = error ? 500 : 404
    response.end(error ? 'QA server error' : 'Not found')
  }))
  instance.listen(0, '127.0.0.1')
  await once(instance, 'listening')
  t.after(async () => {
    await new Promise(resolve => instance.close(resolve))
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return 'http://127.0.0.1:' + instance.address().port
}

test('Firebase Superstatic applies the exact font policy without extending mutable resources', async t => {
  const origin = await server(t, hosting)
  for (const file of provenance.files) {
    const response = await fetch(origin + '/assets/fonts/' + file.file, { signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), longCache)
    const digest = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
    assert.equal(digest, file.sha256, 'HTTP bytes must be the unchanged font')
  }
  const controls = {
    '/assets/fonts/unversioned.woff2': assetCache,
    '/assets/fonts/quicksand-latin.000000000000.woff2': assetCache,
    '/assets/fonts/quicksand-sources.json': assetCache,
    '/assets/fonts/OFL-Quicksand.txt': assetCache,
    '/assets/icons/font-awesome/font/storefront-icons.woff2': assetCache,
    '/assets/cms.css': assetCache,
    '/img/uploads/banner.webp': 'public, max-age=300, s-maxage=60, must-revalidate',
    '/img/logo.png': 'public, max-age=300, s-maxage=60, must-revalidate',
    '/pe-freight-config.json': 'no-store, max-age=0',
    '/storefront.abcdef123456.js': 'public, max-age=31536000',
    '/storefront.js': 'public, max-age=0, must-revalidate',
    '/': 'public, max-age=30, must-revalidate',
    '/app/': 'public, max-age=300, stale-while-revalidate=900'
  }
  for (const [pathname, expected] of Object.entries(controls)) {
    const response = await fetch(origin + pathname, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 200, pathname)
    assert.equal(response.headers.get('cache-control'), expected, pathname)
  }
  for (const pathname of ['/pe-cart-config.json', '/pe-best-sellers.json', '/manifest.json', '/sw.js']) {
    const response = await fetch(origin + pathname, { method: 'HEAD', signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 200, pathname)
    assert.ok(!response.headers.get('cache-control')?.includes('immutable'), pathname)
  }
})

test('removing only the three exact rules restores the previous HTTP policy and retains font bytes', async t => {
  const rollback = { ...hosting, headers: hosting.headers.filter(rule => !fontPaths.includes(rule.source)) }
  const origin = await server(t, rollback)
  for (const file of provenance.files) {
    const response = await fetch(origin + '/assets/fonts/' + file.file, { signal: AbortSignal.timeout(5000) })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), assetCache)
    const digest = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex')
    assert.equal(digest, file.sha256)
  }
})
