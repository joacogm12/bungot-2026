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
     (CTA de la PDP y venta cruzada) y productos.js (tarjetas del catálogo).

     opts.cantidad → cuánto sumarle al contador si nadie confirma el total.
     opts.color    → el de la bolita; sin él, el coral de la pestaña
                     (--nav-coral). La PDP manda su naranja propio.

     Devuelve { ponTotal(n), falla() }: ponTotal lo llama el caller con el
     item_count real de /cart.js y ese número le gana a la suma a ciegas — si
     la bolita ya aterrizó corrige al momento, si no queda listo para el
     aterrizaje. Así la cifra cambia justo cuando llega la bolita, con el
     valor del backend si el fetch fue más rápido que el vuelo.

     falla() es para cuando Shopify RECHAZA el agregado (422: agotado, plan
     que falta, variante que ya no existe): la bolita se esfuma sin aterrizar,
     el contador no sube y el botón dice data-label-failed un momento en vez
     de "¡Listo!". Antes el vuelo festejaba igual y el carrito llegaba vacío. */
  function flyToCart(btn, opts) {
    opts = opts || {};
    var cantidad = opts.cantidad || 1;
    var total = null;      // item_count real, si el caller lo confirma
    var aterrizado = false;
    var fallido = false;
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
      if (fallido) return; // rechazado: nada que sumar ni que festejar
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
        if (fallido) return; // el rótulo de error ya está puesto, no pisarlo
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
      },
      falla: function () {
        fallido = true;
        // Si aterrizó antes de que contestara Shopify ya sumó de más: deshacer.
        if (aterrizado) {
          contadores().forEach(function (el) {
            el.textContent = Math.max(0, (parseInt(el.textContent, 10) || 0) - cantidad);
          });
        }
        aterriza();
        var textoError = btn && btn.getAttribute('data-label-failed');
        if (textoError) btn.textContent = textoError;
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

  /* --- Favoritos: cada foto sube como cortina sobre la anterior --------- */
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
      // Sin las pausas la foto siguiente arranca a subir apenas te mueves, y el último
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

  /* --- Stickers que se despegan (.bg-sticker) --------------------------- */
  /* Monta el despegado SOLO si el navegador soporta scroll-driven animations
     (animation-timeline: view()) y no hay reduce motion. Si no, no se monta
     nada: el estado base del CSS ya es el final (sticker entero, sin lámina
     gris). Nunca `animation … both` sin timeline: saltaría al estado final de
     golpe. Por eso timeline y rango se escriben DESPUÉS del shorthand
     `animation`, que los resetea.

     data-peel = print | flap (parcial: queda la esquinita de --st-peel) o
     print-full | flap-full (completo: el papel se va del todo). El rango de
     la parcial lo mandan --st-peel-from / --st-peel-to (el customizer del
     statement, 55% / 10% por defecto); la completa arranca al 25% de la
     entrada y termina al 45% de `contain`. Ver .bg-sticker en base.css. */
  function initPeelStickers() {
    var els = document.querySelectorAll('[data-peel]');
    if (!els.length) return;
    var ok = window.CSS && CSS.supports && CSS.supports('animation-timeline', 'view()');
    if (!ok || reduceMotion) return;
    els.forEach(function (el) {
      var kind = el.getAttribute('data-peel');          // print | flap | print-full | flap-full
      var full = kind.slice(-5) === '-full';
      el.style.animation = 'peel-' + kind + ' linear both';
      el.style.setProperty('animation-timeline', 'view()');
      el.style.setProperty(
        'animation-range',
        full ? 'entry 25% contain 45%' : 'entry var(--st-peel-from, 55%) contain var(--st-peel-to, 10%)'
      );
    });
  }

  /* --- Conócenos (bonche): el montón se abre y revela el texto ---------- */
  /* SIN PIN: la sección mide 100svh y baja en flujo. Mientras entra al
     viewport, el avance p (0 = su borde superior asoma por abajo, 1 = ya pasó
     entera) mueve UNA variable --s (0 montón, 1 abiertas) con ease-out
     cuadrático, completa al 52% del recorrido; --st revela el texto del
     centro, mapeada del 45% al 75% del avance SIN easing. Las dos se escriben
     en el WRAPPER [data-pile] (texto y fotos las heredan de ahí) — nunca una
     por elemento. El CSS interpola la posición de cada foto con --s. Ver
     .bonche en base.css. */
  function initBonche() {
    document.querySelectorAll('[data-bonche]').forEach(function (root) {
      var pile = root.querySelector('[data-pile]');
      if (!pile) return;

      // Modo acomodar (checkbox de la sección o ?acomodar en la URL):
      // herramienta de maqueta, no UI de la tienda. Dispersión clavada al
      // 100% y fotos arrastrables; el HUD lista los fx/fy para copiarlos.
      var acomodar = root.hasAttribute('data-acomodar-on') || /[?&]acomodar/.test(window.location.search);
      if (acomodar) {
        setupBoncheAcomodar(root, pile);
        return;
      }

      // Reduce motion: nada anima. Fotos ya dispersas y texto visible de una
      // (--s: 1 / --st: 1 son también el defecto del CSS, por si no hay JS).
      if (reduceMotion) {
        pile.style.setProperty('--s', '1');
        pile.style.setProperty('--st', '1');
        return;
      }

      var SPAN = 0.52;             // la dispersión completa al 52% del recorrido
      // "Dispersión" del customizer: multiplica el avance FINAL de la
      // apertura (0.5 = a medio camino, 1.6 = empujadas hacia los bordes).
      var DISP = parseFloat(root.dataset.dispersion) || 1;

      function clamp01(v) { return Math.max(0, Math.min(1, v)); }

      function render() {
        var rect = root.getBoundingClientRect();
        var vh = window.innerHeight;
        // 0 = borde superior entrando por abajo, 1 = la sección ya pasó entera.
        var p = (vh - rect.top) / (vh + rect.height);
        var s = clamp01(p / SPAN);
        var e = 1 - Math.pow(1 - s, 2);                 // ease-out cuadrático

        // --s lleva el multiplicador de dispersión; --st se mapea del avance
        // lineal, para que el texto entre igual aunque la apertura sea corta
        // o pasada.
        pile.style.setProperty('--s', (e * DISP).toFixed(4));
        pile.style.setProperty('--st', clamp01((s - 0.45) / 0.3).toFixed(4));
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

  /* Arma el modo acomodar del bonche: cada foto se arrastra (pointer events)
     y su delta en px se convierte a la fracción --fx/--fy que usa el CSS
     (medio viewport menos medio ancho/alto de la tarjeta menos 24px). El HUD
     también trae la escala global --z en vivo. Textos hardcodeados a
     propósito: es una herramienta de desarrollo, no UI de la tienda. */
  function setupBoncheAcomodar(root, pile) {
    root.setAttribute('data-acomodar', '');
    pile.style.setProperty('--s', '1');
    pile.style.setProperty('--st', '1');

    var cards = Array.prototype.slice.call(pile.querySelectorAll('[data-bonche-card]'));
    var hud = document.createElement('div');
    hud.className = 'bonche-hud';

    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0.7';
    slider.max = '1.5';
    slider.step = '0.05';
    slider.value = getComputedStyle(root).getPropertyValue('--z').trim() || '1';

    var pre = document.createElement('div');

    function values() {
      return cards.map(function (card, i) {
        var fx = parseFloat(getComputedStyle(card).getPropertyValue('--fx')) || 0;
        var fy = parseFloat(getComputedStyle(card).getPropertyValue('--fy')) || 0;
        return 'foto ' + (i + 1) + ':  fx ' + fx.toFixed(2) + '   fy ' + fy.toFixed(2);
      });
    }

    function readout() {
      pre.textContent =
        'MODO ACOMODAR — arrastra cada foto\n' +
        'y pasa los valores a su bloque:\n\n' +
        values().join('\n') +
        '\n\nescala global (setting "escala"): ' +
        Math.round(parseFloat(slider.value) * 100) + '%';
    }

    slider.addEventListener('input', function () {
      root.style.setProperty('--z', slider.value);
      readout();
    });

    var copiar = document.createElement('button');
    copiar.type = 'button';
    copiar.textContent = 'Copiar valores';
    copiar.addEventListener('click', function () {
      var texto = values().join('\n') + '\nescala: ' + Math.round(parseFloat(slider.value) * 100) + '%';
      navigator.clipboard.writeText(texto).then(
        function () { copiar.textContent = 'Copiado ✓'; },
        function () { copiar.textContent = 'No se pudo copiar'; }
      );
      setTimeout(function () { copiar.textContent = 'Copiar valores'; }, 1600);
    });

    cards.forEach(function (card) {
      card.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        card.setPointerCapture(e.pointerId);
        // La tarjeta arrastrada sube por encima de todo y al soltar recupera
        // su z-index original (el --i del CSS).
        var zAntes = card.style.zIndex;
        card.style.zIndex = '999';
        var startX = e.clientX;
        var startY = e.clientY;
        var fx0 = parseFloat(getComputedStyle(card).getPropertyValue('--fx')) || 0;
        var fy0 = parseFloat(getComputedStyle(card).getPropertyValue('--fy')) || 0;
        // El espacio libre usa el MISMO rango que el calc() del CSS: medio
        // viewport menos medio ancho/alto del tamaño final (escala 0.9)
        // menos 24px. Así el arrastre va 1:1 con el cursor.
        var freeX = window.innerWidth / 2 - (card.offsetWidth * 0.9) / 2 - 24;
        var freeY = window.innerHeight / 2 - (card.offsetHeight * 0.9) / 2 - 24;

        function move(ev) {
          // Se permite pasarse un poco del borde (±1.25): a veces la compo
          // pide una foto medio recortada.
          var fx = Math.max(-1.25, Math.min(1.25, fx0 + (ev.clientX - startX) / freeX));
          var fy = Math.max(-1.25, Math.min(1.25, fy0 + (ev.clientY - startY) / freeY));
          card.style.setProperty('--fx', fx.toFixed(2));
          card.style.setProperty('--fy', fy.toFixed(2));
          readout();
        }
        function up() {
          card.style.zIndex = zAntes;
          card.removeEventListener('pointermove', move);
          card.removeEventListener('pointerup', up);
          card.removeEventListener('pointercancel', up);
        }
        card.addEventListener('pointermove', move);
        card.addEventListener('pointerup', up);
        card.addEventListener('pointercancel', up);
      });
    });

    hud.appendChild(pre);
    hud.appendChild(slider);
    hud.appendChild(copiar);
    document.body.appendChild(hud);
    readout();
  }

  function init() {
    initPreloader();
    initHeroPerro();
    initNav();
    initFavoritos();
    initPeelStickers();
    initBonche();
    initFooterPushesNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
