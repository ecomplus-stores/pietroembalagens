import getSections from '@ecomplus/storefront-template/template/js/netlify-cms/base-config/sections'

// Ordenação agrupada da Estante de produtos (docs/ORDENACAO-AGRUPADA.md): duas opções novas em "Ordenação" e a lista
// "Ordem dos grupos". As opções do tema continuam como estão; só a Estante ganha as novas (as outras seções não sabem agrupar).
const groupedSortOptions = [
  { label: 'Agrupar por subcategoria (mais vendidos dentro de cada grupo)', value: 'group_subcategory' },
  { label: 'Agrupar por tag (mais vendidos dentro de cada grupo)', value: 'group_tag' }
]
const groupOrderField = {
  label: 'Ordem dos grupos (só para Agrupar por…)',
  name: 'group_order',
  widget: 'list',
  required: false,
  field: { label: 'Grupo', name: 'group', widget: 'string' },
  hint: 'Um nome por linha, na ordem em que os grupos aparecem: nome da categoria (Agrupar por subcategoria) ou palavra-chave do produto (Agrupar por tag). ' +
    'Vazio em Agrupar por subcategoria: usa as subcategorias da categoria escolhida, de A a Z. Produto fora da lista vai para o fim. ' +
    'A estante mostra só os primeiros itens da ordem agrupada: aumente o Limite de itens para ver mais grupos.'
}
// Lista da página de categoria: uma única opção (as subcategorias saem da própria categoria; a configuração vale para todas as categorias)
const groupedCategoryOption = {
  label: 'Agrupar por subcategoria (categoria sem subcategorias: mais vendidos)',
  value: 'group_subcategory'
}
export const withGroupedSort = section => {
  if (section && section.name === 'category-retail') {
    if (section.fields.some(({ name, options }) => name === 'sort' && options.some(({ value }) => value === groupedCategoryOption.value))) return section
    return {
      ...section,
      fields: section.fields.map(field => field.name === 'sort' ? { ...field, options: field.options.concat(groupedCategoryOption) } : field)
    }
  }
  if (!section || section.name !== 'collection-shelf' || section.fields.some(({ name }) => name === 'group_order')) return section
  // A lista "Ordem dos grupos" vai no FIM dos campos, não ao lado de "Ordenação": o painel (init.js do tema) junta a
  // configuração da loja com a do tema por posição (lodash.merge); campo novo no meio desloca os nomes e o painel
  // quebra com "fields names must be unique" (13/10/2026).
  const fields = section.fields.map(field => field.name === 'sort' ? { ...field, options: field.options.concat(groupedSortOptions) } : field)
  fields.push(groupOrderField)
  return { ...section, fields }
}

export default ({ state }) => {
  const sections = getSections({ state }).map(withGroupedSort)
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
        label: 'Mostrar quadros informativos para quem não está logado',
        name: 'show_info_boxes',
        widget: 'boolean',
        default: true,
        required: false,
        hint: 'Usa as mensagens da cápsula do topo (cupom, frete grátis, 5x/PIX, desconto progressivo): editando lá, o quadro muda junto. Cliente logado não vê.'
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
