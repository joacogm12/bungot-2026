/* ==========================================================================
   BUNGOT 2026 — pantalla-carga.js

   El repartidor pedaleando sobre el crema mientras carga la página.

   El truco: bungot-carga.mp4 trae el fondo NEGRO horneado (no transparente).
   Ni pintar la hoja de negro (deja de verse de la marca) ni mix-blend-mode
   (el crema es más claro que casi todo el dibujo y se come al perro)
   sirvieron; lo que va es recortar el negro cuadro por cuadro en un <canvas>:
   el <video> se esconde y lo que se ve es el canvas.

   Cuándo se ve — el modo lo decide el script inline del snippet ANTES del
   primer pintado (data-carga-modo): `sesion` (primera página de la sesión),
   `pesada` (plantilla listada en el ajuste), `transicion` (venimos de un clic
   que tardó) u `oculta`. Aquí además se reutiliza en las navegaciones: al
   hacer clic en un link interno se guarda la hora en sessionStorage y, si a
   los 450 ms seguimos en esta página (la siguiente tarda), la cortina entra
   suave sobre la página vieja; la nueva llega con la cortina ya puesta en su
   markup y la quita cuando termina de cargar. En páginas rápidas no se ve
   nada. La cortina nunca se destruye: se esconde con `hidden` y se vuelve a
   mostrar cuando haga falta.

   Reglas:
   · Un solo requestAnimationFrame, pero el trabajo pesado corre máximo cada
     70 ms: es un loop de 2 cuadros y procesarlo a 60 fps es tirar CPU.
   · Umbral 62 sobre la SUMA de los tres canales, no por canal. Los contornos
     son azul marino (#011670, suma 135): 62 solo mata el negro del fondo y su
     antialias cerrado. A partir de ~110 se comen las líneas. No lo subas.
   · willReadFrequently: true es obligatorio; sin él cada getImageData lee
     desde GPU y el bucle da tirones.
   · video.muted = true también en JS: sin eso Safari bloquea el autoplay.
   · Nunca deja al usuario atrapado: se va en `load` (con un mínimo en
     pantalla para no parpadear) y, pase lo que pase, a los 3 s. La que entra
     por un clic se va sola a los 5 s si la navegación no ocurrió, y se
     esconde si la página vuelve del bfcache (pageshow persisted).
   · El gancho de los clics se salta modificadores, target, download, anclas
     de la misma página, otros orígenes, eventos con preventDefault (van en
     window para correr después de cualquier handler del tema) y el editor de
     temas. Un link puede pedir quedar fuera con data-sin-carga.
   ========================================================================== */
(function () {
  'use strict';

  var el = document.querySelector('[data-carga]');
  if (!el) return;

  // Mínimo en pantalla en cualquier modo: 1 s (pedido del cliente), para que
  // el repartidor alcance a dar al menos un par de pedaleadas y no parpadee.
  var MINIMO = { sesion: 1000, pesada: 1000, transicion: 1000 };
  var TOPE = 3000;
  var TOPE_IDA = 5000;
  var ESPERA_IDA = 450; // mismo número que el script inline del snippet
  var TRANSICION_MS = 550; // > .5s del CSS, por si transitionend no llega (pestaña oculta)
  var T = 620;

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var video = el.querySelector('[data-carga-video]');
  var canvas = el.querySelector('[data-carga-canvas]');
  var ctx = null;
  var rafId = 0;
  var ultimo = 0;

  var estado = 'oculta'; // 'visible' | 'saliendo' | 'oculta'
  var desde = 0;
  var minimo = 0;
  var timers = [];

  function luego(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function limpiaTimers() { timers.forEach(clearTimeout); timers = []; }

  /* ---- video → canvas ---------------------------------------------------- */
  function cuadro(ahora) {
    if (estado === 'oculta') { rafId = 0; return; }
    rafId = requestAnimationFrame(cuadro);
    if (!video.videoWidth || ahora - ultimo < 70) return;
    ultimo = ahora;
    ctx.clearRect(0, 0, T, T);
    ctx.drawImage(video, 0, 0, T, T);
    var img = ctx.getImageData(0, 0, T, T);
    var d = img.data;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] < 62) d[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
  }

  function arranca() {
    if (reduce || !video || !canvas) return;
    if (!ctx) ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!video.getAttribute('src')) video.src = video.getAttribute('data-src');
    video.muted = true;
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* autoplay bloqueado: el tope nos saca */ });
    if (!rafId) rafId = requestAnimationFrame(cuadro);
  }

  function para() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    if (video) { try { video.pause(); } catch (e) { /* no-op */ } }
  }

  /* ---- mostrar / salir / ocultar ---------------------------------------- */
  function mostrar(modo, suave) {
    limpiaTimers();
    estado = 'visible';
    desde = performance.now();
    minimo = MINIMO[modo] || 0;
    el.classList.remove('carga--fuera');
    el.classList.toggle('carga--suave', !!suave);
    el.hidden = false;
    arranca();
  }

  function salir() {
    if (estado !== 'visible') return;
    estado = 'saliendo';
    limpiaTimers();
    try { sessionStorage.setItem('bungot:carga', '1'); } catch (e) { /* no-op */ }
    // Fuera la animación de entrada antes: su fill-mode le ganaría a la transición.
    el.classList.remove('carga--suave');
    el.classList.add('carga--fuera');
    el.addEventListener('transitionend', function alTerminar(e) {
      if (e.target !== el) return;
      el.removeEventListener('transitionend', alTerminar);
      ocultar();
    });
    luego(ocultar, TRANSICION_MS + 150);
  }

  function ocultar() {
    if (estado === 'oculta') return;
    estado = 'oculta';
    limpiaTimers();
    para();
    el.hidden = true;
    el.classList.remove('carga--fuera', 'carga--suave');
  }

  /* Sale cuando la página cargó, respetando el mínimo en pantalla. */
  function cuandoCargue() {
    if (estado !== 'visible') return;
    var faltan = minimo - (performance.now() - desde);
    luego(salir, Math.max(0, faltan));
  }

  /* ---- arranque: el modo ya lo decidió el snippet ------------------------ */
  var modo = el.getAttribute('data-carga-modo') || 'oculta';
  if (modo !== 'oculta') {
    mostrar(modo, false);
    if (document.readyState === 'complete') cuandoCargue();
    else window.addEventListener('load', cuandoCargue);
    luego(salir, TOPE); // si el video no carga o load se atora, igual nos vamos
  }

  /* ---- reutilización al navegar ------------------------------------------ */
  function borraIda() {
    try { sessionStorage.removeItem('bungot:carga:ida'); } catch (e) { /* no-op */ }
  }

  function prepararIda() {
    try { sessionStorage.setItem('bungot:carga:ida', String(Date.now())); } catch (e) { /* no-op */ }
    if (estado !== 'oculta') return; // ya está puesta (p. ej. clic mientras carga)
    limpiaTimers();
    luego(function () {
      if (document.visibilityState === 'hidden') return;
      mostrar('transicion', true);
      luego(function () { borraIda(); salir(); }, TOPE_IDA); // la navegación no ocurrió
    }, ESPERA_IDA);
  }

  function esNavegacionInterna(a) {
    if (a.target && a.target !== '_self') return false;
    if (a.hasAttribute('download') || a.hasAttribute('data-sin-carga')) return false;
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return false; }
    if (url.origin !== location.origin) return false;
    // Ancla dentro de la misma página: no hay carga que tapar.
    if (url.hash && url.pathname === location.pathname && url.search === location.search) return false;
    return true;
  }

  if (!(window.Shopify && window.Shopify.designMode)) {
    window.addEventListener('click', function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a || !esNavegacionInterna(a)) return;
      prepararIda();
    });

    // Formularios GET (la búsqueda) también navegan. Los POST (carrito) y los
    // que se mandan por fetch (contacto, con preventDefault) no cuentan.
    window.addEventListener('submit', function (e) {
      if (e.defaultPrevented) return;
      var f = e.target;
      if (!f || (f.method || 'get').toLowerCase() !== 'get') return;
      if (f.target && f.target !== '_self') return;
      prepararIda();
    });
  }

  // Vuelta con el botón atrás desde el bfcache: la página revive tal cual se
  // fue, cortina incluida. Fuera, y sin hora de ida colgada.
  window.addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    borraIda();
    ocultar();
  });
})();
