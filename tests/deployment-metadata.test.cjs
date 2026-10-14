const test = require('node:test')
const assert = require('node:assert/strict')
const { capture } = require('../.github/scripts/capture-deployment.cjs')
const project = 'pietro-example'
const sha = 'a'.repeat(40)
const release = { releases: [{ name: `sites/${project}/releases/r1`, version: { name: `sites/${project}/versions/v1` }, releaseTime: '2026-10-13T12:00:00Z', user: { email: 'do-not-record@example.invalid' } }] }
const fn = { name: `projects/${project}/locations/us-central1/functions/ssr`, versionId: '123', updateTime: '2026-10-13T12:00:00Z', runtime: 'nodejs20', entryPoint: 'ssr', status: 'ACTIVE', environmentVariables: { PRIVATE: 'do-not-record-secret' }, sourceArchiveUrl: 'do-not-record-source-url' }

function client (options = {}) {
  const calls = []
  return { calls, async request ({ url, method }) {
    assert.equal(method, 'GET'); calls.push(url)
    if (options.fail) throw Object.assign(new Error('fixture-request-failed'), { response: { status: 403 } })
    if (url.includes('firebase.googleapis.com/')) return { data: { resources: { hostingSite: project } } }
    if (url.includes('firebasehosting.googleapis.com/')) return { data: options.release || release }
    if (url.includes('pageToken=next')) return { data: { functions: options.functions || [fn] } }
    return { data: options.paginated ? { functions: [], nextPageToken: 'next' } : { functions: options.functions || [fn] } }
  } }
}

test('capture records real Hosting release/version and SSR versionId using only selected fields', async () => {
  const api = client()
  const result = await capture(api, project, { hosting: { public: 'dist' } }, sha, 'before')
  assert.equal(result.hosting.release, `sites/${project}/releases/r1`)
  assert.equal(result.ssr.versionId, '123')
  assert.equal(result.approvedSha, sha)
  assert.equal(api.calls.length, 3)
  assert.doesNotMatch(JSON.stringify(result), /do-not-record|environmentVariables|sourceArchive/)
})

test('an explicit Hosting site and paginated function listing still resolve the correct baseline', async () => {
  const api = client({ paginated: true })
  const result = await capture(api, project, { hosting: { site: project } }, sha, 'after')
  assert.equal(result.phase, 'after')
  assert.equal(result.ssr.versionId, '123')
  assert.ok(api.calls.some(url => url.includes('pageToken=next')))
  assert.ok(api.calls.every(url => !url.includes('firebase.googleapis.com/')))
})

test('missing Hosting release or incomplete SSR revision prevents a verified baseline', async () => {
  await assert.rejects(capture(client({ release: { releases: [] } }), project, { hosting: {} }, sha, 'before'), /Hosting release/)
  await assert.rejects(capture(client({ functions: [{ ...fn, versionId: undefined }] }), project, { hosting: {} }, sha, 'before'), /complete and active/)
  await assert.rejects(capture(client({ functions: [{ ...fn, status: 'DEPLOY_IN_PROGRESS' }] }), project, { hosting: {} }, sha, 'before'), /complete and active/)
})

test('ambiguous SSR regions and unresolved hosting targets are rejected rather than guessed', async () => {
  await assert.rejects(capture(client({ functions: [fn, { ...fn, name: `projects/${project}/locations/europe-west1/functions/ssr` }] }), project, { hosting: {} }, sha, 'before'), /Exactly one/)
  await assert.rejects(capture(client(), project, { hosting: { target: 'unresolved' } }, sha, 'before'), /resolved explicitly/)
})

test('permission errors propagate, and malformed project/SHA inputs never make an authenticated request', async () => {
  await assert.rejects(capture(client({ fail: true }), project, { hosting: {} }, sha, 'before'), /fixture-request-failed/)
  const api = client()
  await assert.rejects(capture(api, 'bad/project', { hosting: {} }, sha, 'before'), /Invalid Firebase project/)
  await assert.rejects(capture(api, project, { hosting: {} }, 'master', 'before'), /Approved SHA/)
  assert.equal(api.calls.length, 0)
})
