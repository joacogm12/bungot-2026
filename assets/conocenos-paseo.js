/* ==========================================================================
   BUNGOT 2026 — conocenos-paseo.js  (la historia como un paseo)

   Un salchicha visto desde arriba recorre el camino del lienzo 1582×5650.
   La posición del perro (`fin`, en longitud de arco) es una función pura de
   scrollY; de ella cuelgan la cámara, el resorte del cuerpo, los relojes de
   las estaciones y la coreografía del rollo. Nada corre solo: se puede
   rebobinar hacia arriba y cada animación se devuelve.

   Reglas de rendimiento que no hay que romper:
   · El path se muestrea UNA vez cada 6px a una tabla (getPointAtLength por
     frame cuesta cientos de ms); todo lo demás interpola sobre ella.
   · El rAF NUNCA lee layout. Lo que se mide vive en medirPista() (montaje,
     resize, ResizeObserver sobre el marco) y en la tabla del path.
   · ancla() escribe left/top solo cuando el punto cambió; tocar el layout
     cada frame provoca reflow y el scroll se siente pegajoso.
   · Un solo requestAnimationFrame global + repintado síncrono en scroll y
     resize (con el rAF congelado — pestaña oculta, captura, export — el
     perro quedaría sin colocar y el resorte sin dibujar). El frame corta
     temprano si el scroll no se movió y ningún reloj está en vuelo.

   Se auto-inicializa y no hace nada si el markup no está.
   ========================================================================== */
(function () {
  'use strict';

  var W = 1582;            // ancho del lienzo
  var H = 5650;            // alto de la escena (= height de .paseo__escena y viewBox del SVG)
  var PASO = 6;            // separación de la tabla de puntos, en px de curva
  var LAM = 44;            // paso de la hélice del resorte
  var AMP = 34;            // radio de la hélice
  var ATRAS = LAM * 0.42;  // retroceso por vuelta: lo que hace leer al cuerpo como resorte
  var DTH = 0.34;          // paso angular al dibujar la hélice
  var S_GRUPA = 70;        // la grupa se planta aquí, fija
  /* Reparto del scroll en tres fases: el paseo del perro, el remate del rollo
     (cámara que baja, bote que cae, cinta que sale) y, con la escena ya
     quieta, el carrusel: el scroll saca las fotos del bote hacia la derecha. */
  var FASE_PERRO = 0.68;
  var FASE_REMATE = 0.84;  // el remate va de FASE_PERRO a aquí; de aquí a 1 es el carrusel
  var PI = Math.PI;
  var DOSPI = PI * 2;

  var root, marco, lienzo, riel, ventana, escena, guia, medida;
  var perro = {};   // atras, frente
  var est = {};     // utilería por nombre (data-est)
  var tar = {};     // tarjetas por número (data-tarjeta)
  var rollo = {};   // grupo, bote, tira, pista

  var tabla = null; // { pts: [[x,y],…], L }
  var memoS = {};   // 'clave@x,y' → s del punto más cercano del camino
  var estado = {};  // relojes por estación

  var geo = { listo: false, altoPista: 0, escV: 1, topDoc: 0, altoVent: 0, finScroll: 1, esc: 1, centros: {} };
  var plano = false;      // sin recorrido: reduced-motion o "Animar" apagado
  var pPrev = -1;
  var enVuelo = false;    // algún reloj con 0 < u < 1
  var sucio = true;       // hay que repintar aunque el scroll no se mueva
  var rafId = 0;
  var arrastre = { offScroll: 0, offMano: 0, escala: 2.05, activo: false, x0: 0, off0: 0 }; // escala = la del .prollo en CSS
  /* Dónde termina la última foto cuando la cinta está en reposo, en px de la
     tira (722 de ancho): la parte recta del dibujo acaba en x≈607 y de ahí
     arranca la curva de la lengüeta. Con 575 la foto se queda un poco atrás
     de la curva y la lengüeta sale del bote en negro, sin foto asomando. */
  var FIN_FOTOS = 575;

  /* --- Utilería ----------------------------------------------------------- */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function suave5(x) { x = clamp(x, 0, 1); return x * x * x * (x * (6 * x - 15) + 10); }
  function px(v) { return v.toFixed(2) + 'px'; }
  function deg(v) { return v.toFixed(3) + 'deg'; }

  function armarTabla() {
    var L = medida.getTotalLength();
    var n = Math.ceil(L / PASO);
    var pts = [];
    for (var i = 0; i <= n; i++) {
      var q = medida.getPointAtLength(Math.min(i * PASO, L));
      pts.push([q.x, q.y]);
    }
    tabla = { pts: pts, L: L, paso: PASO };
    memoS = {};
  }

  // Punto del camino a la longitud de arco s (interpolación lineal en la tabla).
  function pt(s) {
    var f = clamp(s, 0, tabla.L) / PASO;
    var i = Math.min(tabla.pts.length - 2, Math.floor(f));
    var t = f - i;
    var a = tabla.pts[i], b = tabla.pts[i + 1];
    return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
  }

  // Tangente unitaria en s (diferencia central de ±3px).
  function tang(s) {
    var a = pt(s - 3), b = pt(s + 3);
    var dx = b.x - a.x, dy = b.y - a.y;
    var m = Math.hypot(dx, dy) || 1;
    return { x: dx / m, y: dy / m };
  }

  /* El s cuyo punto está más cerca de (x,y). La llave lleva las coordenadas:
     si una parada se mueve, el valor se recalcula solo. */
  function sCerca(k, x, y) {
    var llave = k + '@' + Math.round(x) + ',' + Math.round(y);
    if (memoS[llave] == null) {
      var mejor = 0, dist = Infinity, pts = tabla.pts;
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i][0] - x, dy = pts[i][1] - y;
        var d = dx * dx + dy * dy;
        if (d < dist) { dist = d; mejor = i; }
      }
      memoS[llave] = Math.min(mejor * PASO, tabla.L);
    }
    return memoS[llave];
  }

  /* Planta un objeto a distancia perpendicular `off` del camino en s. Escribe
     left/top UNA SOLA VEZ por posición (compara contra dataset.puesto).
     off positivo = a la izquierda de la marcha; negativo = a la derecha. */
  function ancla(el, s, off) {
    var q = pt(s), t = tang(s);
    var x = q.x - t.y * off;
    var y = q.y + t.x * off;
    if (el) {
      var puesto = Math.round(x) + ',' + Math.round(y);
      if (el.dataset.puesto !== puesto) {
        el.dataset.puesto = puesto;
        el.style.left = px(x);
        el.style.top = px(y);
      }
    }
    return { x: x, y: y };
  }

  /* La tarjeta nace en `orig` y crece hasta su lugar. `dest` es el punto de
     la tarjeta que aterriza (su centro, medido en medirPista): así el
     puntito inicial cae exactamente en la boca del bote / el chorro / la
     pelota, sin depender de dónde quedó anclado el objeto. */
  function brota(el, t, orig, dest, giro, F) {
    if (!el) return;
    F = F || 1;
    var e = smoothstep(t);
    el.style.opacity = Math.min(1, e * 2.2).toFixed(3);
    el.style.transform =
      'translate(' + px((orig.x - dest.x) * (1 - e)) + ',' + px((orig.y - dest.y) * (1 - e)) + ')' +
      ' rotate(' + deg(giro * (1 - e)) + ')' +
      ' scale(' + (0.04 * F + (F - 0.04 * F) * e).toFixed(4) + ')';
  }

  /* Coloca un sprite del perro sobre el camino: el ángulo sale de la
     tangente. `antes` va entre el translate y el rotate (así se mueve en el
     eje de la escena, no en el del perro); `despues` va al final. */
  function coloca(el, s, w, h, ax, ay, extra, adelante) {
    var q = pt(s), q2 = pt(s + 6);
    var dx = q2.x - q.x, dy = q2.y - q.y;
    var ang = Math.atan2(dy, dx) * 180 / PI + (extra || 0);
    // `adelante`: px extra de frente por la tangente (para seguir más allá del final del camino).
    if (adelante) {
      var m = Math.hypot(dx, dy) || 1;
      q = { x: q.x + dx / m * adelante, y: q.y + dy / m * adelante };
    }
    el.style.transform =
      'translate(' + px(q.x - w * ax) + ',' + px(q.y - h * ay) + ') rotate(' + deg(ang) + ')';
  }

  /* El reloj de las paradas: 1 s de ida, 0.42 s de regreso, arrancando desde
     donde iba — cambiar de sentido a media animación no salta. */
  function reloj(k, dentro, ahora) {
    if (plano) return 1;
    var st = estado[k] || (estado[k] = { u: 0, dentro: false, t0: null });
    var dur = dentro ? 1000 : 420;
    if (dentro !== st.dentro || st.t0 == null) {
      st.dentro = dentro;
      st.t0 = ahora - (dentro ? st.u : 1 - st.u) * dur;
    }
    var av = clamp((ahora - st.t0) / dur, 0, 1);
    st.u = dentro ? av : 1 - av;
    /* "En vuelo" = todavía no llegó a su destino. Se compara contra el
       destino y no contra 0 < u < 1: en el primer cuadro tras cruzar el
       disparador u vale exactamente 0, y si eso no contara como en vuelo,
       un tic de rueda que cruza la parada y se detiene dejaría la animación
       congelada hasta el siguiente scroll. */
    if (dentro ? st.u < 1 : st.u > 0) enVuelo = true;
    return st.u;
  }

  /* --- Montaje ------------------------------------------------------------ */

  function init() {
    root = document.querySelector('[data-paseo]');
    if (!root || root.dataset.paseoListo) return;
    root.dataset.paseoListo = '1';

    marco = root.querySelector('[data-marco]');
    lienzo = root.querySelector('[data-lienzo]');
    riel = root.querySelector('[data-riel]');
    ventana = root.querySelector('[data-ventana]');
    escena = root.querySelector('[data-escena]');
    guia = root.querySelector('[data-guia]');
    medida = root.querySelector('[data-medida]');
    if (!marco || !lienzo || !riel || !ventana || !escena || !guia || !medida) return;

    root.querySelectorAll('[data-dachs]').forEach(function (n) { perro[n.dataset.dachs] = n; });
    root.querySelectorAll('[data-est]').forEach(function (n) { est[n.dataset.est] = n; });
    root.querySelectorAll('[data-tarjeta]').forEach(function (n) { tar[n.dataset.tarjeta] = n; });
    if (est.estela) {
      est.estela1 = est.estela.querySelector('[data-estela="1"]');
      est.estela2 = est.estela.querySelector('[data-estela="2"]');
    }
    rollo.grupo = root.querySelector('[data-rollo-grupo]');
    rollo.bote = root.querySelector('[data-rollo]');
    rollo.tira = root.querySelector('[data-tira]');
    rollo.pista = root.querySelector('[data-rollo-pista]');
    if (!perro.atras || !perro.frente) return;

    root.classList.add('paseo--js');
    /* Gancho de depuración (solo lectura): dispatchEvent(new Event('paseo:debug'))
       sobre [data-paseo] deja el estado en data-paseo-debug. Va por evento y
       no por expando porque los scripts de automatización viven en un mundo
       aislado y no ven propiedades JS del DOM. */
    root.addEventListener('paseo:debug', function () {
      var relojes = {};
      Object.keys(estado).forEach(function (k) { relojes[k] = +estado[k].u.toFixed(3); });
      root.dataset.paseoDebug = JSON.stringify({
        p: pPrev, L: tabla ? tabla.L : 0, geo: geo, memoS: memoS, relojes: relojes, plano: plano,
        carrusel: { activo: arrastre.activo, abierto: !!rollo.abierto, offScroll: arrastre.offScroll, offMano: arrastre.offMano }
      });
    });

    /* Los orígenes de giro del perro son fijos: la grupa gira por su frente
       (donde engancha el resorte) y la cabeza por el cuello. Los PNG son la
       vista cenital (grupa 190×111 con la cola arriba a la izquierda, cabeza
       228×238 con el hocico a la derecha), recortados de
       OneDrive/Pictures/perro_animacion/IMG_0319-0320.PNG. */
    perro.atras.style.transformOrigin = '95% 52%';
    perro.frente.style.transformOrigin = '4% 45%';

    armarTabla();
    initArrastre();
    decidir();

    window.addEventListener('resize', function () { medirPista(); pintar(); });
    window.addEventListener('scroll', function () { if (!plano) pintar(); }, { passive: true });
    window.addEventListener('load', function () { medirPista(); pintar(); });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { medirPista(); pintar(); });
    }
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { medirPista(); pintar(); }).observe(marco);
    }
    var mm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mm.addEventListener) mm.addEventListener('change', decidir);
  }

  function decidir() {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    plano = reduce || root.hasAttribute('data-sin-animar');
    root.classList.toggle('paseo--plano', plano);
    if (plano) {
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      escena.style.transform = '';
      ventana.style.height = '';
    } else if (!rafId) {
      rafId = requestAnimationFrame(cuadro);
    }
    medirPista();
    pintar();
  }

  /* Geometría fuera del bucle. Guarda altoPista, escV (el factor del zoom,
     medido como rect/offset para no depender de cómo cada navegador reporta
     offsetHeight bajo zoom) y topDoc; y de paso el centro de cada tarjeta,
     que es donde aterriza al brotar. */
  function medirPista() {
    lienzo.style.zoom = Math.min(1, marco.clientWidth / W);

    geo.altoPista = riel.offsetHeight || 1;
    var rect = riel.getBoundingClientRect();
    geo.escV = (rect.height / geo.altoPista) || 1;
    geo.topDoc = rect.top + window.scrollY;
    geo.altoVent = window.innerHeight / geo.escV;
    geo.esc = (escena.offsetWidth || W) / W;

    /* La ventana debe medir exactamente la pantalla en px del lienzo; se
       escribe explícito porque bajo `zoom` no todos los navegadores dejan
       100svh sin escalar. */
    if (!plano) ventana.style.height = px(geo.altoVent);

    var max = Math.max(1, geo.altoPista - geo.altoVent);
    geo.finScroll = Math.max(1, geo.topDoc + max * geo.escV);

    Object.keys(tar).forEach(function (k) {
      var c = tar[k];
      geo.centros[k] = { x: c.offsetLeft + c.offsetWidth / 2, y: c.offsetTop + c.offsetHeight / 2 };
    });

    geo.listo = true;
    sucio = true;
  }

  function cuadro() {
    rafId = requestAnimationFrame(cuadro);
    pintar();
  }

  /* --- El frame ----------------------------------------------------------- */

  function pintar() {
    if (!geo.listo || !tabla) return;
    var ahora = performance.now();

    /* Tres fases (ver FASE_*). Si el remate colgara de los últimos px del
       camino del perro, un par de tics de rueda se lo brincarían entero. */
    var avance, p, rB, rC;
    if (plano) {
      avance = 1; p = 1; rB = 1; rC = 0;
    } else {
      avance = clamp(window.scrollY / geo.finScroll, 0, 1); // camina desde el primer píxel
      var pA = clamp(avance / FASE_PERRO, 0, 1);
      p = 0.045 + pA * 0.955;                                // arranca ya un poco metido en el camino
      rB = clamp((avance - FASE_PERRO) / (FASE_REMATE - FASE_PERRO), 0, 1);
      rC = clamp((avance - FASE_REMATE) / (1 - FASE_REMATE), 0, 1);
    }
    if (!sucio && Math.abs(avance - pPrev) < 0.0004 && !enVuelo) return;
    sucio = false;
    pPrev = avance;
    enVuelo = false;

    var L = tabla.L;
    var fin = p * L; // la posición del perro, en longitud de arco

    /* Puntos de disparo. Se miden sobre la curva misma, no sobre la
       distancia al objeto: los objetos están lejos del camino y si no, el
       baile arrancaría antes de tiempo. */
    var sCasa = sCerca('casa', 1420, 723);
    var sVuelta = sCerca('boteAncla', 160, 1531) + 60;
    var sPru = sCerca('pruebas', 1420, 2339);
    var sHid = sCerca('hid', 160, 3147);
    var sCam = sCerca('camAncla', 1260, 3612) + 140;

    dibujarPerro(fin, L, sCasa);
    if (!plano) camara(fin, rB);

    estacionCasa(fin, sCasa, ahora);
    estacionBote(fin, sVuelta, ahora);
    estacionPruebas(fin, sPru, ahora);
    estacionHidrante(fin, sHid, ahora);
    estacionCamara(fin, sCam, ahora);
    remateRollo(rB);
    carruselPorScroll(rC);
  }

  /* --- El perro ------------------------------------------------------------
     Grupa fija en s = 70; cabeza en min(fin, L-8). Entre las dos, el
     resorte: una hélice sobre el camino en la que el avance retrocede un
     poco en cada vuelta (atras·sin θ) — eso es lo que la hace leer como
     resorte y no como círculos amontonados. Crece con el perro. */
  function dibujarPerro(fin, L, sCasa) {
    coloca(perro.atras, S_GRUPA, 190, 111, 0.95, 0.52);

    // El giro de cabeza al pasar junto a la casita: campana de Gauss, no un if.
    var voltea = -20 * Math.exp(-Math.pow((fin - sCasa) / 240, 2));

    /* El remate: el camino termina en x = −60 pero la cabeza mide 228 hacia
       adelante del cuello, así que en los últimos 320px sigue de frente por
       la tangente 320px más, hasta salirse del lienzo por la izquierda. Sin
       agacharse ni encogerse: cualquier transform extra la despegaba del
       resorte. */
    var esconde = clamp((fin - (L - 320)) / 320, 0, 1);
    coloca(perro.frente, Math.min(fin, L - 8), 228, 238, 0.04, 0.45, voltea, 320 * smoothstep(esconde));

    /* Arranca 24px dentro de la grupa y sigue 24px más allá del cuello (bajo
       la cabeza): los dos extremos quedan tapados por los sprites, que van
       un z arriba. Si termina antes del cuello se ve un hueco en las curvas. */
    var s0 = S_GRUPA - 24;
    var s1 = Math.max(s0, Math.min(fin + 24, L - 8));
    var nPasos = Math.round(((s1 - s0) / LAM) * DOSPI / DTH);
    var d = '';
    for (var i = 0; i <= nPasos; i++) {
      var th = i * DTH;
      var s = s0 + (th / DOSPI) * LAM;
      if (s > s1) break;
      var se = Math.max(0, s - ATRAS * Math.sin(th));
      var q = pt(se);
      var t = tang(se);
      var c = AMP * Math.cos(th);
      var x = q.x - t.y * c;
      var y = q.y + t.x * c;
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    guia.setAttribute('d', d);
  }

  /* --- La cámara -----------------------------------------------------------
     Sigue al perro promediando la Y del camino en ±900px (sin el promedio,
     el vaivén de las vueltas horizontales sacude el encuadre). En la primera
     mitad de la fase del remate baja hasta el pie de la escena para que el
     rollo quede en cuadro. */
  function camara(fin, rB) {
    var suma = 0, n = 0;
    for (var k = -900; k <= 900; k += 150) { suma += pt(fin + k).y; n++; }
    var yPerro = (suma / n) * geo.esc;
    var meta = Math.min(-80, geo.altoVent * 0.72 - yPerro);
    var piso = geo.altoVent - H;
    var cola = smoothstep(clamp(rB / 0.5, 0, 1));
    meta += (piso - meta) * cola;
    if (meta < piso) meta = piso;
    escena.style.transform = 'translate3d(0,' + px(meta) + ',0)';
  }

  /* --- 6.4 La casita y la pelota (tarjeta 3) ------------------------------ */

  function posPelota(v) {
    var bote = Math.abs(Math.sin(3 * PI * v)) * (1 - 0.75 * v); // tres botes cada vez más bajos
    return { x: 210 + 665 * v, y: 250 - 72 * v - 330 * bote };
  }

  // Estela de historieta: 11 posiciones pasadas de la pelota.
  function traza(u, dx, dy, largo) {
    var d = '';
    for (var i = 0; i <= 10; i++) {
      var v = Math.max(0, u - largo * (1 - i / 10));
      var q = posPelota(v);
      d += (i ? 'L' : 'M') + (q.x + dx).toFixed(1) + ' ' + (q.y + dy).toFixed(1);
    }
    return d;
  }

  function estacionCasa(fin, sCasa, ahora) {
    var Q = ancla(est.casa, sCasa, 1074);
    ancla(est.pelota, sCasa, 1074);
    ancla(est.estela, sCasa, 1074);
    var u = reloj('casa', fin >= sCasa - 150, ahora);

    if (est.pelota) {
      var q = posPelota(u);
      est.pelota.style.transform = 'translate(' + px(q.x) + ',' + px(q.y) + ') rotate(' + deg(620 * u) + ')';
    }
    if (est.estela) {
      var visible = u > 0.02 && u < 0.98;
      est.estela.style.opacity = visible ? '1' : '0';
      if (visible) {
        est.estela1.setAttribute('d', traza(u, 0, 0, 0.16));
        est.estela2.setAttribute('d', traza(u, 6, 26, 0.11));
      }
    }
    // La tarjeta sale del bote de la pelota.
    brota(tar[3], u, { x: Q.x + 875, y: Q.y + 216 }, geo.centros[3], 10, 1);
  }

  /* --- 6.1 El bote de basura (tarjeta 1) ---------------------------------- */

  function estacionBote(fin, sVuelta, ahora) {
    var Pb = ancla(est.bote, sVuelta, -1235);
    var t = reloj('bote', fin >= sVuelta - 60, ahora);
    var sv = smoothstep(t);

    if (est.bote) est.bote.style.transform = 'rotate(' + deg(-82 * sv) + ')';

    /* La tapa rueda hacia el lado libre. Su destino está en coordenadas de
       pantalla y el padre gira, así que se contrarrota por ese giro. */
    if (est.tapa) {
      var a = 82 * sv * PI / 180;
      var sx = 200 * sv, sy = 166 * sv;
      var lx = sx * Math.cos(a) - sy * Math.sin(a);
      var ly = sx * Math.sin(a) + sy * Math.cos(a);
      est.tapa.style.transform = 'translate(' + px(lx) + ',' + px(ly) + ') rotate(' + deg(-110 * sv) + ')';
    }

    // El plátano sale volando del bote y cae en la esquina de la tarjeta.
    if (est.platano) {
      var e = sv;
      var orig = { x: Pb.x - 386, y: Pb.y + 38 };
      var dest = { x: Pb.x - 425, y: Pb.y + 334 };
      var arco = -160 * Math.sin(PI * e);
      est.platano.style.opacity = Math.min(1, 4 * t).toFixed(3);
      est.platano.style.transform =
        'translate(' + px((orig.x - dest.x) * (1 - e)) + ',' + px((orig.y - dest.y) * (1 - e) + arco) + ')' +
        ' rotate(' + deg(-400 * (1 - e)) + ') scale(' + (0.3 + 0.7 * e).toFixed(4) + ')';
    }

    // La tarjeta nace en la boca del bote ya tumbado, no en su centro.
    brota(tar[1], t, { x: Pb.x - 386, y: Pb.y + 19 }, geo.centros[1], 12, 1);
  }

  /* --- 6.2 La mesa de pruebas (tarjeta 5) --------------------------------- */

  function estacionPruebas(fin, sPru, ahora) {
    var P = ancla(est.pruebas, sPru, 926);
    var t = reloj('pruebas', fin >= sPru - 150, ahora);
    var e = smoothstep(t);

    // Temblorcito del cristal.
    var golpe = Math.sin(Math.min(1, 2.6 * t) * PI);
    if (est.pruebas) est.pruebas.style.transform = 'rotate(' + deg(1.6 * golpe) + ')';

    /* Las burbujas parpadean tres veces y se quedan puestas. La base se
       apaga en espejo: las dos capas son la misma mesa y encimadas al 100%
       se notaría cualquier desfase. */
    var burb = Math.max(0, Math.sin(5 * PI * t)) * (1 - e) + e;
    if (est.burbujas) est.burbujas.style.opacity = burb.toFixed(3);
    if (est.base) est.base.style.opacity = (1 - burb).toFixed(3);
    // El humo nace en la boca de la probeta alta (su origen) y sube creciendo.
    if (est.humo) {
      est.humo.style.opacity = Math.min(1, 1.8 * t).toFixed(3);
      est.humo.style.transform = 'translateY(' + px(30 - 50 * e) + ') scale(' + (0.55 + 0.5 * e).toFixed(4) + ')';
    }

    var tc = clamp((t - 0.18) / 0.82, 0, 1);
    brota(tar[5], tc, { x: P.x + 125, y: P.y + 20 }, geo.centros[5], -9, 1);
  }

  /* --- 6.3 El hidrante (tarjeta 2) ---------------------------------------- */

  function estacionHidrante(fin, sHid, ahora) {
    var P = ancla(est.hidrante, sHid, -1059);
    ancla(est.agua, sHid, -1059);
    var t = reloj('hid', fin >= sHid - 150, ahora);
    var e = smoothstep(t);

    // El scaleX(-1) va DENTRO del transform animado, si no el chorro sale al revés.
    if (est.agua) {
      est.agua.style.opacity = Math.min(1, 1.6 * e).toFixed(3);
      est.agua.style.transform = 'scaleX(-1) scale(' + (0.25 + 0.45 * e).toFixed(4) + ')';
    }

    // Entra empujada horizontalmente por el agua.
    brota(tar[2], t, { x: P.x - 26, y: P.y + 26 }, geo.centros[2], 12, 1);
  }

  /* --- 6.5 La cámara, el flash y la tarjeta 4 ----------------------------- */

  function estacionCamara(fin, sCam, ahora) {
    var t = reloj('cam', fin >= sCam, ahora); // dispara al ENTRAR a la última vuelta
    var e = smoothstep(t);

    var golpe = Math.sin(Math.min(1, 3.2 * t) * PI);
    if (est.camara) {
      est.camara.style.transform = 'rotate(' + deg(-5 * golpe) + ') scale(' + (1 + 0.05 * golpe).toFixed(4) + ')';
    }

    // Un golpe seco que se abre y se asienta.
    if (est.flash) {
      var sp = smoothstep(Math.min(1, 5 * t));
      est.flash.style.opacity = Math.min(1, 6 * t).toFixed(3);
      est.flash.style.transform = 'rotate(' + deg(-28 + 28 * e) + ') scale(' + (0.15 + 1.05 * sp - 0.2 * e).toFixed(4) + ')';
    }

    // La foto, un pelín después del disparo, desde el centro del destello.
    var tc = clamp((t - 0.22) / 0.78, 0, 1);
    brota(tar[4], tc, { x: 407, y: 3832 }, geo.centros[4], -8, 1);
  }

  /* --- 7. El remate: el rollo, atado al scroll (no a un reloj) -----------
     Corre sobre la fase del remate (rB, el 20% final del scroll), con el
     perro ya escondido. En la primera mitad solo baja la cámara hasta el
     bote, que está quieto desde el CSS (tamaño final, visible, sin caída:
     el bote no se anima a propósito, lo único que se mueve es la cinta), y
     en la segunda mitad sale la cinta. */
  function remateRollo(r) {
    if (!rollo.grupo) return;

    /* La cinta sale del bote con la lengüeta por delante: la tira entera se
       desliza desde adentro (translateX) y la boca (.prollo__salida, un
       overflow fijo en la tapa gris del bote) esconde la parte que "sigue
       dentro". Nada de clip-path aquí: con él Chrome colgaba una raya negra
       de 1px de la lengüeta en ciertas posiciones subpíxel (ver el CSS). */
    var des = clamp((r - 0.5) / 0.5, 0, 1);
    rollo.abierto = des >= 1;
    if (rollo.tira) {
      var dentro = 1 - suave5(des);
      rollo.tira.style.transform = 'translateX(' + px(-722 * dentro) + ')';
    }
  }

  /* --- El carrusel del rollo ------------------------------------------------
     Lo mueve el scroll: en la tercera fase (rC) la escena está quieta y las
     fotos van saliendo del bote hacia la derecha, una vuelta (la mitad del
     track) a lo largo de la fase. El arrastre con mouse o dedo suma un
     ajuste manual encima (offMano), sin inercia.

     La cinta es finita, como un rollo de verdad: en reposo el track está
     corrido a la izquierda para que la ÚLTIMA foto termine en FIN_FOTOS y
     la lengüeta salga del bote en negro — antes el track empezaba en el
     bote y, como sigue hasta el infinito por la derecha, siempre había una
     foto metida en la punta desde el primer píxel de cinta. Por eso ya no
     se envuelve con módulo (un ciclo infinito no puede tener punta vacía):
     el desplazamiento se acota entre el reposo (o = O0) y el track entero
     pasado hacia la punta (o = 0). Los deltas del puntero llegan en px de
     pantalla: se dividen por el zoom del lienzo y la escala del grupo. */
  function initArrastre() {
    var pista = rollo.pista;
    if (!pista) return;
    var PASO_F = 240;          // 226 + 14
    var LARGO = PASO_F * pista.children.length;
    var VUELTA = PASO_F * Math.max(1, Math.floor(pista.children.length / 2));
    var O0 = Math.max(0, LARGO - FIN_FOTOS);
    rollo.vuelta = VUELTA;

    function aplica() {
      var off = arrastre.offScroll + arrastre.offMano;
      var o = clamp(O0 + off, 0, O0);
      pista.style.transform = 'translate3d(' + px(-o) + ',0,0)';
    }
    rollo.aplica = aplica;

    pista.addEventListener('pointerdown', function (ev) {
      if (ev.button) return;
      arrastre.activo = true;
      arrastre.x0 = ev.clientX;
      arrastre.off0 = arrastre.offMano;
      pista.classList.add('is-arrastrando');
      if (pista.setPointerCapture) pista.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    pista.addEventListener('pointermove', function (ev) {
      if (!arrastre.activo) return;
      var k = geo.escV * arrastre.escala * (geo.esc || 1);
      arrastre.offMano = arrastre.off0 - (ev.clientX - arrastre.x0) / k;
      aplica();
    });
    function suelta() {
      arrastre.activo = false;
      pista.classList.remove('is-arrastrando');
    }
    pista.addEventListener('pointerup', suelta);
    pista.addEventListener('pointercancel', suelta);
    pista.addEventListener('lostpointercapture', suelta);
    pista.addEventListener('dragstart', function (ev) { ev.preventDefault(); });
    aplica();
  }

  /* Fase del carrusel: el scroll saca las fotos del bote. Un off negativo
     mueve el track a la derecha, así los fotogramas nuevos asoman por
     debajo del bote y viajan hacia la punta (y la lengüeta, que empezó
     vacía, se va llenando conforme llegan). */
  function carruselPorScroll(rC) {
    if (!rollo.aplica) return;
    arrastre.offScroll = -rC * rollo.vuelta;
    rollo.aplica();
  }

  /* --- Arranque ------------------------------------------------------------ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  document.addEventListener('shopify:section:load', function () {
    var viejo = document.querySelector('[data-paseo]');
    if (viejo) delete viejo.dataset.paseoListo;
    init();
  });
})();
