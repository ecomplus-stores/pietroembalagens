const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { resolve } = require('../.github/scripts/changed-files.cjs')
const { build } = require('../.github/scripts/build-storefront.cjs')

function repo (t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pietro-changed-'))
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }))
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(['init', '-q'])
  const commit = (files, message) => {
    for (const [name, value] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(cwd, name)), { recursive: true })
      fs.writeFileSync(path.join(cwd, name), value)
    }
    git(['add', '.'])
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', message])
    return git(['rev-parse', 'HEAD'])
  }
  return { cwd, git, commit }
}

const api = runs => async () => ({ ok: true, json: async () => ({ workflow_runs: runs.map(head_sha => ({ head_sha })) }) })
const silent = t => {
  const { log, warn } = console
  console.log = () => {}; console.warn = () => {}
  t.after(() => { console.log = log; console.warn = warn })
}

test('code cancelled in the queue is built by the next bot purge commit', async t => {
  silent(t)
  const r = repo(t)
  const deployed = r.commit({ 'template/a.ejs': 'v1', '.ecomplus.cd.json': '{"slug":"a"}' }, 'base')
  r.commit({ 'template/a.ejs': 'v2', 'README.md': 'docs' }, 'code (run cancelled)')
  const bot = r.commit({ '.ecomplus.cd.json': '{"slug":"b"}' }, 'chore: trigger deploy (bot)')
  const changed = await resolve({ cwd: r.cwd, sha: bot, fetchImpl: api([deployed]) })
  assert.deepEqual(changed.sort(), ['.ecomplus.cd.json', 'template/a.ejs'])
  assert.notEqual(JSON.stringify(changed), '[".ecomplus.cd.json"]')
})

test('a bot commit right after a successful deploy stays purge-only', async t => {
  silent(t)
  const r = repo(t)
  const deployed = r.commit({ 'template/a.ejs': 'v1', '.ecomplus.cd.json': '{"slug":"a"}' }, 'code')
  const bot = r.commit({ '.ecomplus.cd.json': '{"slug":"b"}' }, 'chore: trigger deploy (bot)')
  assert.deepEqual(await resolve({ cwd: r.cwd, sha: bot, fetchImpl: api([bot, deployed]) }), ['.ecomplus.cd.json'])
})

test('runs outside this history are skipped and a missing history means a full build', async t => {
  silent(t)
  const r = repo(t)
  const deployed = r.commit({ 'template/a.ejs': 'v1' }, 'code')
  const head = r.commit({ 'content/x.json': '{}' }, 'content')
  const foreign = 'f'.repeat(40)
  assert.deepEqual(await resolve({ cwd: r.cwd, sha: head, fetchImpl: api([foreign, deployed]) }), ['content/x.json'])
  assert.deepEqual(await resolve({ cwd: r.cwd, sha: head, fetchImpl: api([foreign]) }), [])
  const failing = async () => ({ ok: false, status: 403 })
  assert.deepEqual(await resolve({ cwd: r.cwd, sha: head, fetchImpl: failing }), [])
  const throwing = async () => { throw new Error('network down') }
  assert.deepEqual(await resolve({ cwd: r.cwd, sha: head, fetchImpl: throwing }), [])
})

test('an empty list from the history makes build-storefront run the full build', t => {
  const r = repo(t)
  r.commit({ 'content/settings.json': '{"domain":"www.pietroembalagens.com.br"}' }, 'base')
  const bin = path.join(r.cwd, 'bin')
  fs.mkdirSync(bin)
  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\nexit 0\n', { mode: 0o755 })
  const previous = process.env.PATH
  process.env.PATH = `${bin}:${previous}`
  t.after(() => { process.env.PATH = previous })
  silent(t)
  assert.equal(build(r.cwd, '[]'), 'build')
})
