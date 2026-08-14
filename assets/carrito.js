/* ==========================================================================
   BUNGOT — carrito.js (página del recibo)
   JS vanilla, sin dependencias. Se auto-inicializa solo si el markup del
   recibo está presente, como todo lo demás del tema.

   El servidor pinta el primer render; de ahí en adelante este archivo lleva
   la cuenta: steppers, quitar líneas, subtotal/envío/total, el sello del
   envío gratis, el resumen de piezas, el contador del header y la región
   aria-live. Cada cambio se sincroniza con /cart/change.js usando la key de
   la línea; si la red falla, la pantalla se queda como está (mejor un número
   optimista que un carrito que "rebota").

   TODO el copy sale del <script data-rc-i18n> (que sale de locales/): acá no
   hay ni una cadena de UI escrita a mano.
   ========================================================================== */
(function () {
  'use strict';

  function init() {
    var page = document.querySelector('[data-recibo]');
    if (!page) return;

    var papel = page.querySelector('[data-rc-papel]');
    var vacio = page.querySelector('[data-rc-vacio]');
    var upsell = page.querySelector('[data-rc-upsell]');
    var lineas = page.querySelector('[data-rc-lineas]');
    var live = page.querySelector('[data-rc-live]');

    var umbral = parseInt(page.getAttribute('data-free-threshold'), 10) || 0;
    var costoEnvio = parseInt(page.getAttribute('data-shipping'), 10) || 0;

    var t = {};
    try {
      t = JSON.parse(page.querySelector('[data-rc-i18n]').textContent);
    } catch (e) {
      /* Sin copy no hay nada que anunciar, pero los números siguen saliendo. */
    }

    /* Centavos → "$1,234.50", siempre es-MX y siempre dos decimales: el mismo
       formato acá y en Liquid (que solo pinta el primer render). */
    function fmt(cents) {
      return '$' + (cents / 100).toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    function filas() {
      return Array.prototype.slice.call(page.querySelectorAll('[data-rc-linea]'));
    }

    /* --- Recalcular todo desde el DOM ------------------------------------ */
    function recalc(anunciar) {
      var subtotal = 0;
      var piezas = 0;
      var productos = 0;

      filas().forEach(function (fila) {
        var precio = parseInt(fila.getAttribute('data-price'), 10) || 0;
        var qty = parseInt(fila.getAttribute('data-qty'), 10) || 0;
        var importe = precio * qty;
        subtotal += importe;
        piezas += qty;
        productos += 1;

        fila.querySelector('[data-rc-qty]').textContent = qty;
        fila.querySelector('[data-rc-importe]').textContent = fmt(importe);
        var unit = fila.querySelector('[data-rc-unit]');
        if (unit) unit.textContent = fmt(precio);
      });

      var gratis = subtotal >= umbral;
      var envio = gratis ? 0 : costoEnvio;
      var total = subtotal + envio;

      var elSub = page.querySelector('[data-rc-subtotal]');
      if (elSub) elSub.textContent = fmt(subtotal);

      var elEnvio = page.querySelector('[data-rc-envio]');
      if (elEnvio) {
        elEnvio.textContent = gratis ? (t.shippingFree || '') : fmt(envio);
        elEnvio.classList.toggle('es-gratis', gratis);
      }

      var elTotal = page.querySelector('[data-rc-total]');
      if (elTotal) elTotal.textContent = fmt(total);

      var sello = page.querySelector('[data-rc-sello]');
      if (sello) {
        if (gratis) {
          sello.textContent = t.sealFree || '';
        } else {
          sello.textContent = (t.sealMissing || '[amount]').replace('[amount]', fmt(umbral - subtotal));
        }
        sello.classList.toggle('recibo__sello--gratis', gratis);
        sello.classList.toggle('recibo__sello--falta', !gratis);
      }

      var resumen = page.querySelector('[data-rc-resumen]');
      var textoPiezas = piezas + ' ' + (piezas === 1 ? t.pieceOne : t.pieceOther);
      if (resumen) {
        resumen.textContent = textoPiezas + ' · ' + productos + ' ' +
          (productos === 1 ? t.productOne : t.productOther);
      }

      // La pestaña del header (y su copia en el panel del burger) al día.
      document.querySelectorAll('[data-cart-count]').forEach(function (contador) {
        contador.textContent = piezas;
      });

      if (anunciar && live && t.liveUpdate) {
        live.textContent = t.liveUpdate
          .replace('[pieces]', textoPiezas)
          .replace('[total]', fmt(total));
      }

      // Sin líneas no hay recibo: entra la nota en blanco.
      if (productos === 0) {
        if (papel) papel.hidden = true;
        if (upsell) upsell.hidden = true;
        if (vacio) vacio.hidden = false;
      }
    }

    /* --- Sincronizar una línea con el servidor --------------------------- */
    function syncLinea(fila, qty) {
      fetch('/cart/change.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: fila.getAttribute('data-key'), quantity: qty })
      }).catch(function () {
        /* Optimistas: la pantalla ya cambió y el checkout manda el carrito
           real del servidor de todos modos. */
      });
    }

    function ponerQty(fila, qty) {
      if (qty <= 0) {
        syncLinea(fila, 0);
        fila.remove();
      } else {
        fila.setAttribute('data-qty', qty);
        syncLinea(fila, qty);
      }
      recalc(true);
    }

    if (lineas) {
      lineas.addEventListener('click', function (e) {
        var fila = e.target.closest('[data-rc-linea]');
        if (!fila) return;

        var step = e.target.closest('[data-rc-step]');
        if (step) {
          var qty = (parseInt(fila.getAttribute('data-qty'), 10) || 0) +
            parseInt(step.getAttribute('data-rc-step'), 10);
          ponerQty(fila, qty);
          return;
        }

        if (e.target.closest('[data-rc-remove]')) ponerQty(fila, 0);
      });
    }

    /* --- Sugeridos: entra con cantidad 1 y se recarga -------------------- */
    /* La recarga es a propósito: la línea nueva la re-renderiza Liquid del
       lado del servidor (foto, eyebrow, key real), en lugar de duplicar acá
       la plantilla del snippet. */
    page.querySelectorAll('[data-rc-add]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ id: parseInt(btn.getAttribute('data-rc-add'), 10), quantity: 1 })
        })
          .then(function (r) {
            if (!r.ok) throw new Error('cart/add');
            window.location.reload();
          })
          .catch(function () {
            btn.disabled = false;
          });
      });
    });

    /* Primer pase: unifica el formato que pintó Liquid con el del cliente y
       deja listos sello, envío y resumen (que Liquid no calcula). */
    recalc(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
