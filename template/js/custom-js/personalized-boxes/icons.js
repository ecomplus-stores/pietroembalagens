// Ícones ilustrados dos quadros informativos (viewBox 120×120): contorno marrom #3F2D25, laranja #FD8043, azul #37B8F7
// e creme #FFFADB. Desenhados para a Pietro (inspirados só na ideia de ilustração em duas cores do ML, nada copiado).
const S = 'stroke="#3F2D25" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"'
const star = (x, y, r, fill) => `<path d="M${x} ${y - r}L${x + r * 0.28} ${y - r * 0.28}L${x + r} ${y}L${x + r * 0.28} ${y + r * 0.28}L${x} ${y + r}L${x - r * 0.28} ${y + r * 0.28}L${x - r} ${y}L${x - r * 0.28} ${y - r * 0.28}Z" fill="${fill}"/>`
export default {
  // 5% OFF na 1ª compra: cupom picotado com % e brilhos
  percent: `<g transform="rotate(-8 60 62)">
    <path d="M14 36H106V54A8 8 0 0 0 106 70V88H14V70A8 8 0 0 0 14 54Z" fill="#FD8043" ${S}/>
    <path d="M80 42V82" stroke="#FFFADB" stroke-width="3" stroke-dasharray="4 5" stroke-linecap="round"/>
    <circle cx="40" cy="52" r="6" fill="#FFFADB" ${S} stroke-width="2.5"/><circle cx="58" cy="72" r="6" fill="#FFFADB" ${S} stroke-width="2.5"/>
    <path d="M60 48L38 76" ${S} stroke="#FFFADB" stroke-width="5"/><path d="M60 48L38 76" ${S}/>
  </g>${star(100, 26, 9, '#37B8F7')}${star(20, 24, 6, '#FFFADB')}${star(104, 100, 5, '#FD8043')}`,
  // Frete grátis: caminhão de entrega com caixa e linhas de velocidade
  truck: `<path d="M8 50H24M4 62H22M10 74H24" stroke="#37B8F7" stroke-width="4" stroke-linecap="round"/>
    <rect x="28" y="32" width="52" height="46" rx="5" fill="#FFFADB" ${S}/>
    <path d="M80 46H98L110 60V78H80Z" fill="#FD8043" ${S}/><path d="M86 52H97L104 61H86Z" fill="#FFFADB" ${S} stroke-width="2.5"/>
    <rect x="44" y="44" width="20" height="20" rx="3" fill="#FD8043" ${S} stroke-width="2.5"/><path d="M54 44V64M44 54H64" stroke="#FFFADB" stroke-width="3" stroke-linecap="round"/>
    <circle cx="46" cy="82" r="10" fill="#3F2D25"/><circle cx="46" cy="82" r="4" fill="#FFFADB"/>
    <circle cx="94" cy="82" r="10" fill="#3F2D25"/><circle cx="94" cy="82" r="4" fill="#FFFADB"/>${star(100, 28, 8, '#FD8043')}${star(24, 28, 5, '#37B8F7')}`,
  // 5x sem juros: cartão com selo "5x" e moedas
  'credit-card': `<g transform="rotate(-10 60 62)"><rect x="14" y="34" width="86" height="54" rx="9" fill="#FD8043" ${S}/>
    <rect x="14" y="46" width="86" height="12" fill="#3F2D25"/><rect x="24" y="68" width="22" height="14" rx="3" fill="#FFFADB" ${S} stroke-width="2.5"/>
    <path d="M56 76H88" stroke="#FFFADB" stroke-width="3.5" stroke-linecap="round"/></g>
    <circle cx="92" cy="34" r="17" fill="#37B8F7" ${S}/><text x="92" y="40" text-anchor="middle" font-size="17" font-weight="700" fill="#FFFFFF" stroke="none">5x</text>
    <circle cx="30" cy="100" r="9" fill="#FFFADB" ${S} stroke-width="2.5"/><circle cx="46" cy="104" r="9" fill="#FFFADB" ${S} stroke-width="2.5"/>${star(18, 28, 6, '#FD8043')}`,
  // Desconto progressivo: caixas em escada (quanto mais, melhor) e etiqueta de %
  layers: `<path d="M12 96H108" stroke="#3F2D25" stroke-width="3" stroke-linecap="round"/>
    <rect x="16" y="68" width="26" height="28" rx="3" fill="#FFFADB" ${S}/><path d="M29 68V80" ${S} stroke-width="2.5"/>
    <rect x="47" y="52" width="26" height="44" rx="3" fill="#37B8F7" ${S}/><path d="M60 52V66" ${S} stroke-width="2.5"/>
    <rect x="78" y="34" width="26" height="62" rx="3" fill="#FD8043" ${S}/><path d="M91 34V48" ${S} stroke-width="2.5"/>
    <circle cx="26" cy="38" r="14" fill="#FFFADB" ${S}/><path d="M32 31L20 45" ${S} stroke-width="2.5"/><circle cx="21" cy="33" r="2.6" fill="#FD8043" stroke="none"/><circle cx="31" cy="43" r="2.6" fill="#FD8043" stroke="none"/>${star(100, 18, 7, '#37B8F7')}`,
  // Etiqueta de preço (ícone 'tag' do topo)
  tag: `<g transform="rotate(-12 60 62)"><path d="M16 38H70L104 61L70 84H16Z" fill="#FD8043" ${S}/><circle cx="32" cy="61" r="5.5" fill="#FFFADB" ${S} stroke-width="2.5"/><path d="M58 70L74 52" ${S} stroke="#FFFADB" stroke-width="5"/><path d="M58 70L74 52" ${S}/><circle cx="59" cy="53" r="4.5" fill="#FFFADB" ${S} stroke-width="2.5"/><circle cx="73" cy="69" r="4.5" fill="#FFFADB" ${S} stroke-width="2.5"/></g>${star(100, 26, 8, '#37B8F7')}${star(22, 30, 5, '#FD8043')}`
}
