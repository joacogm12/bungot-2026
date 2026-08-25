/* ==========================================================================
   BUNGOT 2026 — producto.js  (PDP de split fijo)

   Miniaturas que cambian la foto grande, selectores con estado real, stepper y
   CTA con etiqueta viva. Los acordeones son <details> nativos: no necesitan JS.
   Se auto-inicializa y no hace nada si el markup no está.
   ========================================================================== */
(function () {
  'use strict';

  function init() {
    var root = document.querySelector('[data-pdp]');
    if (!root) return;

    setupThumbs(root);
    setupOptions(root);
    setupPlans(root);
    setupStepper(root);
    setupAddToCart(root);
    setupCrossSell();
    setupReviews(root);
  }

  /* --- Miniaturas ---------------------------------------------------------
     Cambian lo que muestra el marco. Una foto cambia el src del <img> y su
     tratamiento (el "fit" viaja en data-fit: una recortada respira con
     contain + padding, una con fondo propio va a sangre). Un video se clona
     desde su <template> al slot del marco y la foto se esconde; entra con
     preload="none" y solo su poster, y el archivo no baja hasta que la persona
     le da play. Cada video se clona UNA vez, así regresar a él no lo vuelve a
     bajar; al cambiar de miniatura se pausa (o se desmonta, si es un embed). */
  function setupThumbs(root) {
    var frame = root.querySelector('.pdframe');
    var main = root.querySelector('[data-pd-main]');
    var slot = root.querySelector('[data-pd-media-slot]');
    var thumbs = root.querySelectorAll('[data-pd-thumb]');
    if (!frame || !main || !thumbs.length) return;

    function stopVideos() {
      if (!slot) return;
      slot.querySelectorAll('.pdvideo').forEach(function (fig) {
        var video = fig.querySelector('video');
        if (video) video.pause();
        // Un embed externo no se pausa desde afuera: se saca y vuelve al poster.
        var iframe = fig.querySelector('iframe');
        if (iframe) {
          iframe.remove();
          var poster = fig.querySelector('.pdvideo__poster');
          if (poster) poster.hidden = false;
        }
        fig.classList.remove('is-playing');
      });
    }

    function showImage(thumb) {
      stopVideos();
      if (slot) slot.hidden = true;
      main.hidden = false;
      main.src = thumb.getAttribute('data-full');
      main.alt = thumb.getAttribute('data-full-alt') || main.alt;
      main.classList.toggle('is-cover', thumb.getAttribute('data-fit') === 'cover');
      frame.classList.remove('is-video');
      frame.style.removeProperty('--pd-frame-ar');
    }

    function showVideo(thumb) {
      if (!slot) return;
      var id = thumb.getAttribute('data-media');
      var fig = slot.querySelector('.pdvideo[data-media-id="' + id + '"]');
      if (!fig) {
        var tpl = root.querySelector('template[data-pd-media="' + id + '"]');
        if (!tpl || !tpl.content.firstElementChild) return;
        fig = tpl.content.firstElementChild.cloneNode(true);
        wireVideo(fig);
        slot.appendChild(fig);
        // Chrome no pide el poster de un <video> que nació dentro de un
        // <template> (lo "cargó" en el documento inerte, donde no hay red) y
        // al insertarlo no lo reintenta: se ve crema en lugar del poster.
        // Volver a poner el atributo ya en el DOM dispara la carga real.
        var video = fig.querySelector('video');
        if (video && video.getAttribute('poster')) {
          var poster = video.getAttribute('poster');
          video.removeAttribute('poster');
          video.setAttribute('poster', poster);
        }
      }
      stopVideos();
      slot.querySelectorAll('.pdvideo').forEach(function (f) { f.hidden = f !== fig; });
      slot.hidden = false;
      main.hidden = true;
      frame.classList.add('is-video');
      // En móvil el marco toma la proporción del video (vertical incluido).
      frame.style.setProperty('--pd-frame-ar', thumb.getAttribute('data-ar') || '1');
    }

    /* El botón de play es el único disparador de la descarga. Con un <video>
       nativo enciende los controles y reproduce; con un embed crea el iframe
       en ese momento. Nunca hay autoplay: el clic es el gesto del usuario. */
    function wireVideo(fig) {
      var play = fig.querySelector('[data-pd-play]');
      var video = fig.querySelector('video');
      var embed = fig.getAttribute('data-embed');
      if (!play) return;

      play.addEventListener('click', function () {
        fig.classList.add('is-playing');
        if (video) {
          video.controls = true;
          var p = video.play();
          if (p && p.catch) p.catch(function () { fig.classList.remove('is-playing'); });
        } else if (embed && !fig.querySelector('iframe')) {
          var iframe = document.createElement('iframe');
          iframe.src = embed;
          iframe.className = 'pdvideo__embed';
          iframe.title = play.getAttribute('aria-label') || '';
          iframe.allow = 'autoplay; fullscreen; picture-in-picture';
          iframe.setAttribute('allowfullscreen', '');
          var poster = fig.querySelector('.pdvideo__poster');
          if (poster) poster.hidden = true;
          fig.insertBefore(iframe, play);
        }
      });
      if (video) {
        video.addEventListener('ended', function () { fig.classList.remove('is-playing'); });
      }
    }

    /* Una sola ruta para cambiar de pieza: la usan las miniaturas, las flechas
       y el teclado. Mantiene el contador y deja la miniatura activa a la vista
       en la tira (en móvil se desplaza). */
    var list = Array.prototype.slice.call(thumbs);
    var countCur = root.querySelector('[data-pd-count-cur]');
    var countTotal = root.querySelector('[data-pd-count-total]');
    if (countTotal) countTotal.textContent = String(list.length);

    function current() {
      var i = list.findIndex(function (t) { return t.classList.contains('is-active'); });
      return i < 0 ? 0 : i;
    }

    function select(index, viaNav) {
      var i = (index + list.length) % list.length;
      var thumb = list[i];
      list.forEach(function (t) {
        t.classList.remove('is-active');
        t.setAttribute('aria-pressed', 'false');
      });
      thumb.classList.add('is-active');
      thumb.setAttribute('aria-pressed', 'true');
      if (countCur) countCur.textContent = String(i + 1);
      if (viaNav && thumb.scrollIntoView) {
        thumb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      if (thumb.getAttribute('data-kind') === 'video') showVideo(thumb);
      else showImage(thumb);
    }

    list.forEach(function (thumb, i) {
      thumb.addEventListener('click', function () { select(i, false); });
    });

    var prev = root.querySelector('[data-pd-prev]');
    var next = root.querySelector('[data-pd-next]');
    if (prev) prev.addEventListener('click', function () { select(current() - 1, true); });
    if (next) next.addEventListener('click', function () { select(current() + 1, true); });

    // Flechas del teclado mientras el foco está en la galería (miniaturas o
    // botones). Arriba/izquierda = anterior; abajo/derecha = siguiente.
    var gal = root.querySelector('.pdgal');
    if (gal) {
      gal.addEventListener('keydown', function (e) {
        if (e.target.tagName === 'VIDEO' || e.target.tagName === 'IFRAME') return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); select(current() - 1, true); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); select(current() + 1, true); }
      });
    }
  }

  /* --- Selectores ---------------------------------------------------------
     El estado vive en las pastillas (.is-selected). Con variantes reales se
     recalcula la variante que corresponde; sin ellas la selección solo alimenta
     la etiqueta del CTA. */
  function setupOptions(root) {
    var groups = root.querySelectorAll('[data-pd-group]');
    var addBtn = root.querySelector('[data-pd-add]');
    var idInput = root.querySelector('[data-pd-variant]');
    var variants = readVariants(root);

    function selectedValues() {
      var vals = [];
      groups.forEach(function (group) {
        var pos = parseInt(group.getAttribute('data-pd-group'), 10) || 1;
        var sel = group.querySelector('.is-selected');
        vals[pos - 1] = sel ? sel.getAttribute('data-pd-val') : null;
      });
      return vals;
    }

    function matchVariant(vals) {
      for (var i = 0; i < variants.length; i++) {
        var v = variants[i];
        var ok = true;
        for (var j = 0; j < vals.length; j++) {
          if (v.options[j] !== vals[j]) { ok = false; break; }
        }
        if (ok) return v;
      }
      return null;
    }

    // La etiqueta viva del CTA: "Agregar · 40 g · Cerdo" — o "Suscribirme ·
    // 40 g" cuando hay un plan de suscripción elegido (ver setupPlans).
    function update() {
      if (!addBtn) return;
      var vals = selectedValues().filter(Boolean);
      var prefix = root.classList.contains('has-plan')
        ? (addBtn.getAttribute('data-prefix-plan') || addBtn.getAttribute('data-prefix'))
        : addBtn.getAttribute('data-prefix');
      var label = [prefix].concat(vals).join(' · ');

      if (!variants.length) {
        addBtn.textContent = label;
        return;
      }

      var v = matchVariant(selectedValues());
      if (!v) {
        addBtn.disabled = true;
        addBtn.textContent = addBtn.getAttribute('data-label-unavailable');
        return;
      }
      if (idInput) idInput.value = v.id;
      addBtn.disabled = !v.available;
      addBtn.textContent = v.available ? label : addBtn.getAttribute('data-label-soldout');
      refreshPlanPrices(root, v);
    }

    // setupPlans lo llama al cambiar de plan, para rehacer la etiqueta.
    root.pdUpdateCta = update;

    groups.forEach(function (group) {
      var pills = group.querySelectorAll('[data-pd-opt]');
      pills.forEach(function (pill) {
        pill.addEventListener('click', function () {
          pills.forEach(function (p) {
            p.classList.remove('is-selected');
            p.setAttribute('aria-pressed', 'false');
          });
          pill.classList.add('is-selected');
          pill.setAttribute('aria-pressed', 'true');
          update();
        });
      });
    });

    update();
  }

  function readVariants(root) {
    return readJSON(root.querySelector('[data-pd-variants]'), []);
  }

  /* --- Suscripción (Shopify Subscriptions) --------------------------------
     Los radios del selector no viajan al carrito: lo que va es el input oculto
     name="selling_plan". Con plan elegido se llena y se habilita; con "compra
     única" se deshabilita, y un input deshabilitado no entra al FormData, así
     el POST a /cart/add.js no lleva el campo. Sin selector no hace nada. */
  function setupPlans(root) {
    var box = root.querySelector('[data-pd-plans]');
    var input = root.querySelector('[data-pd-plan-input]');
    if (!box || !input) return;
    var radios = toArray(box.querySelectorAll('[data-pd-plan]'));

    function apply() {
      var chosen = radios.filter(function (r) { return r.checked; })[0];
      var planId = chosen ? chosen.value : '';
      radios.forEach(function (r) {
        var opt = r.closest('.pdplan__opt');
        if (opt) opt.classList.toggle('is-selected', r.checked);
      });
      input.value = planId;
      input.disabled = !planId;
      root.classList.toggle('has-plan', !!planId);
      if (root.pdUpdateCta) root.pdUpdateCta();
    }

    radios.forEach(function (r) { r.addEventListener('change', apply); });
    apply();
  }

  // Los precios del selector son por variante (el JSON trae pares [plan, precio]
  // por cada una): al cambiar de variante se repintan. Sin datos, se quedan.
  function refreshPlanPrices(root, v) {
    if (!v) return;
    var oneTime = root.querySelector('[data-pd-plan-price=""]');
    if (oneTime && v.price) oneTime.textContent = v.price;
    (v.plans || []).forEach(function (pair) {
      var el = root.querySelector('[data-pd-plan-price="' + pair[0] + '"]');
      if (el) el.textContent = pair[1];
    });
  }

  // Los <script type="application/json"> de la sección: variantes y textos.
  function readJSON(el, fallback) {
    if (!el) return fallback;
    try { return JSON.parse(el.textContent) || fallback; } catch (e) { return fallback; }
  }

  /* --- Stepper: mínimo 1, refleja el valor en el input oculto ------------- */
  function setupStepper(root) {
    var stepper = root.querySelector('[data-pd-stepper]');
    if (!stepper) return;
    var val = stepper.querySelector('[data-pd-qty]');
    var qtyInput = root.querySelector('[data-pd-qty-input]');

    stepper.querySelectorAll('[data-pd-step]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = (parseInt(val.textContent, 10) || 1) + parseInt(btn.getAttribute('data-pd-step'), 10);
        if (q < 1) q = 1;
        val.textContent = q;
        if (qtyInput) qtyInput.value = q;
      });
    });
  }

  /* --- Agregar al carrito -------------------------------------------------
     Nunca navega al carrito: con variante real va por /cart/add.js y sin ella
     (producto de ejemplo, sin backend) solo se simula. La confirmación es el
     vuelo de la bolita (window.BUNGOT.flyToCart, theme.js): el contador del
     header sube cuando aterriza — con el item_count real si el fetch ya
     regresó — y el botón solo se bloquea mientras dura el fetch. */
  function setupAddToCart(root) {
    var form = root.querySelector('[data-pd-form]');
    if (!form) return;
    var addBtn = root.querySelector('[data-pd-add]');
    var idInput = root.querySelector('[data-pd-variant]');
    var qtyInput = root.querySelector('[data-pd-qty-input]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var qty = parseInt(qtyInput && qtyInput.value, 10) || 1;
      var vuelo = despega(addBtn, qty);

      // Sin variante no hay POST: la bolita ya subió el contador de mentira.
      if (!idInput || !idInput.value) return;

      if (addBtn) addBtn.disabled = true;
      fetch('/cart/add.js', {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      })
        .then(function (r) {
          if (!r.ok) throw rechazo(r);
          return fetch('/cart.js', { headers: { Accept: 'application/json' } });
        })
        .then(function (r) { return r.json(); })
        .then(function (cart) {
          vuelo.ponTotal(cart.item_count);
          if (addBtn) addBtn.disabled = false;
        })
        .catch(function (err) {
          // Rechazado por Shopify (422): cancelar el festejo. Sin carrito
          // disponible (red caída) el contador ya subió al aterrizar la
          // bolita, así que al menos no miente. Solo soltar el botón.
          if (err && err.rechazado) vuelo.falla();
          if (addBtn) addBtn.disabled = false;
        });
    });
  }

  /* --- Venta cruzada: las tarjetas agregan sin salir de la PDP ------------
     Son las mismas tarjetas del catálogo (snippets/banda-card.liquid): su
     form navegaría a /cart/add, acá se intercepta y va por fetch con la
     misma bolita del CTA. Las tarjetas manuales (sin variante) no traen
     form, así que no pasan por acá. */
  function setupCrossSell() {
    toArray(document.querySelectorAll('.card__addform')).forEach(function (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var btn = form.querySelector('.card__add');
        var vuelo = despega(btn, 1);
        if (btn) btn.disabled = true;
        fetch('/cart/add.js', {
          method: 'POST',
          body: new FormData(form),
          headers: { Accept: 'application/json' }
        })
          .then(function (r) {
            if (!r.ok) throw rechazo(r);
            return fetch('/cart.js', { headers: { Accept: 'application/json' } });
          })
          .then(function (r) { return r.json(); })
          .then(function (cart) {
            vuelo.ponTotal(cart.item_count);
            if (btn) btn.disabled = false;
          })
          .catch(function (err) {
            if (err && err.rechazado) vuelo.falla();
            if (btn) btn.disabled = false;
          });
      });
    });
  }

  // Error marcado para distinguir "Shopify dijo que no" (422: agotado, sin
  // plan, variante inexistente) de "no hubo red": solo el primero cancela el
  // vuelo, el segundo deja el contador como ya subió.
  function rechazo(r) {
    var err = new Error('cart/add ' + r.status);
    err.rechazado = true;
    return err;
  }

  // El vuelo con el naranja de la PDP (--pd-naranja): la bolita coral del
  // resto del tema desentonaría acá. Si theme.js no cargó, al menos que el
  // contador no mienta.
  function despega(btn, qty) {
    if (window.BUNGOT && window.BUNGOT.flyToCart) {
      return window.BUNGOT.flyToCart(btn, { cantidad: qty, color: '#E24E2E' });
    }
    bumpCount(qty);
    return { ponTotal: setCount, falla: function () { bumpCount(-qty); } };
  }

  function counters() {
    return document.querySelectorAll('[data-cart-count]');
  }

  function setCount(n) {
    counters().forEach(function (el) { el.textContent = n; });
  }

  function bumpCount(qty) {
    counters().forEach(function (el) {
      el.textContent = (parseInt(el.textContent, 10) || 0) + qty;
    });
  }

  /* --- Opiniones ----------------------------------------------------------
     Las opiniones ya cargadas las dibuja Liquid (bloques del customizer); acá
     solo vive lo que pasa después: mostrar de cinco en cinco, el popup para
     escribir una y el recálculo del promedio.

     Lo que se publica es de la sesión: no hay backend de reviews, así que al
     recargar quedan las del customizer. El promedio se calcula con la MISMA
     cuenta que hace Liquid (décimas redondeadas), para que el número y las
     estrellas del encabezado no se contradigan nunca.

     El copy sale del <script data-pd-rev-i18n>, que a su vez sale de
     locales/es.default.json: acá no hay ni una cadena de UI escrita a mano. */
  function setupReviews(root) {
    var box = root.querySelector('[data-pd-reviews]');
    if (!box) return;

    var t = readJSON(box.querySelector('[data-pd-rev-i18n]'), {});
    var score = box.querySelector('[data-pd-rev-score]');
    var sub = box.querySelector('[data-pd-rev-sub]');
    var list = box.querySelector('[data-pd-rev-list]');
    var more = box.querySelector('[data-pd-rev-more]');
    var less = box.querySelector('[data-pd-rev-less]');
    var veil = box.querySelector('[data-pd-rev-veil]');
    var form = box.querySelector('[data-pd-rev-form]');
    var picker = box.querySelector('[data-pd-rev-picker]');
    var textEl = box.querySelector('[data-pd-rev-text]');
    var nameEl = box.querySelector('[data-pd-rev-name]');
    if (!score || !sub || !list || !veil || !form) return;

    var items = toArray(list.children);
    // Lo visible ya lo decidió Liquid: tres, o todas cuando es el editor.
    var shown = items.filter(function (it) { return !it.hidden; }).length;
    // Piso de "ver menos": nunca esconde nada de lo que se veía al llegar. Sube
    // al publicar, para que una opinión recién escrita no se pueda ocultar.
    var base = shown;
    var STEP = 5;
    var rating = 0;    // estrellas elegidas en el popup
    var opener = null; // a quién le devolvemos el foco al cerrar

    // El '%s' del locale es el hueco del número.
    function fill(str, n) { return String(str || '').replace('%s', n); }

    function stars(value) {
      var out = '';
      for (var i = 1; i <= 5; i++) out += i <= value ? '★' : '☆';
      return out;
    }

    // Promedio ×10 y redondeado: 40 puntos entre 9 opiniones → 44 → "4.4".
    function tenths() {
      if (!items.length) return 0;
      var sum = 0;
      items.forEach(function (it) { sum += parseInt(it.getAttribute('data-rating'), 10) || 0; });
      return Math.round(sum * 10 / items.length);
    }

    // Fila de estrellas del encabezado. Con opiniones son texto (el promedio);
    // sin ellas son botones que abren el popup con esa calificación puesta.
    function starRow(value, isPicker, label) {
      var row = document.createElement('div');
      row.className = 'pdops__stars';
      for (var i = 1; i <= 5; i++) {
        var star = document.createElement(isPicker ? 'button' : 'span');
        star.className = 'pdops__star' + (isPicker ? ' pdops__star--pick' : '');
        star.textContent = i <= value ? '★' : '☆';
        if (isPicker) {
          star.type = 'button';
          star.setAttribute('data-pd-rev-pick', i);
          star.setAttribute('aria-label', i === 1 ? (t.star_one || '') : fill(t.star_many, i));
        }
        row.appendChild(star);
      }
      row.setAttribute('role', isPicker ? 'group' : 'img');
      row.setAttribute('aria-label', isPicker ? (t.pick || '') : label);
      return row;
    }

    function renderScore() {
      score.textContent = '';
      if (!items.length) {
        score.appendChild(starRow(0, true));
        sub.textContent = t.first || '';
        return;
      }
      var avg = (tenths() / 10).toFixed(1);
      score.appendChild(starRow(Math.round(tenths() / 10), false, fill(t.of_five, avg)));
      var num = document.createElement('span');
      num.className = 'pdops__avg';
      num.textContent = avg;
      score.appendChild(num);
      sub.textContent = items.length === 1 ? (t.one || '') : fill(t.many, items.length);
    }

    function applyShown() {
      // Sin el tope, un "ver más" de más dejaría a "ver menos" escondiendo una
      // sola opinión en su primer clic.
      if (shown > items.length) shown = items.length;
      if (shown < base) shown = base;
      items.forEach(function (it, i) { it.hidden = i >= shown; });

      if (more) {
        var rest = items.length - shown;
        more.hidden = rest < 1;
        more.textContent = rest === 1 ? (t.more_one || '') : fill(t.more_many, rest);
      }
      // "Ver menos" solo existe mientras haya algo abierto de más que cerrar.
      if (less) less.hidden = shown <= base;
    }

    // Se arma con textContent, nunca con innerHTML: el texto lo escribió quien
    // está del otro lado de la pantalla.
    function buildItem(value, text, meta) {
      var item = document.createElement('article');
      item.className = 'pdops__item';
      item.setAttribute('data-pd-rev-item', '');
      item.setAttribute('data-rating', value);

      var row = document.createElement('div');
      row.className = 'pdops__istars';
      row.setAttribute('role', 'img');
      row.setAttribute('aria-label', fill(t.of_five, value));
      row.textContent = stars(value);
      item.appendChild(row);

      var body = document.createElement('p');
      body.className = 'pdops__text';
      body.textContent = text;
      item.appendChild(body);

      var foot = document.createElement('p');
      foot.className = 'pdops__meta';
      foot.textContent = meta;
      item.appendChild(foot);

      return item;
    }

    function setPick(n) {
      rating = n;
      if (!picker) return;
      toArray(picker.children).forEach(function (btn, i) {
        var on = i < n;
        btn.textContent = on ? '★' : '☆';
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      picker.classList.remove('is-error');
    }

    function openModal(preset) {
      if (preset) setPick(preset);
      opener = document.activeElement;
      veil.hidden = false;
      if (textEl) textEl.focus();
      document.addEventListener('keydown', onKey);
    }

    function closeModal() {
      veil.hidden = true;
      document.removeEventListener('keydown', onKey);
      if (opener && opener.focus) opener.focus();
      opener = null;
    }

    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') closeModal();
    }

    function flag(el) {
      if (!el) return;
      el.classList.add('is-error');
      if (el.focus) el.focus();
    }

    // Las estrellas del encabezado se vuelven a dibujar al publicar, así que
    // los clics se escuchan delegados: los botones nuevos ya vienen atendidos.
    box.addEventListener('click', function (e) {
      var star = e.target.closest ? e.target.closest('[data-pd-rev-pick]') : null;
      if (!star) return;
      var n = parseInt(star.getAttribute('data-pd-rev-pick'), 10) || 0;
      if (veil.contains(star)) setPick(n);
      else openModal(n);
    });

    var openBtn = box.querySelector('[data-pd-rev-open]');
    if (openBtn) openBtn.addEventListener('click', function () { openModal(0); });

    box.querySelectorAll('[data-pd-rev-close]').forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });

    // Clic en el velo, no en el cuadro.
    veil.addEventListener('click', function (e) {
      if (e.target === veil) closeModal();
    });

    // De cinco en cinco para los dos lados.
    if (more) {
      more.addEventListener('click', function () {
        shown += STEP;
        applyShown();
      });
    }

    if (less) {
      less.addEventListener('click', function () {
        shown -= STEP;
        applyShown();
      });
    }

    if (textEl) {
      textEl.addEventListener('input', function () { textEl.classList.remove('is-error'); });
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = ((textEl && textEl.value) || '').trim();
      // Sin texto no hay opinión. Y sin estrellas tampoco se publica: una
      // opinión en cero arrastraría el promedio de todo el producto.
      if (!text) { flag(textEl); return; }
      if (!rating) { flag(picker); return; }

      var item = buildItem(rating, text, ((nameEl && nameEl.value) || '').trim() || t.anon || '');
      list.insertBefore(item, list.firstChild);
      items.unshift(item);
      shown += 1; // la recién publicada se ve sin tener que dar "ver más"
      base += 1;  // y tampoco se puede esconder con "ver menos"
      applyShown();
      renderScore();

      // El foco vuelve al botón de escribir: la estrella desde la que se abrió
      // el popup puede haber desaparecido al redibujar el encabezado.
      opener = openBtn;
      closeModal();

      if (textEl) textEl.value = '';
      if (nameEl) nameEl.value = '';
      setPick(0);
    });
  }

  function toArray(collection) {
    return Array.prototype.slice.call(collection);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
