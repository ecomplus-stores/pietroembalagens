// Item esgotado (T114): quando o estoque acaba, a loja zera a quantidade do item no carrinho e ele sai do pedido
// sem aviso nenhum (com todos esgotados, o total vai a R$ 0 e a tela de pagamento fica parada).
// Devolve o nome de cada item com quantidade 0, para a tela de pagamento avisar (PeOutOfStock.vue).
export const itensEsgotados = items => (items || [])
  .filter(item => item.quantity === 0 && !(Array.isArray(item.flags) && item.flags.includes('freebie')))
  .map(item => String(item.name || '').replace(/\s*\|\s*Pietro Embalagens\s*/i, ' ').trim())
