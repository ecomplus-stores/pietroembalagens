// Painel (admin) do tema, com as seções customizadas da loja (template/js/cms/sections.js) na página inicial.
// Sem isto o painel não conhecia 'categories-carousel', 'review-carousel' nem 'personalized-boxes' e mostrava
// "item has illegal 'type' property". Igual ao admin do tema (#template/js/admin), exceto pela troca dos tipos da home.
import '#template/js/lib/config'
import EcomRouter from '@ecomplus/storefront-router'
import initNetlifyCms from '#template/js/netlify-cms/init'
import getBaseConfig from '#template/js/netlify-cms/base-config/'
import getCustomSections from './cms/sections'

document.title = `Admin ~ ${document.title}`

const state = {}

// Troca só os tipos de seção da home pelos do tema + os da loja. O resto da configuração fica como no tema.
const withCustomSections = (config, sections) => {
  config.collections.forEach(collection => {
    (collection.files || []).forEach(file => {
      if (file.name === 'home') {
        file.fields.forEach(field => {
          if (field.name === 'sections') field.types = sections
        })
      }
    })
  })
  return config
}

new EcomRouter().list()
  .then(routes => {
    state.routes = routes
  })
  .catch(err => {
    console.error(err)
    state.routes = []
  })

  .finally(() => {
    if (window.PKG_BASE_DIR === undefined) {
      window.PKG_BASE_DIR = ''
    }
    const options = { baseDir: window.PKG_BASE_DIR, state }
    let customConfig = window.CMS_CUSTOM_CONFIG
    try {
      customConfig = withCustomSections(getBaseConfig({ ...options }), getCustomSections({ state }))
    } catch (err) {
      // Se algo falhar, o painel abre como o do tema (sem as seções da loja), nunca em branco.
      console.error(err)
    }
    initNetlifyCms(customConfig, options).then(config => {
      console.log('Netlify CMS config:', config)
    })
  })
