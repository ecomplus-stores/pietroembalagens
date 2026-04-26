import '#template/js/checkout'
import './custom-js/checkout'
import ecomCart from '@ecomplus/shopping-cart'

var lessUnit = document.getElementById('lessUnit')
var firstphrase = document.getElementById('lessSome')
var lastphrase = document.getElementById('noMore')
var containerCalc = document.getElementById('containerCalc')
var lastUnitsBar = document.getElementById('lastUnitsBar')
var percentBarEl = document.getElementById('percentBar')
var lessQuantity = window.giftWarning || 250

function formatMoney (value) {
  return window.ecomUtils && window.ecomUtils.formatMoney
    ? window.ecomUtils.formatMoney(value, 'BRL', 'pt_br')
    : 'R$ ' + Number(value || 0).toFixed(2).replace('.', ',')
}

function setDisplay (el, display) {
  if (el) {
    el.style.display = display
  }
}

function updateProgress (value) {
  if (lastUnitsBar) {
    lastUnitsBar.style.width = value
  }
  if (percentBarEl) {
    percentBarEl.innerHTML = value
  }
}

if (lessUnit) {
  lessUnit.innerHTML = formatMoney(lessQuantity)
}

ecomCart.on('change', ({ data }) => {
  var cartCalc = document.querySelectorAll('#cart')
  if (containerCalc && cartCalc.length) {
    containerCalc.style.display = 'block'
    var percentBar
    var countQuantity = data.subtotal
    var evalQuantity = lessQuantity - countQuantity
    if (evalQuantity > 0) {
      if (lessUnit) {
        lessUnit.innerHTML = formatMoney(evalQuantity)
      }
      percentBar = Math.round(countQuantity / lessQuantity * 100) + '%'
      updateProgress(percentBar)
      setDisplay(firstphrase, 'block')
      setDisplay(lastphrase, 'none')
    } else {
      percentBar = '100%'
      setDisplay(firstphrase, 'none')
      setDisplay(lastphrase, 'block')
      updateProgress(percentBar)
    }
  } else if (containerCalc) {
    containerCalc.style.display = 'none'
  }
})
