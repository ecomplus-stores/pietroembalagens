// Checkout copy, payment order and existing GA4 step events. Loaded only by the app head.
(function () {
  'use strict';

  /* ============ 1) Copy do checkout ============ */
  var TROCAS = [
    ['Complete seu cadastro para prosseguir com a compra:', 'Só precisamos dos seus dados para entrega:'],
    ['Complete seu cadastro para prosseguir com a compra', 'Só precisamos dos seus dados para entrega'],
    ['Identifique-se ou crie sua conta', 'Comprar sem criar senha'],
    ['Informe seu email para prosseguir', 'Informe seu e-mail para começar']
  ];
  function trocarTextos(raiz) {
    var w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT, null), no;
    while ((no = w.nextNode())) {
      var t = no.nodeValue;
      if (!t || t.length < 10) continue;
      for (var i = 0; i < TROCAS.length; i++) {
        if (t.indexOf(TROCAS[i][0]) !== -1) { no.nodeValue = t.replace(TROCAS[i][0], TROCAS[i][1]); break; }
      }
    }
  }

  /* ============ 4) Ordem dos meios de pagamento ============ */
  function ordenarPagamentos() {
    var gs = document.querySelectorAll('.payment__gateway');
    if (!gs.length) return;
    var cont = gs[0].parentElement;
    if (cont) {
      var cs = window.getComputedStyle(cont);
      if (cs.display !== 'flex') cont.style.display = 'flex';
      if (cs.flexDirection !== 'column') cont.style.flexDirection = 'column';
    }
    for (var i = 0; i < gs.length; i++) {
      var t = (gs[i].textContent || '').toLowerCase();
      var o = '3';
      if (t.indexOf('pix') !== -1) o = '1';
      else if (t.indexOf('boleto') !== -1) o = '2';
      if (gs[i].style.order !== o) gs[i].style.order = o;
    }
  }

  /* ============ 5) GA4: etapas do checkout ============ */
  function emitir(nome) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', nome, { currency: 'BRL' });
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: nome, currency: 'BRL' });
    } catch (e) {}
  }
  function umaVez(k) {
    try { if (sessionStorage.getItem(k)) return false; sessionStorage.setItem(k, '1'); return true; }
    catch (e) { return false; }
  }
  function etapaCheckout() {
    var m = (location.hash || '').match(/#\/checkout(?:\/(\d+))?/);
    if (!m) return -1;
    return m[1] ? parseInt(m[1], 10) : 0;
  }
  function detectarEtapa() {
    var etapa = etapaCheckout();
    if (etapa < 0) return;
    if (document.querySelector('input[placeholder="CPF"], input[placeholder="CNPJ"]')) {
      if (umaVez('pe_dados')) emitir('checkout_dados_cadastrais');
    }
    if (etapa === 1 && umaVez('pe_entrega')) emitir('add_shipping_info');
    if (etapa === 2 && umaVez('pe_pagamento')) emitir('add_payment_info');
  }

  var timer = null;
  function rodar() {
    timer = null;
    if (etapaCheckout() < 0) return;
    var raiz = document.getElementById('spa') || document.querySelector('main');
    if (!raiz) return;
    try { trocarTextos(raiz); } catch (e) {}
    try { ordenarPagamentos(); } catch (e) {}
    try { detectarEtapa(); } catch (e) {}
  }
  function agendar() {
    if (etapaCheckout() < 0 || timer) return;
    timer = setTimeout(rodar, 250);
  }
  function iniciar() {
    // #spa is the stable EJS wrapper; Vue replaces its children when the route changes.
    var raiz = document.getElementById('spa') || document.querySelector('main');
    if (!raiz) return;
    rodar();
    try {
      new MutationObserver(agendar).observe(raiz, { childList: true, subtree: true, characterData: true });
    } catch (e) {}
    window.addEventListener('hashchange', agendar);
    document.addEventListener('change', agendar, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
