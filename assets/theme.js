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

  /* --- Vuelo al carrito -------------------------------------------------
     La confirmación de todo botón "Agregar", sin salir de la página: una
     bolita vuela del botón a la pastilla del carrito, el contador sube al
     aterrizar (no en el clic) y la pastilla rebota. Lo llaman producto.js
     (CTA de la PDP y venta cruzada), productos.js (tarjetas del catálogo)
     y los paneles de favoritos (initFavCart, acá abajo).

     opts.cantidad → cuánto sumarle al contador si nadie confirma el total.
     opts.color    → el de la bolita; sin él, el coral de la pestaña
                     (--nav-coral). La PDP manda su naranja propio.

     Devuelve { ponTotal(n) }: el caller lo llama con el item_count real de
     /cart.js y ese número le gana a la suma a ciegas — si la bolita ya
     aterrizó corrige al momento, si no queda listo para el aterrizaje. Así
     la cifra cambia justo cuando llega la bolita, con el valor del backend
     si el fetch fue más rápido que el vuelo. */
  function flyToCart(btn, opts) {
    opts = opts || {};
    var cantidad = opts.cantidad || 1;
    var total = null;      // item_count real, si el caller lo confirma
    var aterrizado = false;
    var bola = null;

    var pastilla = pastillaCarrito();
    // Sin pastilla a la vista (celu con el burger cerrado, o el footer ya
    // empujó la barra) no hay a dónde volar; y con reduced-motion no se
    // vuela ni se rebota: el contador salta al valor nuevo y listo. La
    // compra nunca depende de la animación.
    var vuela = !!(btn && pastilla && !reduceMotion && document.body.animate);

    function contadores() {
      return document.querySelectorAll('[data-cart-count]');
    }

    function subeContador() {
      contadores().forEach(function (el) {
        el.textContent = total !== null ? total : (parseInt(el.textContent, 10) || 0) + cantidad;
      });
    }

    function rebota() {
      if (!pastilla || reduceMotion) return;
      // Reinicio a mano por si viene de un rebote a medias: apagarla,
      // forzar el reflow leyendo offsetWidth y volverla a asignar.
      pastilla.style.animation = 'none';
      void pastilla.offsetWidth;
      pastilla.style.animation = 'cart-pop .42s cubic-bezier(0.34, 1.56, 0.64, 1)';
    }

    // TODO el cierre del ciclo vive acá y es idempotente: quitar la bolita,
    // subir el contador, rebotar la pastilla. Corre una sola vez.
    function aterriza() {
      if (aterrizado) return;
      aterrizado = true;
      if (bola) bola.remove();
      subeContador();
      rebota();
    }

    // Confirmación en el botón. data-ocupado evita que dos clics seguidos
    // pisen el texto guardado (el segundo restauraría "¡Listo!" en vez del
    // rótulo real); la bolita, en cambio, sí sale en cada clic.
    if (btn && !btn.hasAttribute('data-ocupado')) {
      btn.setAttribute('data-ocupado', '');
      var textoConfirmacion = btn.getAttribute('data-label-added');
      var textoOriginal = btn.textContent;
      var fondoOriginal = btn.style.background;
      setTimeout(function () {
        if (textoConfirmacion) btn.textContent = textoConfirmacion;
        btn.style.background = '#EA4A27'; // el coral de la pestaña (--nav-coral)
      }, vuela ? 380 : 0);
      setTimeout(function () {
        btn.textContent = textoOriginal;
        btn.style.background = fondoOriginal;
        btn.removeAttribute('data-ocupado');
      }, 1800);
    }

    if (vuela) {
      var rb = btn.getBoundingClientRect();
      var rp = pastilla.getBoundingClientRect();
      var dx = (rp.left + rp.width / 2) - (rb.left + rb.width / 2);
      var dy = (rp.top + rp.height / 2) - (rb.top + rb.height / 2);

      bola = document.createElement('span');
      bola.className = 'bola-carrito';
      bola.style.background = opts.color || '#EA4A27';
      bola.style.left = (rb.left + rb.width / 2 - 9) + 'px';
      bola.style.top = (rb.top + rb.height / 2 - 9) + 'px';
      document.body.appendChild(bola);

      var vuelo = bola.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        // La panza de arriba a mitad de camino es lo que la hace sentir "lanzada".
        { transform: 'translate(' + dx / 2 + 'px, ' + (dy / 2 - 70) + 'px) scale(1.25)', offset: 0.55 },
        { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(0.35)', opacity: 0.9 }
      ], { duration: 620, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' });

      // El aterrizaje NO puede colgar solo del onfinish: con la pestaña del
      // navegador en segundo plano la WAAPI no corre nunca y la bolita se
      // quedaría pegada en el body con el contador sin subir (ya pasó). El
      // respaldo son los 620ms de vuelo más margen.
      vuelo.onfinish = aterriza;
      setTimeout(aterriza, 700);
    } else {
      aterriza();
    }

    return {
      ponTotal: function (n) {
        total = n;
        if (aterrizado) {
          contadores().forEach(function (el) { el.textContent = n; });
        }
      }
    };
  }

  // La pastilla del carrito que se VE: la de escritorio (.header__cart) o el
  // link del panel en celu. "Visible" = con caja y dentro del viewport, lo
  // que descarta la de escritorio en celu (display: none) y la del panel con
  // el burger cerrado (el panel vive corrido fuera de la pantalla).
  function pastillaCarrito() {
    var candidatas = document.querySelectorAll('.header__cart, .header__link--cart');
    for (var i = 0; i < candidatas.length; i++) {
      var r = candidatas[i].getBoundingClientRect();
      if (r.width > 0 && r.bottom > 0 && r.top < window.innerHeight &&
          r.right > 0 && r.left < window.innerWidth) {
        return candidatas[i];
      }
    }
    return null;
  }

  window.BUNGOT.flyToCart = flyToCart;

  /* --- Favoritos: "Agregar al carrito" sin salir de la página ------------ */
  /* El form de cada panel es un {% form 'product' %} que navegaría al
     carrito al enviarse; acá se intercepta: el agregado va por fetch y la
     confirmación es el vuelo de la bolita. El botón solo se bloquea
     mientras dura el fetch, nunca por la animación. */
  function initFavCart() {
    document.querySelectorAll('.fav__form').forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('.fav__btn');
        var vuelo = flyToCart(btn, { cantidad: 1 });
        if (btn) btn.disabled = true;
        fetch('/cart/add.js', {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        })
          .then(function () { return fetch('/cart.js', { headers: { Accept: 'application/json' } }); })
          .then(function (r) { return r.json(); })
          .then(function (cart) {
            vuelo.ponTotal(cart.item_count);
            if (btn) btn.disabled = false;
          })
          .catch(function () {
            // Sin backend el contador ya subió al aterrizar; solo soltar el botón.
            if (btn) btn.disabled = false;
          });
      });
    });
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

  /* --- Portada: las patas calcan la caja del perro ----------------------- */
  /* La figura del perro vive recortada en su ventana, pero las patas
     delanteras tienen que asomar por el borde de abajo del hero SOBRE la
     sección siguiente, así que van en una capa aparte (z-index 6) que no se
     recorta. Acá se le calca la caja del perro con geometría de MAQUETA
     (offsetLeft/offsetTop): nunca getBoundingClientRect(), porque el perro
     está respirando y balanceándose, así que su bounding box va inflada y
     ladeada y ese sesgo se copiaría a las patas. Con la caja calcada y la
     misma animación que el cuerpo (ver base.css), las patas quedan soldadas
     al pecho: su desplazamiento relativo es constante en todo el ciclo, como
     si estuvieran pintadas dentro del PNG del cuerpo. */
  function initHeroPerro() {
    if (!document.querySelector('[data-hero-patas]')) return;

    function place() {
      // Se re-buscan las referencias por si el hot-reload de `shopify theme
      // dev` re-renderizó la sección (mismo motivo que initFooterPushesNav).
      var hero = document.querySelector('.hero');
      var perro = hero && hero.querySelector('[data-hero-perro]');
      var patas = hero && hero.querySelector('[data-hero-patas]');
      if (!perro || !patas) return;

      var x = 0;
      var y = 0;
      var el = perro;
      while (el && el !== hero) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent;
      }
      patas.style.width = perro.offsetWidth + 'px';
      patas.style.height = perro.offsetHeight + 'px';
      patas.style.left = x + 'px';
      patas.style.top = y + 'px';
    }

    place();
    window.addEventListener('resize', place);
    // Anton entra tarde y puede recolocar el layout: se vuelve a medir.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
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

  function init() {
    initPreloader();
    initHeroPerro();
    initNav();
    initFavoritos();
    initFavCart();
    initReviews();
    initFooterPushesNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
