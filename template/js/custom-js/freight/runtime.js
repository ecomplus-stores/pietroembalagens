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

// v2 only when the config says so AND the feature is on; any other value or a failed load stays on v1.
export function uiVersion () {
  return enabled() && runtime.config && runtime.config.ui === 'v2' ? 'v2' : 'v1'
}

export function autoSelectFree () {
  return uiVersion() === 'v2' && runtime.config.autoSelectFree === true
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
      event, pe_freight_version: uiVersion(), pe_freight_variant: enabled() ? 'treatment' : 'control', ...data,
      ecommerce: { currency: data.currency || 'BRL', value: data.value === undefined ? null : data.value, items: data.items || [] }
    })
  } catch (_) {}
}

// One-shot hint left by a successful suggestion add: pick the free service for this cart and CEP.
// Valid for two minutes; any manual service choice or a different cart/CEP discards it.
const autoKey = 'pe-freight-auto'
export function markAutoSelect (key) {
  try { window.sessionStorage.setItem(autoKey, JSON.stringify({ key, at: Date.now() })) } catch (_) {}
}
export function readAutoSelect () {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(autoKey) || 'null')
    if (value && Date.now() - value.at < 120000) return value
  } catch (_) {}
  clearAutoSelect()
  return null
}
export function clearAutoSelect () {
  try { window.sessionStorage.removeItem(autoKey) } catch (_) {}
}

// Last computed suggestions, shared by the minicart and the cart page.
// Valid only for the same cart and CEP (quote key) and for ten minutes; the click path revalidates anyway.
const suggestionsKey = 'pe-freight-suggestions'
export function readSuggestions (key) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(suggestionsKey) || 'null')
    return value && value.key === key && Array.isArray(value.candidates) && Date.now() - value.at < 600000 ? value : null
  } catch (_) { return null }
}
export function saveSuggestions (entry) {
  try { window.sessionStorage.setItem(suggestionsKey, JSON.stringify(entry)) } catch (_) {}
}
