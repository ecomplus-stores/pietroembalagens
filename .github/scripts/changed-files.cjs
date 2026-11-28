// Arquivos mudados desde a última publicação que deu certo, não só no último push.
// Motivo: o GitHub guarda só a execução pendente mais nova do grupo de deploy. Quando
// o painel da E-Com Plus empurra um "chore: trigger deploy (bot)" (só .ecomplus.cd.json),
// a execução do código que estava esperando é cancelada e a do bot só limparia o cache.
// Comparando com a última execução bem-sucedida, o código que ficou para trás entra no build.
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')

// mesmos caminhos que disparam o workflow
const WATCHED = ['content', 'template', 'package-lock.json', '.ecomplus.cd.json', '.functions', 'firebase.json', '.github', 'tests']

function git (cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function isAncestor (cwd, base, sha) {
  try {
    git(cwd, ['merge-base', '--is-ancestor', base, sha])
    return true
  } catch {
    return false
  }
}

// última execução bem-sucedida de um commit anterior a este (e no histórico dele)
function pickBase (runs, sha, ancestor) {
  for (const run of runs) {
    if (run && /^[a-f0-9]{40}$/i.test(run.head_sha) && run.head_sha !== sha && ancestor(run.head_sha)) return run.head_sha
  }
  return null
}

function changedSince (cwd, base, sha) {
  const out = git(cwd, ['diff', '--name-only', base, sha, '--', ...WATCHED])
  return out ? out.split('\n') : []
}

async function successfulRuns ({ repository, token, workflow = 'build-and-deploy.yml', fetchImpl = fetch }) {
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?branch=master&status=success&per_page=30`
  const res = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const body = await res.json()
  return Array.isArray(body.workflow_runs) ? body.workflow_runs : []
}

// [] = build completo (o build-storefront.cjs só limpa o cache quando a lista é exatamente [".ecomplus.cd.json"])
async function resolve ({ cwd, sha, repository, token, fetchImpl }) {
  let runs
  try {
    runs = await successfulRuns({ repository, token, fetchImpl })
  } catch (error) {
    console.warn(`Sem histórico de publicações (${error.message}): build completo`)
    return []
  }
  const base = pickBase(runs, sha, candidate => isAncestor(cwd, candidate, sha))
  if (!base) {
    console.warn('Nenhuma publicação anterior no histórico deste commit: build completo')
    return []
  }
  const changed = changedSince(cwd, base, sha)
  console.log(`Comparando com a última publicação que deu certo (${base.slice(0, 8)}): ${changed.length} arquivo(s)`)
  return changed
}

if (require.main === module) {
  resolve({
    cwd: process.cwd(),
    sha: process.env.GITHUB_SHA,
    repository: process.env.GITHUB_REPOSITORY,
    token: process.env.GITHUB_TOKEN
  }).then(changed => {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `all=${JSON.stringify(changed)}\n`)
  }).catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { pickBase, changedSince, resolve, WATCHED }
