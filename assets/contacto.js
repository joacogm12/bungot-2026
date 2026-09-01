/* ==========================================================================
   BUNGOT 2026 — contacto.js  (envío por fetch y panel de confirmación)

   El form se manda por fetch al endpoint de contacto de Shopify y, al
   resolver, se destapa el panel .ct-ok encima del formulario. La animación
   del panel es CSS pura: aquí solo se le quita el hidden (display:none →
   flex reinicia los keyframes), sin temporizadores.

   Cuando el fetch no puede completar el envío —sin red, o Shopify manda al
   /challenge del anti-spam— se deja ir el envío nativo: la página regresa
   con ?contact_posted=true y el panel lo pinta Liquid.

   Se auto-inicializa y no hace nada si el markup no está.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.querySelector('[data-contacto]');
  if (!root) return;

  var form = root.querySelector('form.ct-form');
  var boton = root.querySelector('[data-ct-enviar]');
  var nombre = root.querySelector('#ct-nombre');
  var correo = root.querySelector('#ct-correo');
  var mensaje = root.querySelector('#ct-mensaje');
  var asunto = root.querySelector('[data-ct-asunto]');
  var panel = root.querySelector('[data-ct-ok]');
  var otro = root.querySelector('[data-ct-otro]');
  var correoOk = root.querySelector('[data-ct-ok-correo]');
  if (!form || !boton || !nombre || !correo || !mensaje) return;

  var campos = [nombre, correo, mensaje];

  /* --- 1. Asunto ---------------------------------------------------------
     Antes eran pastillas de opción única con un input oculto; ahora es un
     <select> nativo que ya lleva el name, así que sólo hay que saber
     devolverlo a su primera opción al reiniciar el formulario. */
  function reiniciaAsunto() {
    if (asunto && asunto.options) asunto.selectedIndex = 0;
  }

  /* --- Habilitar el envío ---------------------------------------------------
     El botón solo se habilita con nombre, correo y mensaje llenos. Sin JS
     queda habilitado y valida el required nativo, así que no se pierde nada. */
  function listo() {
    for (var k = 0; k < campos.length; k++) {
      if (campos[k].value.trim() === '') return false;
    }
    return true;
  }
  var enviando = false;
  function revisa() {
    boton.disabled = enviando || !listo();
  }
  for (var m = 0; m < campos.length; m++) {
    campos[m].addEventListener('input', revisa);
  }
  revisa();

  if (!panel || !otro) return;

  /* --- El panel -------------------------------------------------------------- */
  function muestra(email) {
    if (correoOk) {
      correoOk.textContent = email || correoOk.getAttribute('data-ct-ok-correo');
    }
    panel.hidden = false;
    otro.focus();
  }

  function oculta() {
    panel.hidden = true;
  }

  // "Mandar otro mensaje": se conservan nombre y correo; mensaje y asunto
  // vuelven a cero.
  otro.addEventListener('click', function () {
    oculta();
    mensaje.value = '';
    reiniciaAsunto();
    revisa();
    mensaje.focus();
  });

  // Teclear en cualquier campo apaga el estado "enviado".
  for (var n = 0; n < campos.length; n++) {
    campos[n].addEventListener('input', function () {
      if (!panel.hidden) oculta();
    });
  }

  // Si el panel llegó pintado por Liquid (?contact_posted=true), se limpia la
  // URL para que un refresh no vuelva a mostrar la confirmación.
  if (!panel.hidden && window.history && history.replaceState &&
      /[?&]contact_posted=/.test(location.search)) {
    var limpia = location.search
      .replace(/([?&])contact_posted=[^&]*&?/, '$1')
      .replace(/[?&]$/, '');
    history.replaceState(null, '', location.pathname + limpia + location.hash);
    otro.focus();
  }

  /* --- Envío por fetch ------------------------------------------------------ */
  // Sin fetch queda el envío nativo: la página navega y el panel lo pinta
  // Liquid con ?contact_posted=true.
  if (!window.fetch || !window.FormData) return;

  var submitNativo = HTMLFormElement.prototype.submit.bind(form);

  function enviaPorFetch() {
    if (enviando || !listo()) return;
    enviando = true;
    revisa();

    fetch(form.action, {
      method: 'POST',
      body: new FormData(form),
      credentials: 'same-origin',
      headers: { Accept: 'text/html' }
    })
      .then(function (res) {
        // Sin token válido Shopify manda al /challenge del anti-spam: por
        // fetch no hay cómo pasarlo, así que va el envío nativo (y a la vuelta
        // el panel lo pinta Liquid).
        if (!res.ok || res.url.indexOf('/challenge') !== -1) {
          submitNativo();
          return;
        }
        enviando = false;
        revisa();
        muestra(correo.value.trim());
      })
      .catch(function () {
        submitNativo();
      });
  }

  // La protección anti-spam de Shopify (hCaptcha invisible) se enlaza al form
  // cuando el visitante lo toca: envuelve form.submit, intercepta el submit,
  // consigue el token y entonces llama a lo que form.submit ERA antes. Dejarlo
  // apuntando al fetch desde ya hace que el token viaje en el FormData y la
  // confirmación se quede en la página, sin brincar a /challenge.
  form.submit = enviaPorFetch;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    // Con el captcha enlazado su listener corre después y acaba llamando a
    // form.submit (= enviaPorFetch) con el token ya puesto: no se manda dos veces.
    if (form.dataset.hcaptchaBound || form.dataset.recaptchaBound) return;
    enviaPorFetch();
  });
})();
