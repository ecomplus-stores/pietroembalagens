const fs = require('node:fs')
const { spawnSync } = require('node:child_process')

function run (command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with exit status ${result.status}`)
}

function build (cwd, changedFiles, output) {
  const changed = JSON.parse(changedFiles || '[]')
  if (!Array.isArray(changed) || !changed.every(file => typeof file === 'string')) throw new Error('Invalid changed-file list')
  let mode = 'build'
  if (changed.length === 1 && changed[0] === '.ecomplus.cd.json') {
    const { slug } = JSON.parse(fs.readFileSync(`${cwd}/.ecomplus.cd.json`))
    const { domain } = JSON.parse(fs.readFileSync(`${cwd}/content/settings.json`))
    if (typeof slug === 'string' && slug.trim() && domain) {
      if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/i.test(domain)) throw new Error('Invalid store hostname')
      for (const item of slug.split(',')) {
        const pathname = item.trim().replace(/^\/+/, '')
        if (!pathname || /[?#\\]/.test(pathname) || pathname.split('/').includes('..')) throw new Error('Invalid PURGE slug')
        const url = new URL(`/${pathname}`, `https://${domain}`).href
        run('curl', ['--fail', '--show-error', '--silent', '--location', '--max-time', '30', '--request', 'PURGE', '--output', '/dev/null', url], cwd)
      }
      mode = 'purge'
    }
  }
  if (mode === 'build') run('npm', ['run', 'build', '--', '--prerender=index,app/index,search,404,blog,admin/index', '--prerender-limit=0'], cwd)
  if (output) fs.appendFileSync(output, `mode=${mode}\n`)
  return mode
}

if (require.main === module) {
  try {
    console.log(`Storefront operation completed: ${build(process.cwd(), process.env.CHANGED_FILES, process.env.GITHUB_OUTPUT)}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}

module.exports = { build }
