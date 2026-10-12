# Etiqueta "Nº mais vendido" (1º a 5º)

Etiqueta pequena no card (laranja, sobre a foto, canto inferior esquerdo) e na página do produto (discreta, acima do nome, com a categoria). Mostra a posição: "1º mais vendido", "2º mais vendido" até "5º".
Nasce **desligada e vazia**: enquanto `template/public/pe-best-sellers.json` não tiver dados válidos, nada aparece e nenhum card muda.

## Como funciona

- A loja lê `/pe-best-sellers.json` (mesmo padrão de `pe-cart-config.json` e `pe-freight-config.json`).
- O arquivo traz os SKUs mais colocados de cada categoria, com a posição (`rank`, inteiro de 1 a 5):

```json
{
  "enabled": true,
  "updated_at": "2026-10-12T03:00:00Z",
  "window_days": 90,
  "items": {
    "D_04_B_10": { "category": "04 brigadeiros", "rank": 1 },
    "D_04_K_10": { "category": "04 brigadeiros", "rank": 2 }
  }
}
```

- A etiqueta só aparece se `enabled` for `true`, `items` tiver o SKU com `category` preenchida e `rank` de 1 a 5, e `updated_at` tiver no máximo 3 dias. Ranking velho some sozinho.
- Falha de rede, 404, JSON quebrado ou arquivo vazio: nenhuma etiqueta, sem erro na página.

## Peças

| Peça | Arquivo |
|---|---|
| Leitura e regra de validade | `template/js/custom-js/best-sellers.js` |
| Componente | `template/js/custom-js/components/PeBestSeller.vue` |
| Card | `template/js/custom-js/html/ProductCard.html` (dentro de `product-card__pictures`) |
| Página do produto | `template/js/custom-js/html/TheProduct.html` (antes do nome) |
| Estilo | `template/scss/custom-css/_card-produto.scss` (`.pe-best-seller`) |
| Ranking (hoje vazio) | `template/public/pe-best-sellers.json` |
| Testes | `tests/best-sellers.test.cjs` (`node --test tests/*.test.cjs`) |

## Cor e contraste

- Card: texto marrom escuro `#3F2D25` sobre o laranja da marca `#FD8043`, contraste 5,17 (mínimo 4,5). Branco sobre o mesmo laranja daria 2,52.
- Página do produto: texto marrom `#3F2D25` sobre creme `#FFFADB` com borda laranja, contraste 12,36.

## Ligar, desligar, desfazer

- Desligar na hora: `"enabled": false` no JSON, commit e push no `master`.
- Desfazer tudo: reverter o commit da etiqueta.
- Quem gera o ranking (hoje ninguém): o PIMI vai calcular os mais vendidos por categoria, só com pedidos pagos, enviados ou entregues, com mínimo de pedidos na janela. Regra proposta (Rafael, 12/10): até 3 posições por categoria; até 5 só em categoria com bastante produto vendendo. Nada disso está no ar; o formato acima é o contrato.
