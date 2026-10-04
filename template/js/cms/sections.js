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
            required: false,
            hint: 'Vazio = todas as categorias (como está hoje na home).',
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
  sections.push({
    label: 'Quadros personalizados (histórico do navegador)',
    name: 'personalized-boxes',
    widget: 'object',
    icon: 'https://api.iconify.design/bi:grid.svg',
    fields: [
      {
        label: 'Exibir quadros personalizados',
        name: 'enabled',
        widget: 'boolean',
        default: false
      },
      {
        label: 'Máximo de quadros na fileira',
        name: 'max_boxes',
        widget: 'number',
        value_type: 'int',
        min: 3,
        max: 12,
        default: 9,
        required: false,
        hint: 'Aparecem 5 por vez no computador; os demais ficam atrás da seta.'
      },
      { label: 'Título: produtos vistos pelo cliente', name: 'title_viewed', widget: 'string', default: 'Visto recentemente', required: false, hint: 'Vazio = padrão.' },
      { label: 'Título: última busca do cliente', name: 'title_search', widget: 'string', default: 'Sua busca', required: false },
      { label: 'Título: relacionados aos vistos', name: 'title_related', widget: 'string', default: 'Também te interessa', required: false },
      { label: 'Título: mais vendidos', name: 'title_sales', widget: 'string', default: 'Mais vendidos', required: false },
      { label: 'Título: promoções', name: 'title_offers', widget: 'string', default: 'Promoções', required: false },
      { label: 'Título: novidades', name: 'title_news', widget: 'string', default: 'Novidades', required: false },
      {
        label: 'Quadros de categoria (mostram o mais vendido de cada uma)',
        name: 'category_boxes',
        widget: 'list',
        required: false,
        hint: 'Completam a fileira para quem ainda não tem histórico. Até 6.',
        fields: [
          {
            label: 'Categoria',
            name: 'category',
            widget: 'select',
            options: state.routes.reduce((options, { _id, resource, name, path }) => {
              if (resource === 'categories') {
                options.push({ label: name, value: `${_id}:${resource}:${name}:${path}` })
              }
              return options
            }, [])
          },
          {
            label: 'Título do quadro',
            name: 'title',
            widget: 'string',
            required: false,
            hint: 'Vazio = nome da categoria.'
          }
        ]
      }
    ]
  })
  return sections
}
