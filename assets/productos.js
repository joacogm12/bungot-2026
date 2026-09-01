/* ==========================================================================
   BUNGOT 2026 — productos.js
   Lógica de la página de productos por bandas: flechas del carrusel y filtros
   que reordenan las bandas sin recargar. Se auto-inicializa solo si el markup
   está presente, igual que el resto del tema.
   ========================================================================== */
(function () {
  'use strict';

  /* Paso de las flechas = ancho real de una tarjeta + el gap del riel. Se mide
     y no se fija (antes 344 + 24) porque en móvil la tarjeta y el gap se
     achican por CSS y un paso fijo saltaba tarjeta y media. */
  function paso(rail) {
    var card = rail.querySelector('.card');
    var gap = parseFloat(getComputedStyle(rail).columnGap) || 24;
    return card ? card.getBoundingClientRect().width + gap : 368;
  }

  function init() {
    var roots = document.querySelectorAll('[data-productos]');
    if (!roots.length) return;
    for (var i = 0; i < roots.length; i++) setup(roots[i]);
  }

  function setup(root) {
    var bandas = root.querySelectorAll('[data-banda]');
    for (var i = 0; i < bandas.length; i++) setupRail(bandas[i]);
    setupFilters(root, bandas);
    setupAddForms(root);
  }

  /* --- "Agregar" de cada tarjeta: sin navegar al carrito -------------------
     El form de banda-card mandaría a /cart/add (y de ahí a la página del
     carrito); acá se intercepta y el agregado va por fetch. La confirmación
     es el vuelo de la bolita (window.BUNGOT.flyToCart, theme.js): el contador
     del header sube al aterrizar, con el item_count real si el fetch ya
     regresó. El botón solo se bloquea mientras dura el fetch. Si Shopify
     rechaza el agregado (422: agotado, sin plan…) el vuelo se cancela con
     vuelo.falla() — sin eso el botón decía "¡Listo!" y el carrito llegaba
     vacío. */
  function setupAddForms(root) {
    var forms = root.querySelectorAll('.card__addform');
    for (var i = 0; i < forms.length; i++) wireAddForm(forms[i]);
  }

  function wireAddForm(form) {
    form.addEventListener('submit', function (e) {
      // Sin el helper (theme.js no cargó) que siga el submit clásico: agrega
      // navegando, que es peor pero nunca deja de agregar.
      if (!window.BUNGOT || !window.BUNGOT.flyToCart) return;
      e.preventDefault();

      var btn = form.querySelector('.card__add');
      var vuelo = window.BUNGOT.flyToCart(btn, { cantidad: 1 });
      if (btn) btn.disabled = true;
      fetch('/cart/add.js', {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(function (r) {
          if (!r.ok) { var err = new Error('cart/add ' + r.status); err.rechazado = true; throw err; }
          return fetch('/cart.js', { headers: { Accept: 'application/json' } });
        })
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          vuelo.ponTotal(cart.item_count);
          if (btn) btn.disabled = false;
        })
        .catch(function (err) {
          // Rechazado por Shopify: cancelar el festejo. Sin backend (red caída,
          // /cart.js que no contesta) el contador ya subió al aterrizar; solo
          // soltar el botón.
          if (err && err.rechazado) vuelo.falla();
          if (btn) btn.disabled = false;
        });
    });
  }

  /* --- Carrusel por banda -------------------------------------------------- */
  function setupRail(banda) {
    var rail = banda.querySelector('[data-rail]');
    if (!rail) return;

    var prev = banda.querySelector('[data-prev]');
    var next = banda.querySelector('[data-next]');
    var arrows = banda.querySelector('[data-arrows]');

    if (prev) prev.addEventListener('click', function () {
      rail.scrollBy({ left: -paso(rail), behavior: 'smooth' });
    });
    if (next) next.addEventListener('click', function () {
      rail.scrollBy({ left: paso(rail), behavior: 'smooth' });
    });

    // Ocultar las flechas cuando todo cabe en la fila (nada que desplazar).
    function measure() {
      if (!arrows) return;
      var fits = rail.scrollWidth <= rail.clientWidth + 1;
      arrows.style.visibility = fits ? 'hidden' : '';
    }

    measure();
    // Solo el resize que cambia el ancho: la barra del navegador de celu
    // dispara resize sin mover ninguna medida horizontal.
    var lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      if (window.innerWidth === lastW) return;
      lastW = window.innerWidth;
      measure();
    });
    // Guardado para re-medir tras un cambio de filtro (una banda oculta pasa a
    // clientWidth 0 y hay que recalcular cuando vuelve a mostrarse).
    banda._pgMeasure = measure;
  }

  function remeasure(root) {
    var bandas = root.querySelectorAll('[data-banda]');
    for (var i = 0; i < bandas.length; i++) {
      if (bandas[i]._pgMeasure) bandas[i]._pgMeasure();
    }
  }

  /* --- Filtros: reordenan las bandas, no recargan --------------------------
     No hay chip "Todos": como las bandas nunca se esconden (salvo la de gato
     al elegir "Para perro"), el estado sin filtro es simplemente ningún chip
     activo. Volver a picar el chip activo regresa a ese estado. */
  function setupFilters(root, bandas) {
    var buttons = root.querySelectorAll('[data-filter]');
    if (!buttons.length) return;

    // Vuelve al orden original: cada banda a su order y todas visibles.
    function reset() {
      for (var i = 0; i < bandas.length; i++) {
        bandas[i].style.order = bandas[i].getAttribute('data-order');
        bandas[i].style.display = '';
      }
    }

    function clearActive() {
      for (var i = 0; i < buttons.length; i++) buttons[i].classList.remove('pfilter--active');
    }

    function raise(key) {
      var el = root.querySelector('[data-banda="' + key + '"]');
      if (el) el.style.order = '0';
    }

    function hide(key) {
      var el = root.querySelector('[data-banda="' + key + '"]');
      if (el) el.style.display = 'none';
    }

    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function (e) {
        var btn = e.currentTarget;
        var wasActive = btn.classList.contains('pfilter--active');

        clearActive();
        reset();

        // Clic en el activo: se apaga y queda el orden original, sin activo.
        if (wasActive) {
          remeasure(root);
          return;
        }

        btn.classList.add('pfilter--active');

        var target = btn.getAttribute('data-target');
        if (target) raise(target);

        var toHide = btn.getAttribute('data-hide');
        if (toHide) hide(toHide);

        remeasure(root);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
