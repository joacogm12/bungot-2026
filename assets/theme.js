/* ==========================================================================
   BUNGOT 2026 — theme.js
   JS vanilla, sin dependencias. Cada bloque se auto-inicializa si su
   markup está presente, así las secciones se pueden borrar sin romper nada.
   ========================================================================== */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Preloader: "armando el premio perfecto" ------------------------- */
  function initPreloader() {
    var el = document.querySelector('[data-preloader]');
    if (!el) return;

    // Una vez por sesión: molesta ver la animación en cada navegación.
    var seen = false;
    try {
      seen = sessionStorage.getItem('bungot:preloaded') === '1';
    } catch (e) {
      /* Safari en modo privado tira acá; seguimos sin persistir. */
    }

    if (seen || reduceMotion) {
      el.setAttribute('data-done', 'true');
      return;
    }

    var msgEl = el.querySelector('[data-preloader-msg]');
    var msgs = [];
    try {
      msgs = JSON.parse(el.getAttribute('data-messages') || '[]');
    } catch (e) {
      msgs = [];
    }

    var duration = parseInt(el.getAttribute('data-duration'), 10) || 2000;
    var i = 0;

    if (msgEl && msgs.length) {
      msgEl.textContent = msgs[0];
      var step = Math.max(400, duration / msgs.length);
      var cycle = setInterval(function () {
        i += 1;
        if (i >= msgs.length) return clearInterval(cycle);
        msgEl.textContent = msgs[i];
      }, step);
    }

    function finish() {
      el.setAttribute('data-done', 'true');
      try {
        sessionStorage.setItem('bungot:preloaded', '1');
      } catch (e) {
        /* no-op */
      }
    }

    // El preloader nunca debe secuestrar la página: se va sí o sí al
    // cumplirse el tiempo, haya cargado todo o no.
    setTimeout(finish, duration);
  }

  /* --- Ficha del perro: el ÚNICO lugar donde se lee y se escribe --------
     Nombre, tamaño, cumpleaños y avatar del perro. Vive acá y no en cuenta.js
     porque el header la necesita en TODAS las páginas y cuenta.js solo se
     carga en la ficha.

     Por qué localStorage: la tienda usa las cuentas NUEVAS de Shopify, donde
     el storefront no puede escribir metafields del cliente sin una app. Pero
     la ficha SÍ viaja a la cuenta por el único canal que el tema tiene hacia
     el servidor: los atributos del carrito (_perro_*), que se pegan al pedido
     al comprar y un workflow de Shopify Flow los copia a los metafields del
     cliente (custom.perro_* y custom.dog_avatar). A la vuelta, theme.liquid
     inyecta esos metafields como window.BUNGOT.fichaServidor y acá se adoptan
     en dispositivos nuevos: el perro sigue al usuario entre aparatos, con la
     compra como correo.

     Todo el tema pasa por acá — el header, el selector y la ficha—, así que
     ningún otro archivo sabe dónde están guardados los datos. La lectura
     server-side equivalente vive en snippets/dog-avatar.liquid, que ya tiene
     el metafield como primera opción.

     Se expone en window.BUNGOT para que cuenta.js lo use sin duplicarlo. */

  // La ficha es POR USUARIO: con sesión, la clave lleva el id del cliente
  // (window.BUNGOT.usuario, lo pone theme.liquid), así cada cuenta guarda su
  // perro en este dispositivo. Sin sesión se usa la clave suelta de siempre.
  var USUARIO = window.BUNGOT && window.BUNGOT.usuario;
  var CLAVE_ANON = 'bungot:perro';
  var CLAVE_PERRO = USUARIO ? CLAVE_ANON + ':' + USUARIO : CLAVE_ANON;

  // Al entrar, la cuenta ADOPTA la ficha que se llenó sin sesión (la persona
  // es la misma). La anónima se borra al adoptarla: si quedara, la siguiente
  // cuenta que entrara en este dispositivo heredaría un perro ajeno. La
  // bandera evita que, más abajo, la cuenta pise esta ficha recién llenada —
  // en este caso lo recién adoptado es lo más fresco y viaja hacia ARRIBA.
  var ADOPTADA_ANON = false;
  if (USUARIO) {
    try {
      if (!localStorage.getItem(CLAVE_PERRO) && localStorage.getItem(CLAVE_ANON)) {
        localStorage.setItem(CLAVE_PERRO, localStorage.getItem(CLAVE_ANON));
        localStorage.removeItem(CLAVE_ANON);
        ADOPTADA_ANON = true;
      }
    } catch (e) { /* no-op: sin storage, la ficha es opcional igual */ }
  }

  // La ficha, copiada como atributos del carrito para que viaje en el pedido.
  // Guion bajo en las claves: la convención de atributo "privado" que los
  // temas no pintan en el carrito ni en el checkout. Fire-and-forget: si el
  // POST falla, la ficha local sigue intacta y el próximo cambio (o la
  // próxima sesión) lo reintenta. La firma en sessionStorage evita repetir
  // el POST en cada carga con el carrito ya al día.
  function sincronizarCarrito(ficha) {
    var attrs = {
      _perro_nombre: ficha.nombre || '',
      _perro_tamano: ficha.tamano || '',
      _perro_cumple: ficha.cumple || '',
      _perro_avatar: ficha.avatar || ''
    };
    var firma = JSON.stringify(attrs);
    try {
      if (sessionStorage.getItem('bungot:perro-carrito') === firma) return;
    } catch (e) { /* sin sessionStorage, se manda igual */ }
    fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attributes: attrs })
    }).then(function () {
      try { sessionStorage.setItem('bungot:perro-carrito', firma); } catch (e) { /* no-op */ }
    }).catch(function () { /* no-op */ });
  }

  // La ficha directa a la CUENTA, sin esperar compra: se la mandamos al
  // worker (app-ficha/) y él escribe los metafields del cliente al momento.
  // Solo con sesión (theme.liquid solo emite fichaApi con customer). Si el
  // worker está apagado (fichaApi ausente) no pasa nada: queda el camino de
  // respaldo por atributos de carrito + Flow, que también cubre a quien
  // compra sin sesión. Fire-and-forget, igual que el carrito.
  function sincronizarCuenta(ficha) {
    var api = window.BUNGOT && window.BUNGOT.fichaApi;
    if (!api || !api.url) return;
    var cuerpo = JSON.stringify({
      id: api.id,
      firma: api.firma,
      ficha: {
        nombre: ficha.nombre || '',
        tamano: ficha.tamano || '',
        cumple: ficha.cumple || '',
        avatar: ficha.avatar || ''
      }
    });
    try {
      if (sessionStorage.getItem('bungot:perro-cuenta') === cuerpo) return;
    } catch (e) { /* sin sessionStorage, se manda igual */ }
    fetch(api.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo
    }).then(function (res) {
      if (!res.ok) return;
      try { sessionStorage.setItem('bungot:perro-cuenta', cuerpo); } catch (e) { /* no-op */ }
    }).catch(function () { /* no-op */ });
  }

  var Perro = {
    read: function () {
      try {
        return JSON.parse(localStorage.getItem(CLAVE_PERRO)) || {};
      } catch (e) {
        // Storage bloqueado (modo privado) o JSON corrupto: se sigue sin ficha.
        return {};
      }
    },

    write: function (data) {
      var actual = Perro.read();
      // Merge y no reemplazo: así guardar solo el avatar no borra el nombre.
      for (var k in data) {
        if (Object.prototype.hasOwnProperty.call(data, k)) actual[k] = data[k];
      }
      try {
        localStorage.setItem(CLAVE_PERRO, JSON.stringify(actual));
      } catch (e) {
        /* no-op: si no se puede guardar, la ficha es opcional igual */
      }
      // Avisamos en la misma pestaña: el evento nativo `storage` solo llega a
      // las OTRAS, y el header tiene que refrescarse en esta.
      document.dispatchEvent(new CustomEvent('bungot:perro', { detail: actual }));
      sincronizarCarrito(actual);
      sincronizarCuenta(actual);
      return actual;
    },

    clear: function () {
      try {
        localStorage.removeItem(CLAVE_PERRO);
      } catch (e) {
        /* no-op */
      }
      document.dispatchEvent(new CustomEvent('bungot:perro', { detail: {} }));
      sincronizarCarrito({});
      sincronizarCuenta({});
    }
  };

  window.BUNGOT = window.BUNGOT || {};
  window.BUNGOT.perro = Perro;

  // La vuelta del viaje: con sesión, la CUENTA es la fuente de verdad y pisa
  // lo local — el worker la escribe en cada guardado, así que trae el último
  // guardado hecho desde CUALQUIER dispositivo; lo local solo sabe de este.
  // Se escriben las cuatro claves (vacías incluidas) para que también borre
  // lo local viejo que en la cuenta ya no está. Si el POST del worker falló
  // en el último guardado, este pisotón puede regresar una versión anterior
  // al recargar — raro, y el siguiente guardado lo vuelve a subir.
  var DEL_SERVIDOR = window.BUNGOT.fichaServidor;
  if (USUARIO && DEL_SERVIDOR && !ADOPTADA_ANON) {
    Perro.write({
      nombre: DEL_SERVIDOR.nombre || '',
      tamano: DEL_SERVIDOR.tamano || '',
      cumple: DEL_SERVIDOR.cumple || '',
      avatar: DEL_SERVIDOR.avatar || ''
    });
  }

  // El carrito de HOY arranca con la ficha puesta: los atributos mueren con
  // cada pedido (el carrito siguiente nace vacío), así que al cargar se
  // vuelven a poner para el próximo. La firma de arriba evita el POST si el
  // carrito ya los trae de esta misma sesión.
  var fichaArranque = Perro.read();
  if (fichaArranque.nombre || fichaArranque.tamano || fichaArranque.cumple || fichaArranque.avatar) {
    sincronizarCarrito(fichaArranque);
    // Se sube al arranque cuando la cuenta va atrás: está vacía (la ficha se
    // llenó cuando el worker no existía, o aquel POST falló) o acaba de
    // adoptar la ficha anónima recién llenada. Sanación de arranque.
    if (USUARIO && (!DEL_SERVIDOR || ADOPTADA_ANON)) sincronizarCuenta(fichaArranque);
  }

  /* --- El avatar del perro en el header --------------------------------
     Pinta la cara elegida sobre el botón de cuenta. Sin ficha guardada el
     botón se queda tal cual estaba ("Yo" o la inicial). SOLO con sesión: el
     perro es del usuario, y sin sesión el botón no debe aparentar una cuenta
     que no existe — se queda en "Yo" aunque haya ficha local (pedido del
     cliente). */
  function initPerroNav() {
    var boton = document.querySelector('[data-me]');
    if (!boton) return;
    if (boton.getAttribute('data-logged') !== 'true') return;

    var img = boton.querySelector('[data-dog-avatar]');
    if (!img) return;

    // El mapa id -> archivo lo arma Liquid en el propio botón: acá no se
    // reconstruyen nombres de assets a mano (ver snippets/dog-avatar.liquid).
    var plantilla = boton.getAttribute('data-avatar-src');
    if (!plantilla) return;

    function pintar(ficha) {
      // La ficha SOLO cambia la cara. El nombre de la pastilla es el del
      // CLIENTE y lo pinta Liquid con sesión; sin sesión no hay nombre — el
      // botón lleva a iniciar sesión y no debe aparentar una sesión que no
      // existe.
      var tiene = !!(ficha && ficha.avatar);
      boton.setAttribute('data-perro', String(tiene));
      if (tiene) img.src = plantilla.replace('__ID__', ficha.avatar);
    }

    pintar(Perro.read());
    document.addEventListener('bungot:perro', function (e) { pintar(e.detail); });
  }

  /* --- Menú mobile ----------------------------------------------------- */
  function initNav() {
    var burger = document.querySelector('[data-burger]');
    var nav = document.querySelector('[data-nav]');
    if (!burger || !nav) return;

    function setOpen(open) {
      nav.setAttribute('data-open', String(open));
      burger.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    }

    burger.addEventListener('click', function () {
      setOpen(nav.getAttribute('data-open') !== 'true');
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.getAttribute('data-open') === 'true') {
        setOpen(false);
        burger.focus();
      }
    });

    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') setOpen(false);
    });
  }

  /* --- Filtros del grid + contador ------------------------------------- */
  function initFilters() {
    var root = document.querySelector('[data-collection]');
    if (!root) return;

    var chips = root.querySelectorAll('[data-filter]');
    var cards = root.querySelectorAll('[data-tags]');
    var countEl = root.querySelector('[data-count]');
    var emptyEl = root.querySelector('[data-empty]');
    var countLabel = countEl ? countEl.getAttribute('data-label') || 'PRODUCTOS' : '';

    function apply(filter) {
      var shown = 0;

      // Un chip puede declarar varios tokens separados por coma ("juguete,juguetes"):
      // los datos de la tienda mezclan singular y plural, y las categorías salen
      // de tags, product type y colecciones a la vez.
      var wanted = filter.split(',').map(function (s) { return s.trim(); });

      cards.forEach(function (card) {
        var tokens = (card.getAttribute('data-tags') || '').split('|');
        var match = filter === 'all' || wanted.some(function (w) {
          return w !== '' && tokens.indexOf(w) !== -1;
        });
        card.hidden = !match;
        if (match) shown += 1;
      });

      chips.forEach(function (chip) {
        chip.setAttribute('aria-pressed', String(chip.getAttribute('data-filter') === filter));
      });

      if (countEl) countEl.textContent = shown + ' ' + countLabel;
      if (emptyEl) emptyEl.hidden = shown !== 0;

      // Reflejar el filtro en la URL para que sea compartible / navegable.
      var url = new URL(window.location.href);
      if (filter === 'all') url.searchParams.delete('c');
      else url.searchParams.set('c', filter);
      history.replaceState(null, '', url);
    }

    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        apply(chip.getAttribute('data-filter'));
      });
    });

    var initial = new URL(window.location.href).searchParams.get('c') || 'all';
    var valid = Array.prototype.some.call(chips, function (c) {
      return c.getAttribute('data-filter') === initial;
    });
    apply(valid ? initial : 'all');
  }

  /* --- Carrusel numerado 01/03 ----------------------------------------- */
  function initCarousels() {
    document.querySelectorAll('[data-carousel]').forEach(function (root) {
      var viewport = root.querySelector('[data-carousel-viewport]');
      var slides = root.querySelectorAll('[data-slide]');
      var counter = root.querySelector('[data-carousel-counter]');
      var prev = root.querySelector('[data-carousel-prev]');
      var next = root.querySelector('[data-carousel-next]');
      if (!viewport || !slides.length) return;

      var index = 0;

      function pad(n) {
        return String(n).padStart(2, '0');
      }

      function render() {
        if (counter) counter.textContent = pad(index + 1) + ' / ' + pad(slides.length);
        if (prev) prev.disabled = index === 0;
        if (next) next.disabled = index === slides.length - 1;
      }

      function go(to) {
        index = Math.max(0, Math.min(slides.length - 1, to));
        viewport.scrollTo({
          left: slides[index].offsetLeft - viewport.offsetLeft,
          behavior: reduceMotion ? 'auto' : 'smooth'
        });
        render();
      }

      if (prev) prev.addEventListener('click', function () { go(index - 1); });
      if (next) next.addEventListener('click', function () { go(index + 1); });

      // El usuario también puede swipear: mantener el contador sincronizado.
      var raf;
      viewport.addEventListener('scroll', function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          var mid = viewport.scrollLeft + viewport.clientWidth / 2;
          var closest = 0;
          var best = Infinity;
          slides.forEach(function (s, i) {
            var d = Math.abs(s.offsetLeft - viewport.offsetLeft + s.clientWidth / 2 - mid);
            if (d < best) { best = d; closest = i; }
          });
          index = closest;
          render();
        });
      }, { passive: true });

      render();
    });
  }

  /* --- Favoritos: el color sube, el contenido no se mueve --------------- */
  function initFavoritos() {
    document.querySelectorAll('[data-favs]').forEach(function (root) {
      var panels = Array.prototype.slice.call(root.querySelectorAll('[data-fav]'));
      if (panels.length < 2) return;

      // Recién acá pasamos a capas superpuestas. Si este JS no corre, el CSS
      // deja los paneles como secciones normales y la sección se lee igual.
      root.setAttribute('data-enhanced', 'true');

      // Ritmo en "pantallas" de scroll. Tiene que coincidir con el alto que
      // calcula el CSS, o el último panel se corta antes de tiempo.
      var cs = getComputedStyle(root);
      var hold = parseFloat(cs.getPropertyValue('--fav-hold')) || 0.6;
      var trans = parseFloat(cs.getPropertyValue('--fav-trans')) || 0.8;
      var n = panels.length;

      // La línea de tiempo alterna pausa y cambio:
      //   [pausa 01][sube 02][pausa 02][sube 03][pausa 03]
      // Sin las pausas el color arranca a subir apenas te movés, y el último
      // panel nunca llega a verse solo.
      var total = n * hold + (n - 1) * trans;

      function render() {
        var rect = root.getBoundingClientRect();
        var travel = rect.height - window.innerHeight;
        var p = travel > 0 ? -rect.top / travel : 0;
        p = Math.max(0, Math.min(1, p));

        var u = p * total;

        panels.forEach(function (panel, i) {
          if (i === 0) {
            panel.style.setProperty('--fav-reveal', '0%');
            return;
          }
          // El panel i empieza a subir recién después de que el anterior
          // cumplió su pausa.
          var start = i * hold + (i - 1) * trans;
          var local = Math.max(0, Math.min(1, (u - start) / trans));
          panel.style.setProperty('--fav-reveal', (1 - local) * 100 + '%');
        });
      }

      var ticking = false;
      function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          render();
          ticking = false;
        });
      }

      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      render();
    });
  }

  /* El statement ya no se congela: acá vivía initStatementPin(), que lo pineaba
     para que su borde de abajo frenara en el mismo punto que el panel naranja.
     Se fue con el pin del panel — ver el comentario de .fpanel__box en
     base.css. Sin el panel congelado, congelar el statement solo hacía que le
     recortara el titular al panel. */

  /* --- Popup de newsletter --------------------------------------------- */
  function initPopup() {
    var el = document.querySelector('[data-popup]');
    if (!el) return;

    var key = 'bungot:popup-dismissed';
    var dismissed = false;
    try {
      dismissed = localStorage.getItem(key) === '1';
    } catch (e) {
      /* no-op */
    }
    if (dismissed) return;

    var delay = parseInt(el.getAttribute('data-delay'), 10) || 8000;

    var timer = setTimeout(function () {
      el.setAttribute('data-open', 'true');
    }, delay);

    function close() {
      clearTimeout(timer);
      el.setAttribute('data-open', 'false');
      try {
        localStorage.setItem(key, '1');
      } catch (e) {
        /* no-op */
      }
    }

    var btn = el.querySelector('[data-popup-close]');
    if (btn) btn.addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && el.getAttribute('data-open') === 'true') close();
    });
  }

  /* --- Portada: alto de la primera pantalla y escala de la manada -------- */
  /* Dos medidas que el CSS no puede calcular solo:

     --top-h: lo que hay encima del hero (marquee + header). No se puede clavar
     en CSS porque el marquee crece con la fuente. Se mide como la distancia del
     hero al techo del documento, que es exactamente eso.

     --pup-scale: el artboard del diseño es de 1440 x ~1085, o sea un hero de
     unos 985px de alto. En una ventana más baja (un portátil de 900 deja ~820)
     las mascotas a tamaño de diseño se comen el titular. Se achica la fila
     entera por el mismo factor, que es la manera que el README del handoff
     autoriza a reescalar. Tope en 1: este factor nunca AGRANDA respecto al
     diseño; para eso está --pack-boost, que se elige en el customizer. */
  var HERO_ARTBOARD = 985;
  // Lo que la barra de "Favoritos" sube sobre el hero (--hero-seam en el CSS):
  // el hero se estira otro tanto para dejarla fuera de la primera pantalla.
  var HERO_SEAM = 38;
  // Ancho de la fila de mascotas a tamaño de diseño (suma de anchos y traslapes
  // de la tabla del handoff). Sirve para no dejar que se salga de la pantalla.
  var PACK_WIDTH = 1312;

  function initPortadaTop() {
    var portada = document.querySelector('.hero');
    if (!portada) return;
    // El header, para saber cuánto bordó estirar detrás de la barra sin tapar el
    // marquee de arriba (ver .hero::before). Puede no existir si se borró.
    var header = document.querySelector('.header');

    function measure() {
      var top = portada.getBoundingClientRect().top + window.scrollY;
      document.documentElement.style.setProperty('--top-h', Math.round(top) + 'px');
      if (header) {
        document.documentElement.style.setProperty('--nav-h', header.offsetHeight + 'px');
      }

      var cs = getComputedStyle(portada);
      // El customizer elige cuánto agrandar la manada; acá se descuenta para
      // que el tope de ancho aplique sobre el tamaño FINAL, no sobre el previo.
      var boost = parseFloat(cs.getPropertyValue('--pack-boost')) || 1;

      // El alto que tiene el hero para repartir se lee del CSS ya resuelto a px,
      // en vez de rehacer la cuenta acá y desincronizarla.
      // Desde que la portada es de alto FIJO (910px) su min-height quedó en 0,
      // así que se cae a la altura de verdad. El orden importa: si algún día
      // vuelve un min-height, sigue mandando ese como antes.
      var libre = parseFloat(cs.minHeight);
      if (!(libre > 0)) libre = parseFloat(cs.height);
      // En celu el min-height es 0 y el hero crece con su contenido; ahí la
      // escala no se usa igual (--pup-k queda en 1), pero no debe dar 0.
      if (!(libre > 0)) libre = window.innerHeight - top + HERO_SEAM;
      var escala = Math.min(
        1,                                                    // nunca más que el diseño
        libre / HERO_ARTBOARD,                                // que quepa a lo alto
        (window.innerWidth * 0.98) / (PACK_WIDTH * boost)     // y a lo ancho: si no,
      );                                                      // se cortan las caras
      document.documentElement.style.setProperty('--pup-scale', escala.toFixed(3));
    }

    measure();
    window.addEventListener('resize', measure);
    // Fredoka cambia el alto del marquee cuando entra: hay que volver a medir.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  }

  /* --- Portada: la manada se agacha detrás de la barra ------------------- */
  /* Del handoff de diseño (hero-pups.js): cuando el borde superior de la fila
     cruza cierta altura del viewport, las mascotas bajan y vuelven al subir.
     Cuanto MÁS CHICO el umbral, más tarde se agachan: la fila tiene que trepar
     más antes de cruzarlo. El diseño traía 45%; el valor sale del customizer.
     Solo se anima el transform del contenedor interno: la altura de la fila
     NUNCA cambia, para que la sección de arriba no se mueva. */
  function initPortadaPups() {
    var row = document.querySelector('[data-pup-row]');
    var inner = document.querySelector('[data-pup-inner]');
    if (!row || !inner || reduceMotion) return;

    var umbral = parseFloat(row.getAttribute('data-duck-at'));
    if (!(umbral > 0)) umbral = 45;

    var hidden = false;
    function render() {
      var next = row.getBoundingClientRect().top < window.innerHeight * (umbral / 100);
      if (next === hidden) return;
      hidden = next;
      if (hidden) inner.setAttribute('data-hidden', '');
      else inner.removeAttribute('data-hidden');
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        render();
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    render();
  }

  /* --- El footer empuja al nav fuera de la pantalla --------------------- */
  /* Cuando el footer sube, la barra sticky no se queda flotando encima: se va
     hacia arriba hasta salir del viewport, como si el footer la empujara. El
     empuje se publica en --nav-push (px) y el CSS se lo resta al `top` de la
     sticky del header (ver .shopify-section:has(> .header) en base.css).
     El recorrido total es el alto de la barra + su hueco de arriba
     (--nav-gap): con eso el borde de abajo del nav queda justo en el borde de
     la pantalla y no asoma nada.
     EMPUJE DE CONTACTO: no se mueve mientras el footer sube por la pantalla;
     arranca recién cuando el borde de arriba del footer está CASI tocando el
     borde de abajo del nav (a COLCHON px) y de ahí va 1:1 con el scroll, así
     que ese colchón se mantiene igual todo el empujón — el footer nunca le
     pasa por encima, la va corriendo.
     Vale para todas las páginas: el footer y el header salen de los grupos de
     sección del layout, así que están en cualquier plantilla. En lo alto de la
     página el nav no puede quedar escondido aunque el footer esté cerca: una
     sticky nunca se adelanta a su posición natural, el top negativo solo la
     frena cuando ya iba a subir.
     Se mide con el rect del FOOTER, que nunca lleva transform, así que su
     posición es de layout puro: inmune a cadenas de offsetParent, a sticky y a
     que crezca contenido más arriba. */
  function initFooterPushesNav() {
    var footer = document.querySelector('.footer');
    var header = document.querySelector('.header');
    if (!footer || !header) return;

    // Aire que queda entre el footer y la base del nav durante el empujón: es
    // también lo que se adelanta al contacto real ("casi tocando").
    var COLCHON = 18;
    var root = document.documentElement;
    var recorrido = 0;
    var last = -1;

    // El alto de la barra y el hueco solo cambian al redimensionar (o cuando
    // entra Fredoka), no en cada frame de scroll: se miden aparte.
    function measure() {
      var gap = parseFloat(getComputedStyle(root).getPropertyValue('--nav-gap')) || 0;
      recorrido = header.offsetHeight + gap;
      last = -1;
    }

    function render() {
      // El hot-reload de `shopify theme dev` re-renderiza secciones y deja las
      // referencias viejas huérfanas: si pasó, se vuelven a buscar.
      if (!document.body.contains(footer) || !document.body.contains(header)) {
        footer = document.querySelector('.footer');
        header = document.querySelector('.header');
        if (!footer || !header) return;
        measure();
      }

      // Lo que el footer ya se metió pasando la línea de contacto: 0 mientras
      // todavía viene lejos, y todo el recorrido cuando la barra ya salió.
      var push = recorrido + COLCHON - footer.getBoundingClientRect().top;
      if (push < 0) push = 0;
      if (push > recorrido) push = recorrido;
      push = Math.round(push);
      if (push === last) return;
      last = push;
      root.style.setProperty('--nav-push', push + 'px');
    }

    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        ticking = false;
        render();
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () {
      measure();
      onScroll();
    });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        measure();
        render();
      });
    }

    measure();
    render();
  }

  /* --- Reviews con pin: el titular se frena y los globos suben --------- */
  function initReviews() {
    document.querySelectorAll('[data-reviews]').forEach(function (root) {
      var items = Array.prototype.slice.call(root.querySelectorAll('[data-review]'));
      if (!items.length) return;

      // Reduce motion: sin pin ni subida. Se listan estáticos debajo del titular.
      if (reduceMotion) {
        root.setAttribute('data-static', '');
        return;
      }

      var N = items.length;
      var START = 72;              // vh por debajo del centro donde arranca el 1º
      var GAP = 42;                // vh entre un review y el siguiente
      var END = 78;                // vh por encima del centro donde sale el último
      var total = START + (N - 1) * GAP + END;

      function render() {
        var rect = root.getBoundingClientRect();
        var travel = rect.height - window.innerHeight;
        var p = travel > 0 ? (-rect.top) / travel : 0;
        if (p < 0) p = 0; else if (p > 1) p = 1;

        for (var i = 0; i < N; i++) {
          // Cinta vertical: todos bajan-a-subir juntos, separados por GAP.
          var y = START + i * GAP - p * total;   // vh respecto del centro (+ = abajo)
          items[i].style.setProperty('--y', y.toFixed(2) + 'vh');
        }
      }

      var ticking = false;
      function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(function () { render(); ticking = false; });
      }
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      render();
    });
  }

  /* --- Contacto: pastillas de asunto + habilitar el envío --------------- */
  function initContacto() {
    var root = document.querySelector('[data-contacto]');
    if (!root) return;

    // Pastillas de opción única: son botones (foco y teclado gratis) y el
    // valor elegido viaja como un campo más del correo en el hidden.
    var pills = root.querySelectorAll('[data-ct-pill]');
    var asunto = root.querySelector('[data-ct-asunto]');
    for (var i = 0; i < pills.length; i++) {
      pills[i].addEventListener('click', function () {
        for (var j = 0; j < pills.length; j++) {
          pills[j].setAttribute('aria-pressed', pills[j] === this ? 'true' : 'false');
        }
        if (asunto) asunto.value = this.textContent.trim();
      });
    }

    // El botón solo se habilita con nombre, correo y mensaje llenos. Sin JS
    // queda habilitado y valida el required nativo, así que no se pierde nada.
    var boton = root.querySelector('[data-ct-enviar]');
    var nombre = root.querySelector('#ct-nombre');
    var correo = root.querySelector('#ct-correo');
    var mensaje = root.querySelector('#ct-mensaje');
    if (!boton || !nombre || !correo || !mensaje) return;

    var campos = [nombre, correo, mensaje];
    function revisa() {
      var listo = true;
      for (var k = 0; k < campos.length; k++) {
        if (campos[k].value.trim() === '') listo = false;
      }
      boton.disabled = !listo;
    }
    for (var m = 0; m < campos.length; m++) {
      campos[m].addEventListener('input', revisa);
    }
    revisa();
  }

  function init() {
    initPreloader();
    initPortadaTop();
    initPortadaPups();
    initPerroNav();
    initNav();
    initFilters();
    initCarousels();
    initFavoritos();
    initPopup();
    initReviews();
    initContacto();
    initFooterPushesNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
