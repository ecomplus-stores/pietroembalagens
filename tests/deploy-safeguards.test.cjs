const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { checkSource, checkBuild, prepareSsr, evidence } = require('../.github/scripts/verify-deploy.cjs')
const { build } = require('../.github/scripts/build-storefront.cjs')

function fixture (t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pietro-deploy-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const write = (name, value) => {
    const filename = path.join(cwd, name)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, typeof value === 'object' ? JSON.stringify(value) : value)
  }
  write('.gitignore', 'node_modules/\ndist/\ntemplate/scss/styles.scss\n')
  write('content/settings.json', { store_id: 51395, domain: 'www.pietroembalagens.com.br' })
  write('template/pages/@/view.ejs', '<html>store</html>')
  write('template/pages/@ecomplus/storefront-template/template/pages/@/view.ejs', '<html>vendor</html>')
  write('.bundles.json', { assetsByChunkName: { storefront: ['storefront.hash.js', 'storefront.hash.css'] } })
  write('.ecomplus.cd.json', { slug: 'product,category' })
  write('.functions/index.js', 'exports.ssr = () => {}\n')
  write('.functions/package.json', { main: 'index.js', dependencies: { '@ecomplus/storefront-renderer': '^2.11.12' } })
  write('.functions/package-lock.json', { lockfileVersion: 2, packages: { '': { dependencies: { '@ecomplus/storefront-renderer': '^2.11.12' } }, 'node_modules/@ecomplus/storefront-renderer': { version: '2.11.12' } } })
  write('firebase.json', { functions: { source: '.functions', predeploy: ['cp -r template content .functions/', 'cp .*.json .functions/'] } })
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(['init', '-q']); git(['add', '.']); git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline'])
  const sha = git(['rev-parse', 'HEAD'])
  return { cwd, write, git, sha }
}

function artifacts (f) {
  for (const name of ['storefront.js', 'storefront.css', 'checkout.js', 'admin.js', 'storefront.hash.js', 'storefront.hash.css']) f.write(`dist/${name}`, 'nonempty artifact')
  for (const name of ['index.html', 'app/index.html', 'search.html', '404.html', 'blog.html', 'admin/index.html']) {
    f.write(`dist/${name}`, '<html><link rel="stylesheet" href="/storefront.hash.css"><script src="/storefront.hash.js"></script></html>')
  }
}

test('approved source rejects another SHA and requires an exact 40-character commit', t => {
  const f = fixture(t)
  assert.equal(checkSource(f.cwd, f.sha), f.sha)
  assert.throws(() => checkSource(f.cwd, 'a'.repeat(40)), /does not match/)
  assert.throws(() => checkSource(f.cwd, 'master'), /full approved/)
})

test('generated tracked defaults cannot silently replace approved content, including staged changes', t => {
  const f = fixture(t)
  f.write('content/settings.json', { store_id: 999 })
  assert.throws(() => checkSource(f.cwd, f.sha), /content\/settings.json/)
  f.git(['add', 'content/settings.json'])
  assert.throws(() => checkSource(f.cwd, f.sha), /content\/settings.json/)
})

test('unexpected untracked template defaults fail while ignored output and the bundle cache are allowed', t => {
  const f = fixture(t)
  f.write('template/scss/styles.scss', 'generated styles')
  f.write('dist/generated.js', 'output')
  f.write('.bundles.json', { assetsByChunkName: { storefront: 'new.hash.js' } })
  assert.equal(checkSource(f.cwd, f.sha), f.sha)
  f.write('template/pages/new-default.ejs', 'unexpected')
  assert.throws(() => checkSource(f.cwd, f.sha), /new-default.ejs/)
})

test('all requested pages and referenced bundles must exist and be nonempty', t => {
  const f = fixture(t); artifacts(f)
  assert.doesNotThrow(() => checkBuild(f.cwd))
  fs.unlinkSync(path.join(f.cwd, 'dist/admin/index.html'))
  assert.throws(() => checkBuild(f.cwd), /admin\/index.html/)
  artifacts(f); f.write('dist/storefront.hash.js', '')
  assert.throws(() => checkBuild(f.cwd), /missing or empty/)
})

test('invalid manifests, escaping paths and broken HTML asset references fail validation', t => {
  const f = fixture(t); artifacts(f)
  f.write('.bundles.json', '{broken')
  assert.throws(() => checkBuild(f.cwd), SyntaxError)
  f.write('.bundles.json', { assetsByChunkName: { main: '../outside.js' } })
  assert.throws(() => checkBuild(f.cwd), /escapes/)
  f.write('.bundles.json', { assetsByChunkName: { main: 'storefront.hash.js' } })
  f.write('dist/index.html', '<html><script src="/missing.js"></script></html>')
  assert.throws(() => checkBuild(f.cwd), /missing.js/)
})

test('SSR validation uses the prepared package and rejects invalid entry/configuration', t => {
  const f = fixture(t)
  assert.equal(prepareSsr(f.cwd).source, path.join(f.cwd, '.functions'))
  f.write('.functions/package.json', { main: 'absent.js', dependencies: { '@ecomplus/storefront-renderer': '^2.11.12' } })
  assert.throws(() => prepareSsr(f.cwd), /absent.js/)
  f.write('.functions/package.json', { main: 'index.js', dependencies: {} })
  assert.throws(() => prepareSsr(f.cwd), /Invalid SSR dependency/)
})

test('build evidence includes prepared sources and hashes but excludes credentials and unrelated files', t => {
  const f = fixture(t); artifacts(f)
  f.write('.functions/.firebase-adminsdk.json', 'fixture-do-not-upload')
  f.write('.functions/.npmrc', 'fixture-do-not-upload')
  f.write('.functions/template/.env', 'fixture-do-not-upload')
  const directory = path.join(f.cwd, 'evidence')
  evidence(f.cwd, f.sha, directory)
  const names = execFileSync('tar', ['-tzf', path.join(directory, 'ssr-source.tar.gz')], { encoding: 'utf8' })
  assert.match(names, /content\/settings.json/)
  assert.doesNotMatch(names, /firebase-admin|\.npmrc|\.env/)
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'deployment.json')))
  assert.equal(metadata.approvedSha, f.sha)
  assert.match(metadata.artifacts['ssr-source.tar.gz'], /^[a-f0-9]{64}$/)
})

test('SSR data cache is validated and hashed, but excluded from the evidence archive', t => {
  const f = fixture(t); artifacts(f)
  f.write('.ecom.json', { data: { opaque: 'fixture-cache-value' } })
  const directory = path.join(f.cwd, 'evidence')
  evidence(f.cwd, f.sha, directory)
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'deployment.json')))
  assert.equal(metadata.dataCache.includedInArchive, false)
  assert.match(metadata.dataCache.sha256, /^[a-f0-9]{64}$/)
  const names = execFileSync('tar', ['-tzf', path.join(directory, 'ssr-source.tar.gz')], { encoding: 'utf8' })
  assert.doesNotMatch(names, /\.ecom.json/)
  f.write('.ecom.json', 'invalid JSON')
  assert.throws(() => prepareSsr(f.cwd), SyntaxError)
})

function commands (f, t, curlStatus = 0, npmStatus = 0) {
  const directory = path.join(f.cwd, 'bin'); fs.mkdirSync(directory)
  for (const [name, status] of [['curl', curlStatus], ['npm', npmStatus]]) {
    const file = path.join(directory, name)
    fs.writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' '${name}' >> '${f.cwd}/calls'\nexit ${status}\n`)
    fs.chmodSync(file, 0o755)
  }
  const previous = process.env.PATH
  process.env.PATH = `${directory}:${previous}`
  t.after(() => { process.env.PATH = previous })
}

test('PURGE-only changes avoid build artifacts, preserve the mode and fail on HTTP failure', t => {
  const f = fixture(t); commands(f, t)
  const output = path.join(f.cwd, 'output')
  assert.equal(build(f.cwd, '[".ecomplus.cd.json"]', output), 'purge')
  assert.equal(fs.readFileSync(output, 'utf8'), 'mode=purge\n')
  assert.equal(fs.readFileSync(path.join(f.cwd, 'calls'), 'utf8'), 'curl\ncurl\n')
  fs.writeFileSync(path.join(f.cwd, 'bin/curl'), '#!/bin/sh\nexit 22\n')
  assert.throws(() => build(f.cwd, '[".ecomplus.cd.json"]', output), /exit status 22/)
})

test('normal changes run the full build, malformed input and command failures cannot be marked successful', t => {
  const f = fixture(t); commands(f, t, 0, 1)
  assert.throws(() => build(f.cwd, '["template/js/index.js"]'), /exit status 1/)
  assert.throws(() => build(f.cwd, '{bad'), SyntaxError)
  assert.throws(() => build(f.cwd, '{}'), /Invalid changed-file/)
  fs.writeFileSync(path.join(f.cwd, 'bin/npm'), '#!/bin/sh\nexit 0\n')
  assert.equal(build(f.cwd, '[".ecomplus.cd.json","template/js/index.js"]'), 'build')
})

test('PURGE rejects malformed hostnames and slugs rather than requesting another service', t => {
  const f = fixture(t); commands(f, t)
  f.write('content/settings.json', { domain: 'example.com/path' })
  assert.throws(() => build(f.cwd, '[".ecomplus.cd.json"]'), /hostname/)
  f.write('content/settings.json', { domain: 'www.pietroembalagens.com.br' })
  f.write('.ecomplus.cd.json', { slug: '../other' })
  assert.throws(() => build(f.cwd, '[".ecomplus.cd.json"]'), /slug/)
})
