const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')

function nonempty (filename) {
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile() || fs.statSync(filename).size === 0) {
    throw new Error(`Required artifact is missing or empty: ${filename}`)
  }
  return fs.readFileSync(filename)
}

function inside (root, filename) {
  const resolved = path.resolve(root, filename)
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error(`Artifact escapes its directory: ${filename}`)
  return resolved
}

function checkSource (cwd, sha) {
  if (!/^[a-f0-9]{40}$/i.test(sha || '')) throw new Error('A full approved GITHUB_SHA is required')
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
  if (git(['rev-parse', 'HEAD']) !== sha) throw new Error('Checkout does not match the approved SHA')
  const changed = git(['diff', '--name-only', sha, '--', '.', ':(exclude).bundles.json'])
  const added = git(['ls-files', '--others', '--exclude-standard', '--', 'content', 'template'])
  if (changed || added) {
    throw new Error(`Source changed after checkout; review generated files before deploying:\n${[changed, added].filter(Boolean).join('\n')}`)
  }
  return sha
}

function readBundles (filename) {
  const bundles = JSON.parse(nonempty(filename))
  const chunks = bundles.assetsByChunkName
  if (!chunks || Array.isArray(chunks) || typeof chunks !== 'object' || !Object.keys(chunks).length) {
    throw new Error('Bundle manifest has no assetsByChunkName entries')
  }
  const names = Object.values(chunks).flat()
  if (!names.every(name => typeof name === 'string' && name.length)) throw new Error('Invalid bundle reference')
  return names
}

function checkBuild (cwd) {
  const dist = path.join(cwd, 'dist')
  for (const name of ['storefront.js', 'storefront.css', 'checkout.js', 'admin.js']) nonempty(path.join(dist, name))
  for (const name of readBundles(path.join(cwd, '.bundles.json'))) nonempty(inside(dist, name))
  for (const name of ['index.html', 'app/index.html', 'search.html', '404.html', 'blog.html', 'admin/index.html']) {
    const html = nonempty(path.join(dist, name)).toString()
    if (!/<html[\s>]/i.test(html)) throw new Error(`Invalid HTML artifact: ${name}`)
    const tags = html.match(/<(?:script|link)\b[^>]*>/gi) || []
    for (const tag of tags) {
      if (/^<link/i.test(tag) && !/rel=["']stylesheet["']/i.test(tag)) continue
      const match = tag.match(/(?:src|href)=["'](\/[^"']+)["']/i)
      if (match && !match[1].startsWith('//')) {
        const filename = new URL(match[1], 'https://build.invalid').pathname.slice(1)
        nonempty(inside(dist, filename))
      }
    }
  }
}

function prepareSsr (cwd) {
  const config = JSON.parse(nonempty(path.join(cwd, 'firebase.json')))
  if (!Array.isArray(config.functions?.predeploy) || !config.functions.predeploy.length) throw new Error('Missing SSR predeploy instructions')
  const source = inside(cwd, config.functions.source)
  for (const command of config.functions.predeploy) {
    execFileSync('bash', ['-e', '-o', 'pipefail', '-c', command], { cwd, stdio: 'inherit' })
  }
  const pkg = JSON.parse(nonempty(path.join(source, 'package.json')))
  const lock = JSON.parse(nonempty(path.join(source, 'package-lock.json')))
  const renderer = '@ecomplus/storefront-renderer'
  if (!pkg.dependencies?.[renderer] || !lock.lockfileVersion ||
    lock.packages?.['']?.dependencies?.[renderer] !== pkg.dependencies[renderer] ||
    !lock.packages?.[`node_modules/${renderer}`]?.version) throw new Error('Invalid SSR dependency configuration')
  nonempty(inside(source, pkg.main || 'index.js'))
  const settings = JSON.parse(nonempty(path.join(source, 'content/settings.json')))
  if (!settings.store_id || !settings.domain) throw new Error('Invalid prepared SSR store settings')
  nonempty(path.join(source, 'template/pages/@/view.ejs'))
  nonempty(path.join(source, 'template/pages/@ecomplus/storefront-template/template/pages/@/view.ejs'))
  const prepared = readBundles(path.join(source, '.bundles.json'))
  if (JSON.stringify(prepared) !== JSON.stringify(readBundles(path.join(cwd, '.bundles.json')))) throw new Error('Prepared SSR manifest differs from the build')
  let dataCache = null
  if (fs.existsSync(path.join(cwd, '.ecom.json'))) {
    const cache = nonempty(path.join(cwd, '.ecom.json'))
    JSON.parse(cache)
    if (!cache.equals(nonempty(path.join(source, '.ecom.json')))) throw new Error('Prepared SSR data cache differs from the build')
    dataCache = { sha256: crypto.createHash('sha256').update(cache).digest('hex'), includedInArchive: false,
      reason: 'Data-cache contents are excluded until their public-data manifest is explicitly verified. This archive is not a complete redeploy package.' }
  }
  return { source, entry: pkg.main || 'index.js', dataCache }
}

function evidence (cwd, sha, directory) {
  checkSource(cwd, sha)
  checkBuild(cwd)
  const { source, entry, dataCache } = prepareSsr(cwd)
  checkSource(cwd, sha)
  fs.mkdirSync(directory, { recursive: true })
  // Explicit source allowlist: never archive the credential file, .env, .npmrc,
  // node_modules or the entire checkout/functions directory.
  const exclude = ['--exclude=node_modules', '--exclude=.git', '--exclude=.env*', '--exclude=.npmrc', '--exclude=*firebase-admin*.json']
  execFileSync('tar', [...exclude, '-czf', path.join(directory, 'ssr-source.tar.gz'), '-C', source, '--', entry, 'package.json', 'package-lock.json', '.bundles.json', 'content', 'template'], { stdio: 'inherit' })
  execFileSync('tar', [...exclude, '-czf', path.join(directory, 'hosting-build.tar.gz'), '-C', cwd, '--', 'dist', 'firebase.json', '.bundles.json'], { stdio: 'inherit' })
  const files = ['ssr-source.tar.gz', 'hosting-build.tar.gz']
  fs.writeFileSync(path.join(directory, 'deployment.json'), JSON.stringify({
    approvedSha: sha,
    runUrl: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    createdAt: new Date().toISOString(),
    dataCache,
    artifacts: Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(nonempty(path.join(directory, file))).digest('hex')])),
    note: 'Prepared build evidence. This does not prove a successful deploy or a tested artifact-based rollback.'
  }, null, 2) + '\n')
}

if (require.main === module) {
  try {
    const mode = process.argv[2]
    if (mode === 'source') checkSource(process.cwd(), process.env.GITHUB_SHA)
    else if (mode === 'artifacts') checkBuild(process.cwd())
    else if (mode === 'evidence') {
      if (!process.env.DEPLOY_EVIDENCE_DIR) throw new Error('DEPLOY_EVIDENCE_DIR is required')
      evidence(process.cwd(), process.env.GITHUB_SHA, process.env.DEPLOY_EVIDENCE_DIR)
    } else throw new Error('Expected source, artifacts or evidence mode')
    console.log(`Deployment check passed: ${mode}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { checkSource, checkBuild, prepareSsr, evidence }
