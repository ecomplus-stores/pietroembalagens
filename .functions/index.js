const functions = require('firebase-functions')
const compression = require('compression')
const { constants } = require('node:zlib')

const { ssr: renderSsr } = require('@ecomplus/storefront-renderer/functions/')

// Security: the renderer `/~reverse-proxy/` route forwards visitor headers to any URL,
// which exposes the GCP metadata server (service account token). Keep it disabled.
const ssr = (req, res) => {
  if (/reverse-proxy/i.test(`${req.url}${req.originalUrl || ''}`)) {
    return res.sendStatus(404)
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
