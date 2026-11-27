const functions = require('firebase-functions')
const compression = require('compression')
const { constants } = require('node:zlib')
const path = require('node:path')

// The renderer loads the store data (store, categories, grids, search items)
// once per instance, when the module is first required. If any of those
// requests fails, the instance answers 404 for every page until it is
// recycled. Retry the load, then fall back to the snapshot written by the
// build, and only then give the instance up.
try {
  const storeDataPath = require.resolve('@ecomplus/storefront-renderer/src/lib/get-store-data')
  const getStoreData = require(storeDataPath)
  const maxAttempts = 3
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

  require.cache[storeDataPath].exports = async (...args) => {
    let lastError
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await getStoreData(...args)
      } catch (err) {
        lastError = err
        console.error(`Store data load failed (attempt ${attempt}/${maxAttempts})`, err.message)
        if (attempt < maxAttempts) {
          await wait(attempt * 1000)
        }
      }
    }
    try {
      const { data } = require(path.join(process.cwd(), '.ecom.json'))
      if (data && data.store) {
        console.error('Store data loaded from the build snapshot')
        return data
      }
    } catch (err) {
      // no snapshot bundled with the function
    }
    // let the platform replace this instance instead of serving 404 forever
    setTimeout(() => process.exit(1), 3000)
    throw lastError
  }
} catch (err) {
  console.error('Could not wrap the store data loader', err)
}

const { ssr: renderSsr } = require('@ecomplus/storefront-renderer/functions/')

// Security: the renderer `/~reverse-proxy/` route forwards visitor headers to any URL,
// which exposes the GCP metadata server (service account token). Keep it disabled.
const ssr = (req, res) => {
  if (/reverse-proxy/i.test(`${req.url}${req.originalUrl || ''}`)) {
    return res.sendStatus(404)
  }
  // SEO: URL com barra no fim vira 301 para a sem barra. O renderer responde 302
  // e perde a query string (UTM). Barras duplicadas no início viram uma só,
  // para o Location nunca sair como //outro-site.
  const [pathname, query] = req.url.split(/\?(.*)/s)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    const target = '/' + pathname.replace(/^\/+|\/+$/g, '')
    res.set('Cache-Control', 'public, max-age=30, s-maxage=3600')
    return res.redirect(301, query ? `${target}?${query}` : target)
  }
  return renderSsr(req, res)
}

process.env.STOREFRONT_LONG_CACHE = 'true'

const compressHtml = compression({
  threshold: 1024,
  level: 6,
  brotli: { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } },
  filter: (req, res) => /^text\/html(?:\s*;|$)/i.test(res.getHeader('Content-Type') || '') && compression.filter(req, res)
})

exports.ssr = functions.https.onRequest((req, res) => {
  // Preserve upstream proxy bodies and headers without installing compression.
  if (req.url.startsWith('/~reverse-proxy/')) return ssr(req, res)

  return new Promise((resolve, reject) => {
    compressHtml(req, res, error => {
      if (error) return reject(error)
      resolve(ssr(req, res))
    })
  })
})
