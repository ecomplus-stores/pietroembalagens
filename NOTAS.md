# 📋 Notas de Desenvolvimento — Pietro Embalagens

Histórico de alterações e decisões técnicas do site [pietroembalagens.com.br](https://www.pietroembalagens.com.br).

---

## 🔐 Acesso e Infraestrutura

| Item | Detalhe |
|------|---------|
| **Painel E-com.plus** | https://app.e-com.plus/#/home |
| **Store ID** | 51395 |
| **GitHub Repo** | https://github.com/ecomplus-stores/pietroembalagens |
| **Branch principal** | `master` |
| **Deploy** | Automático via GitHub Actions a cada push no `master` |
| **Repo local (VM)** | `/home/work/.openclaw/workspace/pietroembalagens` |

---

## 🛡️ Backups

| Data | Tipo | Referência |
|------|------|-----------|
| 29/03/2026 | Branch | `backup-29mar2026` |
| 29/03/2026 | Tag | `v-antes-ajustes-seo` |

Para restaurar: `git checkout backup-29mar2026` ou `git checkout v-antes-ajustes-seo`

---

## ✅ Histórico de Alterações

### 29/03/2026 — SEO: Meta descriptions + Textos de categoria + FAQs

**O que foi feito:** Aplicadas meta descriptions, textos descritivos e FAQs (4 perguntas cada) em 20 categorias principais via API da E-com.plus.

**Categorias atualizadas:**

| # | Categoria | Slug |
|---|-----------|------|
| 1 | Caixas P/ Doces | `/caixas-embalagens-para-doces-e-brigadeiro` |
| 2 | Páscoa 2026 | `/pascoa` |
| 3 | Forminha para doces | `/forminhas-para-doces` |
| 4 | Formas BWB | `/formas-para-chocolate` |
| 5 | Caixa de Acetato | `/caixa-de-acetato` |
| 6 | Confeitaria | `/confeitaria` |
| 7 | Caixa para Doces (principal) | `/caixas-para-doces-e-brigadeiro` |
| 8 | Caixas P/ Biscoitos | `/embalagem-para-biscoitos` |
| 9 | Caixas P/ Brownie | `/embalagem-para-brownies` |
| 10 | Caixas P/ Macarons | `/embalagens-para-macarons` |
| 11 | Transporte e Delivery | `/embalagem-para-transporte-delivery-doces-macarons` |
| 12 | Caixas para Bolo | `/caixas-para-bolos` |
| 13 | Caixas com Berço | `/caixas-com-berco` |
| 14 | Tampa com Visor | `/caixa-com-visor-para-doces-brigadeiros` |
| 15 | Corantes | `/corantes` |
| 16 | Sacolas | `/sacola-kraft-branca` |
| 17 | Caixa para Ovo de Colher | `/ovo-de-colher` |
| 18 | Super Kits | `/super-kits-caixas-para-doces` |
| 19 | Saquinhos Transparentes | `/saquinho-transparente-pietro-embalagens` |
| 20 | Fitas de Cetim | `/fita-de-cetim` |

**Impacto esperado:** Melhora de indexação e CTR no Google em 4–8 semanas.

**Método:** API REST E-com.plus (`PATCH /v1/categories/{id}.json`) — campos `meta_description` e `body_html`.

---

## 🗺️ Estrutura do Repositório

| Pasta/Arquivo | Descrição |
|---|---|
| `content/*.json` | Configurações do site: menu, header, footer, home, settings |
| `content/pages/` | Páginas institucionais (sobre, frete, contato, etc.) |
| `content/posts/` | Posts do blog (SEO/conteúdo) |
| `content/widgets/` | Integrações externas (Analytics, Pixel, etc.) |
| `template/scss/` | CSS personalizado (visual, cores, fontes) |
| `template/js/` | JavaScript customizado |
| `template/pages/` | Templates EJS das páginas |

---

## 🔄 Fluxo de Trabalho

```
Rafael pede alteração
       ↓
Assistente prepara e mostra o diff
       ↓
Rafael aprova
       ↓
Commit + push no master
       ↓
GitHub Actions faz deploy automático
       ↓
Mudança no ar em ~5 minutos
```

---

### 29/03/2026 — Checkout: botão de valor mínimo estilizado

**O que foi feito:** O aviso de valor mínimo para finalizar compra ("Necessário inserir R$ X,XX para finalizar compra") foi transformado de texto simples em um botão estilizado no padrão Pietro Embalagens.

**Arquivo alterado:** `template/js/custom-js/html/PaymentMethods.html`

**Estilo aplicado:** Botão arredondado (border-radius: 50px), laranja `#FD8043`, texto branco, fonte Quicksand bold, ícone de carrinho (Font Awesome), centralizado, desabilitado (não clicável).

**Commit:** `feat(checkout): transforma aviso de valor mínimo em botão estilizado Pietro`

---

Como editar valor minimo pedido:
Vá no campo de pesquisa dentro de código e digite paymentmethod.js
altere as linhas 46 e 112

---


## 📌 Próximos Passos Sugeridos

- [ ] Textos descritivos nos produtos mais vendidos
- [ ] Estratégia de blog/conteúdo para SEO de cauda longa
- [ ] Estratégia de reativação de clientes (email/WhatsApp)
- [ ] Card com QR code nos pedidos dos marketplaces para converter cliente para site próprio
