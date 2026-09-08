import Vue from 'vue'

export const runtime = Vue.observable({ enabled: false, ready: false, busy: false, config: {} })
let pending
let timer
let bucket = 0
try {
  const saved = window.localStorage.getItem('pe-freight-bucket-v1')
  bucket = saved === null ? Math.floor(Math.random() * 100) : Number(saved)
  window.localStorage.setItem('pe-freight-bucket-v1', String(bucket))
} catch (_) { bucket = Math.floor(Math.random() * 100) }

export function enabled () {
  return runtime.enabled && window.peFreightSuggestionsEnabled !== false
}

export function refreshConfig () {
  if (pending) return pending
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  pending = fetch('/pe-freight-config.json?v=' + Date.now(), { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
    .then(response => {
      if (!response.ok) throw new Error('config')
      return response.json()
    })
    .then(config => {
      runtime.config = config
      runtime.enabled = config.enabled === true && bucket < (config.rolloutPercent === undefined ? 100 : config.rolloutPercent)
      runtime.ready = true
    })
    .catch(() => { runtime.enabled = false; runtime.ready = true })
    .finally(() => { clearTimeout(timeout); pending = null })
  return pending
}

export function init () {
  if (!timer) {
    refreshConfig()
    timer = setInterval(refreshConfig, 60000)
  }
}

// Service choice belongs to a CEP. It survives navigation between the two carts.
export function getPreference (postalCode) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem('pe-freight-choice') || 'null')
    return value && value.zip === postalCode ? value.key : ''
  } catch (_) { return '' }
}
export function setPreference (postalCode, key) {
  try { window.sessionStorage.setItem('pe-freight-choice', JSON.stringify({ zip: postalCode, key })) } catch (_) {}
}

export function track (event, data = {}) {
  try {
    window.dataLayer = window.dataLayer || []
    // Clear optional fields on every event so GTM never reuses a previous item's data.
    window.dataLayer.push({
      pe_freight_surface: null, pe_freight_action: null, pe_freight_product_id: null,
      pe_freight_variation_id: null, pe_freight_quantity: null, pe_freight_position: null,
      pe_freight_gap: null, value: null, currency: null, items: null,
      event, pe_freight_version: 'v1', pe_freight_variant: enabled() ? 'treatment' : 'control', ...data,
      ecommerce: { currency: data.currency || 'BRL', value: data.value === undefined ? null : data.value, items: data.items || [] }
    })
  } catch (_) {}
}
