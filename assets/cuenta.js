/* ==========================================================================
   BUNGOT 2026 — cuenta.js
   Todo el flujo de cuenta: la ventana de entrar (1a, dos enlaces al acceso de
   Shopify — sin formularios ni validación desde el handoff 8), la ficha del
   perro (en su página y en crear-cuenta), Mis pedidos (2a, con detalle y
   "Repetir") y Mis direcciones (2c).

   Mismo patrón que theme.js: cada bloque se auto-inicializa solo si su markup
   está presente, así cualquier pantalla se puede quitar sin romper el resto.

   Nada acá guarda la ficha por su cuenta: todo pasa por window.BUNGOT.perro
   (theme.js), el único lugar del tema que toca el almacenamiento.

   Lo carga el header en todas las páginas: la ventana de entrar cuelga del
   botón de cuenta, que está en todas.
   ========================================================================== */
(function () {
  'use strict';

  var store = window.BUNGOT && window.BUNGOT.perro;

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // "2021-03-14" -> "14 de marzo". Se parte el string a mano: new Date() con
  // solo fecha la interpreta en UTC y en México la corre un día para atrás.
  function fechaBonita(iso) {
    var p = (iso || '').split('-');
    if (p.length !== 3) return '';
    var mes = MESES[parseInt(p[1], 10) - 1];
    if (!mes) return '';
    return parseInt(p[2], 10) + ' de ' + mes;
  }

  /* --- La ventana de entrar (1a) ---------------------------------------- */
  function initLoginModal() {
    var modal = document.querySelector('[data-login-modal]');
    if (!modal) return;

    var box = modal.querySelector('.clog__box');
    var opener = null;

    function abrir(desde) {
      opener = desde || null;
      modal.setAttribute('data-open', 'true');
      modal.removeAttribute('aria-hidden');
      // El velo y el desenfoque del fondo los pinta el CSS con este atributo.
      // OJO: se llama distinto que el disparador [data-login-open] de los
      // botones A PROPÓSITO — si el body llevara ese mismo atributo, el clic
      // que abre seguiría burbujeando hasta el delegado de abajo, el body
      // "matchearía" como abridor y pisaría al opener real (pasó).
      document.body.setAttribute('data-login-abierta', '');
      // Sin campos que llenar, el foco aterriza en el primer CTA.
      var primero = modal.querySelector('.clog__cta');
      if (primero) primero.focus();
    }

    function cerrar() {
      modal.setAttribute('data-open', 'false');
      modal.setAttribute('aria-hidden', 'true');
      document.body.removeAttribute('data-login-abierta');
      // El foco vuelve a quien abrió: sin esto el teclado se queda perdido.
      if (opener && opener.focus) opener.focus();
      opener = null;
    }

    function abierta() {
      return modal.getAttribute('data-open') === 'true';
    }

    // Cualquier [data-login-open] de cualquier página abre la ventana:
    // "Entra aquí" del registro, el "Entrar" de pedidos/direcciones sin
    // sesión, el renglón del menú...
    document.addEventListener('click', function (e) {
      var abridor = e.target.closest('[data-login-open]');
      if (abridor) {
        e.preventDefault();
        abrir(abridor);
        return;
      }
      if (e.target.closest('[data-login-close]')) cerrar();
    });

    document.addEventListener('keydown', function (e) {
      if (!abierta()) return;

      if (e.key === 'Escape') {
        cerrar();
        return;
      }

      // Trampa de foco: Tab circula dentro de la caja, no se escapa a la
      // tienda desenfocada de atrás.
      if (e.key === 'Tab' && box) {
        var focos = box.querySelectorAll('a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])');
        if (!focos.length) return;
        var primero = focos[0];
        var ultimo = focos[focos.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    });

    // El paso previo al checkout: si no hay sesión, la ventana se ofrece UNA
    // vez y no más. Cerrarla y volver a picar sigue al checkout normal —
    // entrar nunca puede bloquear la compra.
    var me = document.querySelector('[data-me]');
    var logueado = me && me.getAttribute('data-logged') === 'true';
    if (!logueado) {
      var yaOfrecida = false;
      try {
        yaOfrecida = sessionStorage.getItem('bungot:login-checkout') === '1';
      } catch (err) { /* no-op */ }

      if (!yaOfrecida) {
        document.addEventListener('click', function (e) {
          var btn = e.target.closest('button[name="checkout"], input[name="checkout"]');
          if (!btn || abierta()) return;
          var visto = false;
          try {
            visto = sessionStorage.getItem('bungot:login-checkout') === '1';
          } catch (err) { /* no-op */ }
          if (visto) return;
          e.preventDefault();
          try {
            sessionStorage.setItem('bungot:login-checkout', '1');
          } catch (err) { /* no-op */ }
          // Entrar desde aquí sigue DIRECTO al pago, sin pantalla intermedia:
          // el retorno del enlace deja de ser la página actual y pasa a ser
          // el checkout.
          var entrar = modal.querySelector('[data-login-entrar]');
          if (entrar) {
            var base = entrar.getAttribute('href').split('?')[0];
            entrar.setAttribute('href', base + '?return_url=%2Fcheckout');
          }
          abrir(btn);
        });
      }
    }

    // Se expone por si otra pieza del tema necesita abrir la ventana sin
    // pasar por un [data-login-open].
    window.BUNGOT = window.BUNGOT || {};
    window.BUNGOT.abrirLogin = abrir;
  }

  /* --- La ficha del perro pintada en menú y barra lateral ---------------- */
  function initDatosPerro() {
    if (!store) return;

    function pintar(f) {
      // "Ramona · mediana · cumple 14 de marzo" — solo las partes que existen.
      var lineas = document.querySelectorAll('[data-dog-line]');
      var i;
      for (i = 0; i < lineas.length; i++) {
        var el = lineas[i];
        var partes = [];
        if (f.nombre) partes.push(f.nombre);
        if (f.tamano) partes.push(f.tamano);
        // El cumpleaños solo va donde cabe (el menú); en la barra lateral el
        // renglón es corto, como en el diseño.
        if (f.cumple && el.hasAttribute('data-cumple')) {
          var bonita = fechaBonita(f.cumple);
          if (bonita) partes.push('cumple ' + bonita);
        }
        el.textContent = partes.join(' · ');
        el.hidden = partes.length === 0;
      }

      // "La ficha de Ramona": la frase viene traducida con hueco desde Liquid.
      var links = document.querySelectorAll('[data-dog-link]');
      for (i = 0; i < links.length; i++) {
        var tpl = links[i].getAttribute('data-tpl');
        if (f.nombre && tpl) {
          links[i].textContent = tpl.replace('__NOMBRE__', f.nombre);
        }
      }

      // La carita de la barra lateral (y cualquier otra fuera del selector,
      // que va con fixed y no trae el data-attribute). Mismo truco que el
      // header: se cambia solo el nombre del archivo DENTRO del src real que
      // pintó dog-avatar.liquid — acá no se arma ninguna ruta desde cero.
      // Sin cara elegida se regresa al default del snippet (Ramona).
      var cara = /^[a-z]+$/.test(f.avatar || '') ? f.avatar : 'ramona';
      var caras = document.querySelectorAll('img[data-dog-avatar]');
      for (i = 0; i < caras.length; i++) {
        caras[i].src = caras[i].src.replace(/bungot-face-[a-z]+\.png/, 'bungot-face-' + cara + '.png');
      }
    }

    pintar(store.read());
    document.addEventListener('bungot:perro', function (e) { pintar(e.detail); });
  }

  /* --- La ficha del perro: formulario (página propia y crear-cuenta) ----- */
  function initFichaPerro() {
    var root = document.querySelector('[data-ficha-perro]');
    if (!root || !store) return;

    var form = root.tagName === 'FORM' ? root : root.querySelector('form');
    if (!form) return;

    // A dónde ir después de guardar: crear-cuenta manda de vuelta a la cuenta
    // (data-redirect); la página propia de la ficha se queda y avisa.
    var irA = form.getAttribute('data-redirect');

    var campos = {
      nombre: root.querySelector('[data-campo="nombre"]'),
      tamano: root.querySelector('[data-campo="tamano"]'),
      cumple: root.querySelector('[data-campo="cumple"]')
    };
    var celdas = root.querySelectorAll('[data-avatar-option]');
    var valorAvatar = root.querySelector('[data-avatar-value]');
    var etiqueta = root.querySelector('[data-avatar-label]');
    var flash = root.querySelector('[data-flash]');
    var borrar = root.querySelector('[data-borrar]');
    var candadoCumple = root.querySelector('[data-cumple-lock]');

    // El cumpleaños se escribe UNA vez: con esa fecha va el regalo del
    // cumpleaños, así que ya guardado se bloquea (pedido del cliente; para
    // corregirlo, escriben y se cambia desde el admin). El candado de verdad
    // lo aplica el worker del lado del servidor — esto es solo la ventana.
    function bloquearCumple() {
      if (!campos.cumple) return;
      campos.cumple.disabled = true;
      if (candadoCumple) candadoCumple.hidden = false;
    }

    var etiquetaBase = etiqueta ? etiqueta.getAttribute('data-base') : '';
    var sinNombre = etiqueta ? etiqueta.getAttribute('data-fallback') : '';

    function refrescarEtiqueta() {
      if (!etiqueta) return;
      var escrito = campos.nombre && campos.nombre.value.trim();
      var elegida = root.querySelector('[data-avatar-option][aria-checked="true"]');
      var nombre = escrito || (elegida && elegida.getAttribute('data-avatar-name')) || sinNombre;
      etiqueta.textContent = etiquetaBase + ' — ' + nombre;
    }

    function marcar(id) {
      for (var i = 0; i < celdas.length; i++) {
        var cel = celdas[i];
        cel.setAttribute('aria-checked', String(cel.getAttribute('data-avatar-option') === id));
      }
      if (valorAvatar) valorAvatar.value = id || '';
      refrescarEtiqueta();
    }

    // Hidratar con lo guardado.
    var ficha = store.read();
    if (campos.nombre && ficha.nombre) campos.nombre.value = ficha.nombre;
    if (campos.tamano && ficha.tamano) campos.tamano.value = ficha.tamano;
    if (campos.cumple && ficha.cumple) {
      campos.cumple.value = ficha.cumple;
      bloquearCumple();
    }
    if (ficha.avatar) marcar(ficha.avatar);
    refrescarEtiqueta();

    for (var i = 0; i < celdas.length; i++) {
      celdas[i].addEventListener('click', function () {
        marcar(this.getAttribute('data-avatar-option'));
      });
    }

    // Flechas dentro del radiogroup, como espera un role="radio".
    root.addEventListener('keydown', function (e) {
      var activa = document.activeElement;
      if (!activa || !activa.hasAttribute || !activa.hasAttribute('data-avatar-option')) return;

      var paso = 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') paso = 1;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') paso = -1;
      if (!paso) return;

      e.preventDefault();
      var lista = Array.prototype.slice.call(celdas);
      var pos = lista.indexOf(activa);
      var siguiente = lista[(pos + paso + lista.length) % lista.length];
      siguiente.focus();
      marcar(siguiente.getAttribute('data-avatar-option'));
    });

    if (campos.nombre) campos.nombre.addEventListener('input', refrescarEtiqueta);

    function recolectar() {
      return {
        nombre: campos.nombre ? campos.nombre.value.trim() : '',
        tamano: campos.tamano ? campos.tamano.value : '',
        // Con el campo bloqueado manda lo GUARDADO, no lo que diga el input:
        // un value manipulado desde la consola no debe viajar.
        cumple: campos.cumple && !campos.cumple.disabled ? campos.cumple.value : (store.read().cumple || ''),
        avatar: valorAvatar ? valorAvatar.value : ''
      };
    }

    var temporizador = null;
    function avisar(texto) {
      if (!flash) return;
      flash.textContent = texto;
      flash.setAttribute('data-on', 'true');
      clearTimeout(temporizador);
      temporizador = setTimeout(function () {
        flash.setAttribute('data-on', 'false');
      }, 4000);
    }

    form.addEventListener('submit', function (e) {
      // No hay servidor al que mandar esto: el submit siempre se frena.
      e.preventDefault();
      var datos = recolectar();
      store.write(datos);
      // El primer guardado con fecha cierra el candado al momento, sin
      // esperar a recargar.
      if (datos.cumple) bloquearCumple();
      if (irA) {
        window.location.assign(irA);
        return;
      }
      avisar(form.getAttribute('data-msg-guardado'));
    });

    if (borrar) {
      borrar.addEventListener('click', function () {
        // Borrar la ficha respeta el cumpleaños: el regalo depende de esa
        // fecha, así que sobrevive al borrón (y el campo sigue bloqueado).
        var cumpleGuardado = store.read().cumple || '';
        store.clear();
        if (cumpleGuardado) store.write({ cumple: cumpleGuardado });
        if (campos.nombre) campos.nombre.value = '';
        if (campos.tamano) campos.tamano.value = '';
        if (campos.cumple && !campos.cumple.disabled) campos.cumple.value = '';
        marcar('');
        avisar(borrar.getAttribute('data-msg'));
      });
    }
  }

  /* --- Mis pedidos (2a): detalle y "Repetir" ----------------------------- */
  function initPedidos() {
    var root = document.querySelector('[data-pedidos]');
    if (!root) return;

    var toast = root.querySelector('[data-toast]');
    var toastMsg = toast && toast.querySelector('[data-toast-msg]');
    var toastLink = toast && toast.querySelector('[data-toast-link]');
    var toastTimer = null;

    // Un solo aviso: repetir dos veces reinicia los 4 segundos, no apila.
    function avisar(texto, conLink) {
      if (!toast) return;
      toastMsg.textContent = texto;
      toastLink.hidden = !conLink;
      toast.setAttribute('data-on', 'true');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () {
        toast.setAttribute('data-on', 'false');
      }, 4000);
    }

    function detalleAbierto() {
      return root.querySelector('.cdet[data-open="true"]');
    }

    function cerrarDetalle() {
      var d = detalleAbierto();
      if (!d) return;
      d.setAttribute('data-open', 'false');
      var abridor = root.querySelector('[data-detail-open="' + d.getAttribute('data-order-detail') + '"]');
      if (abridor) abridor.focus();
    }

    function repetir(btn) {
      var items;
      try {
        items = JSON.parse(btn.getAttribute('data-repeat')) || [];
      } catch (e) {
        items = [];
      }
      // El botón ya viene disabled desde Liquid si no queda nada disponible;
      // esto es el cinturón por si el atributo se corrompe.
      if (!items.length) {
        avisar(root.getAttribute('data-msg-empty'), false);
        return;
      }

      var lineasOriginales = parseInt(btn.getAttribute('data-lines'), 10) || items.length;
      btn.disabled = true;

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items })
      })
        .then(function (r) {
          if (!r.ok) throw new Error('add ' + r.status);
          // El contador real sale del carrito, no de sumar a ciegas.
          return fetch('/cart.js');
        })
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          var contador = document.querySelector('[data-cart-count]');
          if (contador) contador.textContent = cart.item_count;
          var msg = items.length < lineasOriginales
            ? root.getAttribute('data-msg-partial')
            : root.getAttribute('data-msg-done');
          avisar(msg, true);
        })
        .catch(function () {
          avisar(root.getAttribute('data-msg-error'), false);
        })
        .then(function () {
          btn.disabled = false;
        });
    }

    root.addEventListener('click', function (e) {
      var abrir = e.target.closest('[data-detail-open]');
      if (abrir) {
        var d = root.querySelector('[data-order-detail="' + abrir.getAttribute('data-detail-open') + '"]');
        if (d) {
          // Es un <a> con href de respaldo a la página del pedido: con JS se
          // frena la navegación y se abre el detalle acá mismo.
          e.preventDefault();
          d.setAttribute('data-open', 'true');
          var x = d.querySelector('.cdet__x');
          if (x) x.focus();
        }
        return;
      }

      if (e.target.closest('[data-detail-close]')) {
        cerrarDetalle();
        return;
      }

      var rep = e.target.closest('[data-repeat]');
      if (rep && !rep.disabled) {
        // El botón vive en un form real contra /cart/add (el respaldo sin
        // JS): acá se frena el envío y se agrega sin salir de la página.
        e.preventDefault();
        repetir(rep);
      }
    });

    document.addEventListener('keydown', function (e) {
      var d = detalleAbierto();
      if (!d) return;

      if (e.key === 'Escape') {
        cerrarDetalle();
        return;
      }

      // Trampa de foco: Tab circula dentro de la tarjeta del detalle, igual
      // que en la ventana de entrar. El velo queda fuera (tabindex -1).
      if (e.key === 'Tab') {
        var caja = d.querySelector('.cdet__box');
        if (!caja) return;
        var focos = caja.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focos.length) return;
        var primero = focos[0];
        var ultimo = focos[focos.length - 1];
        if (e.shiftKey && document.activeElement === primero) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primero.focus();
        }
      }
    });
  }

  /* --- Mis direcciones (2c) ---------------------------------------------- */
  function initDirecciones() {
    var root = document.querySelector('[data-direcciones]');
    if (!root) return;

    // Desplegar/cerrar los formularios en línea (editar y agregar).
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-adr-toggle]');
      if (t) {
        var form = document.getElementById(t.getAttribute('data-adr-toggle'));
        if (form) {
          var abierto = form.getAttribute('data-open') === 'true';
          form.setAttribute('data-open', String(!abierto));
          if (!abierto) {
            var primero = form.querySelector('input');
            if (primero) primero.focus();
          }
        }
        return;
      }

      var del = e.target.closest('[data-adr-delete]');
      if (del) borrarDireccion(del);
    });

    function borrarDireccion(btn) {
      if (!window.confirm(btn.getAttribute('data-confirm'))) return;

      var id = btn.getAttribute('data-adr-delete');
      var formBorrar = root.querySelector('[data-adr-delete-form="' + id + '"]');
      if (!formBorrar) return;

      // Shopify no deja borrar la predeterminada: primero se promueve otra
      // (el primer form de "hacer predeterminada" que haya) y luego se borra.
      if (btn.hasAttribute('data-default')) {
        var promover = root.querySelector('form[data-mk-default]');
        if (!promover) {
          formBorrar.submit();
          return;
        }
        btn.disabled = true;
        fetch(promover.action, {
          method: 'POST',
          credentials: 'same-origin',
          body: new FormData(promover)
        })
          .then(function () { formBorrar.submit(); })
          .catch(function () {
            btn.disabled = false;
            window.alert(btn.getAttribute('data-confirm'));
          });
        return;
      }

      formBorrar.submit();
    }

    // country_option_tags no sabe cuál estaba guardado: se preselecciona acá.
    var paises = root.querySelectorAll('select[data-country]');
    for (var i = 0; i < paises.length; i++) {
      var def = paises[i].getAttribute('data-default');
      if (def) paises[i].value = def;
    }
  }

  function init() {
    initLoginModal();
    initDatosPerro();
    initFichaPerro();
    initPedidos();
    initDirecciones();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
