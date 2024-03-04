import getSections from '@ecomplus/storefront-template/template/js/netlify-cms/base-config/sections'

export default ({ state }) => {
  const sections = getSections({ state })
  sections.push({
    label: "Grid de Avaliações",
    name: "review-carousel",
    widget: "object",
    icon: "https://api.iconify.design/bi:grid.svg",
    fields: [
        {
            label: "Avaliações",
            name: "reviews",
            widget: "list",
            fields: [
                {
                    label: "Imagem",
                    name: "img",
                    widget: "image",
                    required: false
                },
                {
                    label: "Nome",
                    required: false,
                    name: "nome",
                    widget: "string"
                },
                {
                    label: "Cidade",
                    required: false,
                    name: "cidade",
                    widget: "string"
                },
                {
                    label: "Texto de avaliação",
                    required: false,
                    name: "texto",
                    widget: "string"
                }
            ]
        },
        {
            label: "Avaliações autoplay",
            name: "autoplay",
            hint: 'Troca automática de avaliações, defina 0 para desabilitar autoplay',
            min: 0,
            step: 1000,
            default: 9000,
            widget: 'number'
        },
        {
            name: "title",
            label: "Título da estante de depoimentos",
            widget: 'string'
        }
    ]
}, {
    label: 'Carrossel de Categorias',
    name: 'categories-carousel',
    widget: 'object',
    icon: 'https://api.iconify.design/mdi:copyright.svg',
    fields: [
        {
            label: 'Selecione categorias',
            required: true,
            name: 'category_ids',
            widget: 'select',
            multiple: true,
            options: [{
              resource: 'categories',
              label: 'Categoria: '
            }].reduce((options, shelf) => {
              state.routes.forEach(({ _id, resource, name, path }) => {
                if (resource === shelf.resource) {
                  options.push({
                    label: shelf.label + name,
                    value: `${_id}`
                  })
                }
              })
              return options
            }, [])
          },
      {
        label: 'Carousel autoplay',
        required: false,
        name: 'autoplay',
        hint: 'Exibição de cada página em milisegundos, 0 desativa o autoplay',
        min: 0,
        step: 1000,
        widget: 'number'
      },
      {
        name: 'title',
        widget: 'string',
        required: false,
        label: 'Nome do carousel de categorias'
      }
    ]
})
  return sections
}
