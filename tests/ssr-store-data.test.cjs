const test = require('node:test')
const { after } = test
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')

// The SSR entry wraps the renderer's store data loader: retry, then the build
// snapshot, then give the instance up. The loader is replaced by a controlled
// fake here, so no request leaves the test.
const functionsRequire = createRequire(path.resolve(__dirname, '../.functions/package.json'))
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ssr-store-data-'))
fs.writeFileSync(path.join(directory, 'bundles.json'), JSON.stringify({ assetsByChunkName: {} }))
process.env.STOREFRONT_BUNDLES_PATH = path.join(directory, 'bundles.json')
process.env.STOREFRONT_BASE_DIR = path.resolve(__dirname, '..')
process.env.NODE_ENV = 'development'

const storeDataPath = functionsRequire.resolve('@ecomplus/storefront-renderer/src/lib/get-store-data')
const live = { store: { store_id: 51395 }, categories: [], grids: [], items: [] }
const outcomes = []
let calls = 0
functionsRequire(storeDataPath)
const fake = async () => {
  calls++
  const outcome = outcomes.shift()
  if (outcome instanceof Error) throw outcome
  return outcome || live
}
functionsRequire.cache[storeDataPath].exports = fake

const exits = []
const realExit = process.exit
process.exit = code => { exits.push(code) }
const realError = console.error
console.error = () => {}
const cwd = process.cwd()
process.chdir(directory)

functionsRequire('./index.js')
const getStoreData = functionsRequire(storeDataPath)
const down = () => new Error('Store API unavailable fixture')
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

after(() => {
  process.exit = realExit
  console.error = realError
  process.chdir(cwd)
  fs.rmSync(directory, { recursive: true, force: true })
})

test('store data loader is wrapped and the renderer reads through the wrapper', async () => {
  assert.equal(typeof getStoreData, 'function')
  assert.notEqual(getStoreData, fake, 'the SSR entry must replace the loader')
  assert.ok(calls >= 1, 'the renderer cold start must go through the wrapped loader')
})

test('a load that fails twice is retried and succeeds without the snapshot', async () => {
  calls = 0
  outcomes.push(down(), down())
  const started = Date.now()
  assert.equal(await getStoreData(), live)
  assert.equal(calls, 3)
  assert.ok(Date.now() - started >= 2900, 'waits 1s and 2s between attempts')
  assert.deepEqual(exits, [])
})

test('a persistent failure without a snapshot rejects and gives the instance up', async () => {
  calls = 0
  outcomes.push(down(), down(), down())
  await assert.rejects(getStoreData(), /Store API unavailable fixture/)
  assert.equal(calls, 3)
  assert.deepEqual(exits, [], 'in-flight responses get 3s before the exit')
  await sleep(3200)
  assert.deepEqual(exits, [1])
  exits.length = 0
})

test('a snapshot without store data is not used', async () => {
  fs.writeFileSync(path.join(directory, '.ecom.json'), JSON.stringify({ data: {} }))
  outcomes.push(down(), down(), down())
  await assert.rejects(getStoreData(), /Store API unavailable fixture/)
  await sleep(3200)
  assert.deepEqual(exits, [1])
  exits.length = 0
  delete functionsRequire.cache[path.join(directory, '.ecom.json')]
  delete require.cache[path.join(directory, '.ecom.json')]
})

test('a persistent failure falls back to the build snapshot and keeps the instance', async () => {
  const snapshot = { store: { store_id: 51395, name: 'snapshot' }, categories: [{ slug: 'babado' }] }
  fs.writeFileSync(path.join(directory, '.ecom.json'), JSON.stringify({ data: snapshot }))
  calls = 0
  outcomes.push(down(), down(), down())
  assert.deepEqual(await getStoreData(), snapshot)
  assert.equal(calls, 3)
  await sleep(3200)
  assert.deepEqual(exits, [])
})
