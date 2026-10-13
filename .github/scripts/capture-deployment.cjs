const fs = require('node:fs')
const path = require('node:path')

function hostingRelease (data, site) {
  const release = data.releases?.[0]
  const version = typeof release?.version === 'string' ? release.version : release?.version?.name
  if (!release?.name?.startsWith(`sites/${site}/releases/`) || !version?.startsWith(`sites/${site}/versions/`) || !release.releaseTime) {
    throw new Error('A published Hosting release and version are required')
  }
  return { release: release.name, version, releaseTime: release.releaseTime, type: release.type || null }
}

function ssrVersion (functions, project) {
  const matches = functions.filter(fn => typeof fn.name === 'string' && fn.name.startsWith(`projects/${project}/locations/`) && fn.name.endsWith('/functions/ssr'))
  if (matches.length !== 1) throw new Error('Exactly one deployed SSR function must be identified')
  const fn = matches[0]
  if (!fn.versionId || !fn.updateTime || fn.status !== 'ACTIVE' || !fn.runtime || !fn.entryPoint) throw new Error('The deployed SSR version must be complete and active')
  // Allowlist only: do not persist environmentVariables, auth headers,
  // source-download URLs, service account data or the entire API response.
  return { name: fn.name, versionId: String(fn.versionId), updateTime: fn.updateTime, runtime: fn.runtime, entryPoint: fn.entryPoint, status: fn.status }
}

async function capture (client, project, config, sha, phase) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(project || '')) throw new Error('Invalid Firebase project')
  if (!/^[a-f0-9]{40}$/i.test(sha || '') || !['before', 'after'].includes(phase)) throw new Error('Approved SHA and capture phase are required')
  const get = async url => (await client.request({ url, method: 'GET', timeout: 30000 })).data
  if (!config.hosting || Array.isArray(config.hosting) || config.hosting.target) throw new Error('Hosting target must be resolved explicitly before deployment')
  let site = config.hosting.site
  if (!site) site = (await get(`https://firebase.googleapis.com/v1beta1/projects/${project}`)).resources?.hostingSite
  if (typeof site !== 'string' || !/^[a-z0-9-]+$/.test(site)) throw new Error('The Hosting site could not be identified')
  const hosting = hostingRelease(await get(`https://firebasehosting.googleapis.com/v1beta1/sites/${site}/releases?pageSize=1`), site)
  const functions = []
  let token
  do {
    const url = new URL(`https://cloudfunctions.googleapis.com/v1/projects/${project}/locations/-/functions`)
    url.searchParams.set('pageSize', '1000')
    if (token) url.searchParams.set('pageToken', token)
    const page = await get(url.href)
    functions.push(...(page.functions || []))
    token = page.nextPageToken
  } while (token)
  return { phase, approvedSha: sha, capturedAt: new Date().toISOString(), project, hosting, ssr: ssrVersion(functions, project),
    note: 'Resource identifiers for recovery planning; not an automatic or atomic rollback mechanism.' }
}

if (require.main === module) {
  const phase = process.argv[3]
  ;(async () => {
    const { GoogleAuth } = require('google-auth-library')
    if (!process.env.DEPLOY_EVIDENCE_DIR || !process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('Missing configured CI authentication/evidence path')
    const auth = new GoogleAuth({ keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS, scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
    const client = await auth.getClient()
    const metadata = await capture(client, process.argv[2], JSON.parse(fs.readFileSync('firebase.json')), process.env.GITHUB_SHA, phase)
    fs.mkdirSync(process.env.DEPLOY_EVIDENCE_DIR, { recursive: true })
    fs.writeFileSync(path.join(process.env.DEPLOY_EVIDENCE_DIR, `production-${phase}.json`), JSON.stringify(metadata, null, 2) + '\n')
    console.log(`Production resource identifiers captured: ${phase}`)
  })().catch(error => {
    const status = Number(error.response?.status)
    console.error(`Production metadata capture failed (${phase === 'before' ? 'before any deployment' : 'after deployment; inspect the real production state'}; ${status >= 100 && status < 600 ? `HTTP ${status}` : 'configuration or request failure'})`)
    process.exitCode = 1
  })
}

module.exports = { capture, hostingRelease, ssrVersion }
