/* ==========================================================================
   BUNGOT 2026 — conocenos.js  (la historia como un paseo)

   Un salchicha larguísimo recorre el zigzag del lienzo 1582×5470. El cuerpo
   es una hélice (slinky) muestreada sobre el path; cabeza y cola son PNGs
   que giran con la tangente. Al pasar la cabeza por cada parada, esa parada
   dispara su reloj (1000 ms de ida, 420 ms de vuelta) y de su objeto nace
   la tarjeta.

   Reglas de rendimiento que no hay que romper:
   · El path se muestrea UNA vez cada 6px a una tabla; getPointAtLength por
     frame cuesta cientos de ms.
   · La geometría de la pista se mide fuera del bucle (mount, resize,
     ResizeObserver); dentro del frame solo se lee scrollY.
   · Un solo requestAnimationFrame global + repintado síncrono en scroll y
     resize como respaldo (con el rAF congelado el perro quedaría sin
     colocar). El frame corta temprano si el scroll no se movió y ningún
     reloj está a media animación.

   Se auto-inicializa y no hace nada si el markup no está.
   ========================================================================== */
(function () {
  'use strict';

  var MUNDO_W = 1582;
  var MUNDO_H = 5470;
  var PASO = 6;            // separación de la tabla de puntos, en px de curva
  var LAM = 44;            // paso de la hélice
  var AMP = 34;            // radio de la hélice
  var ATRAS = LAM * 0.42;  // el retroceso que hace leer al cuerpo como resorte
  var S_COLA = 70;         // la cola arranca aquí; la cabeza está en p·L
  var DOSPI = Math.PI * 2;

  /* --- Escenografía: posiciones en px del mundo ---------------------------
     [left, top, ancho] de cada pieza. Las paradas llevan su punto de
     disparo (cerca del camino) y de dónde brota la tarjeta. Mover una
     parada = cambiar estos números; el s del camino se recalcula solo
     porque las coordenadas viajan dentro de la llave del memo. */
  var PROPS = {
    casita:   [800, 100, 300],
    pelota:   [0, 0, 64],
    bote:     [235, 1315, 190],
    tapa:     [243, 1277, 175],
    platano:  [290, 1330, 110],
    mesa:     [1080, 1430, 260],
    mesa2:    [1072, 1452, 260],
    humo:     [980, 1210, 190],
    hidrante: [700, 2230, 200],
    agua:     [854, 2176, 280],
    camara:   [640, 2932, 250],
    flash:    [696, 2914, 210]
  };

  var PARADAS = [
    { nombre: 'casita',   trig: [950, 405],   home: [140, 500],  origen: [1105, 355], giro: -10 },
    { nombre: 'bote',     trig: [160, 1531],  home: [560, 1080], origen: [245, 1370], giro: 10 },
    { nombre: 'pruebas',  trig: [1210, 1800], home: [250, 1860], origen: [1070, 1260], giro: -10 },
    { nombre: 'hidrante', trig: [790, 2425],  home: [920, 2520], origen: [880, 2320], giro: 8 },
    { nombre: 'camara',   trig: [770, 3105],  home: [950, 3270], origen: [835, 2950], giro: -8 },
    { nombre: 'cierre',   trig: [560, 4450],  home: [511, 4620], origen: [791, 4900], giro: 0 }
  ];

  var root, pista, ventana, lienzo, mundo, lomo, comic1, comic2;
  var el = {};      // props por nombre
  var cards = [];   // tarjetas por índice de parada
  var cabeza, cola;

  var pts = [];     // tabla [[x,y],…] cada 6px de curva
  var preY = [];    // suma acumulada de y, para promediar sin recorrer
  var L = 0;

  var memoS = {};   // 'bote@160,1531' → s del punto más cercano del camino
  var relojes = {}; // clave → { v: 0..1 }

  var geo = { listo: false, pistaTop: 0, rango: 1, va: 0, k: 1 };
  var estatico = false;
  var activo = false;
  var pAntes = -1;
  var animando = false;
  var sucio = true;
  var ultima = 0;
  var rafId = 0;

  /* --- Utilería ---------------------------------------------------------- */

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function suave(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

  function puntoEn(s) {
    var f = clamp(s, 0, L) / PASO;
    var i = Math.min(pts.length - 2, Math.floor(f));
    var t = f - i;
    var a = pts[i], b = pts[i + 1];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  function tangEn(s) {
    var i = clamp(Math.round(s / PASO), 1, pts.length - 2);
    var a = pts[i - 1], b = pts[i + 1];
    var dx = b[0] - a[0], dy = b[1] - a[1];
    var m = Math.hypot(dx, dy) || 1;
    return [dx / m, dy / m];
  }

  function sDe(nombre, x, y) {
    var clave = nombre + '@' + x + ',' + y;
    if (memoS[clave] == null) {
      var mejor = 0, dist = Infinity;
      for (var i = 0; i < pts.length; i++) {
        var dx = pts[i][0] - x, dy = pts[i][1] - y;
        var d = dx * dx + dy * dy;
        if (d < dist) { dist = d; mejor = i; }
      }
      memoS[clave] = mejor * PASO;
    }
    return memoS[clave];
  }

  /* Promedio de la altura del camino en [s0, s1]: sin él, el vaivén de las
     vueltas en U haría temblar el encuadre de la cámara. */
  function yMedia(s0, s1) {
    var i = clamp(Math.round(s0 / PASO), 0, pts.length - 1);
    var j = clamp(Math.round(s1 / PASO), 0, pts.length - 1);
    if (j <= i) return pts[i][1];
    return (preY[j] - preY[i]) / (j - i);
  }

  /* Reloj por parada: 1000 ms de ida, 420 ms de vuelta, arrancando desde
     donde iba — cambiar de sentido a media animación no salta. */
  function reloj(clave, dentro, dt) {
    var r = relojes[clave] || (relojes[clave] = { v: 0 });
    var antes = r.v;
    if (estatico) { r.v = 1; return 1; }
    r.v = dentro ? Math.min(1, r.v + dt / 1000) : Math.max(0, r.v - dt / 420);
    if (r.v !== antes) animando = true;
    return r.v;
  }

  /* --- Montaje ------------------------------------------------------------ */

  function init() {
    root = document.querySelector('[data-paseo]');
    if (!root || root.dataset.paseoListo) return;
    root.dataset.paseoListo = '1';

    pista = root.querySelector('[data-pista]');
    ventana = root.querySelector('[data-ventana]');
    lienzo = root.querySelector('[data-lienzo]');
    mundo = root.querySelector('[data-mundo]');
    lomo = root.querySelector('[data-lomo]');
    comic1 = root.querySelector('[data-comic="1"]');
    comic2 = root.querySelector('[data-comic="2"]');
    cabeza = root.querySelector('[data-dachs-cabeza]');
    cola = root.querySelector('[data-dachs-cola]');

    root.querySelectorAll('[data-prop]').forEach(function (n) {
      el[n.dataset.prop] = n;
    });
    root.querySelectorAll('.paseo__mundo [data-card]').forEach(function (n) {
      cards[+n.dataset.card] = n;
    });

    var ref = root.querySelector('[data-camino-ref]');
    if (!ref || !lomo || !pista) return;

    // La tabla se muestrea una sola vez; todo lo demás interpola sobre ella.
    L = ref.getTotalLength();
    var n = Math.ceil(L / PASO);
    var acum = 0;
    for (var i = 0; i <= n; i++) {
      var q = ref.getPointAtLength(Math.min(i * PASO, L));
      pts.push([q.x, q.y]);
      preY.push(acum);
      acum += q.y;
    }
    preY.push(acum);

    colocar();
    decidir();

    window.addEventListener('resize', function () { decidir(); medir(); pintar(); });
    window.addEventListener('scroll', function () { if (activo && !estatico) pintar(); }, { passive: true });
    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { medir(); pintar(); }).observe(pista);
    }
    var mm = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mm.addEventListener) mm.addEventListener('change', decidir);
    window.addEventListener('load', function () { medir(); pintar(); });
  }

  function colocar() {
    Object.keys(PROPS).forEach(function (nombre) {
      var pieza = el[nombre];
      if (!pieza) return;
      pieza.style.left = PROPS[nombre][0] + 'px';
      pieza.style.top = PROPS[nombre][1] + 'px';
      pieza.style.width = PROPS[nombre][2] + 'px';
    });
    PARADAS.forEach(function (par, i) {
      if (!cards[i]) return;
      cards[i].style.left = par.home[0] + 'px';
      cards[i].style.top = par.home[1] + 'px';
    });
    // El hidrante mira al revés: el chorro debe empujar hacia la derecha.
    if (el.hidrante) el.hidrante.style.transform = 'scaleX(-1)';
  }

  function decidir() {
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var angosto = window.innerWidth < 900;
    activo = !reduce && !angosto;
    estatico = activo && root.hasAttribute('data-sin-animar');
    root.classList.toggle('paseo--activo', activo);
    root.classList.toggle('paseo--estatico', estatico);
    if (activo) {
      medir();
      sucio = true;
      pintar();
      if (!estatico && !rafId) rafId = requestAnimationFrame(cuadro);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  /* Geometría fuera del bucle: leer layout por frame es lo que tiembla. */
  function medir() {
    if (!activo) return;
    var r = pista.getBoundingClientRect();
    geo.pistaTop = r.top + window.scrollY;
    geo.va = ventana.offsetHeight || window.innerHeight;
    geo.rango = Math.max(1, pista.offsetHeight - geo.va);
    geo.k = Math.min(1, (ventana.offsetWidth || window.innerWidth) / MUNDO_W);
    mundo.style.zoom = geo.k;
    geo.listo = true;
    sucio = true;
  }

  function cuadro() {
    rafId = requestAnimationFrame(cuadro);
    pintar();
  }

  /* --- El frame ----------------------------------------------------------- */

  function pintar() {
    if (!geo.listo || !activo) return;
    var ahora = performance.now();
    var dt = Math.min(80, ahora - ultima);
    ultima = ahora;

    var p = estatico ? 1 : clamp((window.scrollY - geo.pistaTop) / geo.rango, 0, 1);
    if (Math.abs(p - pAntes) < 0.0004 && !animando && !sucio) return;
    sucio = false;
    animando = false;
    pAntes = p;

    var sCab = clamp(Math.max(180, p * L), 180, L);

    /* Relojes de las paradas: disparan cuando la cabeza pasa su punto del
       camino y rebobinan si el usuario sube. */
    var u = PARADAS.map(function (par) {
      var s = sDe(par.nombre, par.trig[0], par.trig[1]);
      return reloj(par.nombre + '@' + par.trig[0] + ',' + par.trig[1], sCab >= s, dt);
    });

    dibujarPerro(sCab, u[0]);
    if (!estatico) camara(p, sCab);

    parada1(u[0]);
    parada2(u[1]);
    parada3(u[2]);
    parada4(u[3]);
    parada5(u[4]);
    parada6(u[5]);
  }

  /* --- El perro ------------------------------------------------------------
     El cuerpo no es una línea sobre el camino: es una hélice muestreada a lo
     largo de él. Para cada ángulo th se avanza s por el paso, se retrocede
     atras·sin(th) (eso lo hace leer como resorte y no como círculos
     amontonados) y se desplaza amp·cos(th) por la perpendicular. */
  function dibujarPerro(sCab, uCasita) {
    var Th = DOSPI * (sCab - S_COLA) / LAM;
    var dth = Math.PI / 9;
    var d = [];
    for (var th = 0; ; th += dth) {
      if (th > Th) th = Th;
      var s = S_COLA + (th / DOSPI) * LAM - ATRAS * Math.sin(th);
      var q = puntoEn(s);
      var i = clamp(Math.round(s / PASO), 1, pts.length - 2);
      var ax = pts[i + 1][0] - pts[i - 1][0];
      var ay = pts[i + 1][1] - pts[i - 1][1];
      var m = Math.hypot(ax, ay) || 1;
      var off = AMP * Math.cos(th);
      var x = q[0] + (-ay / m) * off;
      var y = q[1] + (ax / m) * off;
      d.push((d.length ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1));
      if (th >= Th) break;
    }
    lomo.setAttribute('d', d.join(''));

    // Cola: fija al arranque del camino, girada con la tangente.
    var pc = puntoEn(S_COLA);
    var tc = tangEn(S_COLA);
    cola.style.width = '190px';
    cola.style.transformOrigin = '160px 105px';
    cola.style.transform = 'translate3d(' + (pc[0] - 160).toFixed(1) + 'px,' + (pc[1] - 105).toFixed(1) + 'px,0) rotate(' + Math.atan2(tc[1], tc[0]).toFixed(4) + 'rad)';

    /* Cabeza: la nariz siempre apunta hacia donde va (gira, nunca se
       voltea). Al pasar la casita voltea −20° con una campana gaussiana. */
    var ph = puntoEn(sCab);
    var th2 = tangEn(sCab);
    var ang = Math.atan2(th2[1], th2[0]);
    var sCasa = sDe('casita', PARADAS[0].trig[0], PARADAS[0].trig[1]);
    var campana = Math.exp(-Math.pow((sCab - sCasa) / 300, 2));
    ang += (-20 * Math.PI / 180) * campana;
    cabeza.style.width = '228px';
    cabeza.style.transformOrigin = '46px 95px';
    cabeza.style.transform = 'translate3d(' + (ph[0] - 46).toFixed(1) + 'px,' + (ph[1] - 95).toFixed(1) + 'px,0) rotate(' + ang.toFixed(4) + 'rad)';
  }

  /* --- La cámara -----------------------------------------------------------
     Persigue a la cabeza con retraso, promediando la altura del camino en
     ±900px; en el último 7% termina de bajar hasta el pie del lienzo para
     que el cierre quede en cuadro. */
  function camara(p, sCab) {
    var yPerro = yMedia(sCab - 900, sCab + 900) * geo.k;
    var meta = Math.min(-80, geo.va * 0.72 - yPerro);
    var piso = geo.va - MUNDO_H * geo.k;
    if (p > 0.93) {
      var e = suave((p - 0.93) / 0.07);
      meta = meta * (1 - e) + piso * e;
    }
    meta = Math.max(meta, piso);
    lienzo.style.transform = 'translate3d(0,' + meta.toFixed(2) + 'px,0)';
  }

  /* --- Tarjetas: todas brotan del objeto que las produce ------------------ */
  function brotar(i, uu) {
    var card = cards[i];
    if (!card) return;
    var par = PARADAS[i];
    if (uu <= 0) { card.style.visibility = 'hidden'; return; }
    card.style.visibility = 'visible';
    var e = suave(uu);
    var dx = (par.origen[0] - (par.home[0] + 280)) * (1 - e);
    var dy = (par.origen[1] - (par.home[1] + 220)) * (1 - e);
    var esc = 0.03 + 0.97 * e;
    var rot = par.giro * (1 - e);
    card.style.opacity = Math.min(1, uu * 5);
    card.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) scale(' + esc.toFixed(3) + ') rotate(' + rot.toFixed(2) + 'deg)';
  }

  /* Parada 1 — la casita: la pelota da tres arcos decrecientes camino
     adelante y dos líneas de historieta trazan el tramo recién recorrido. */
  function parada1(u) {
    var sT = sDe('casita', PARADAS[0].trig[0], PARADAS[0].trig[1]);
    var pel = el.pelota;
    if (pel) {
      if (u <= 0) {
        pel.style.visibility = 'hidden';
      } else {
        pel.style.visibility = 'visible';
        var sB = sT + 430 * u;
        var q = puntoEn(sB);
        var h = Math.abs(Math.sin(u * 3 * Math.PI)) * (1 - u * 0.75) * 110;
        pel.style.transform = 'translate3d(' + (q[0] - 32).toFixed(1) + 'px,' + (q[1] - 58 - h).toFixed(1) + 'px,0) rotate(' + (u * 540).toFixed(1) + 'deg)';
        PARADAS[0].origen = [q[0], q[1] - 60];
      }
      trazarComic(sT, sT + 430 * suave(u), u);
    }
    brotar(0, u);
  }

  function trazarComic(s0, s1, u) {
    if (u <= 0.02) { comic1.setAttribute('d', ''); comic2.setAttribute('d', ''); return; }
    var d1 = [], d2 = [];
    for (var s = s0; s <= s1; s += 24) {
      var q = puntoEn(s);
      var t = tangEn(s);
      var nx = -t[1], ny = t[0];
      if (ny > 0) { nx = -nx; ny = -ny; } // siempre del lado de arriba
      d1.push((d1.length ? 'L' : 'M') + (q[0] + nx * 20).toFixed(1) + ' ' + (q[1] + ny * 20).toFixed(1));
      d2.push((d2.length ? 'L' : 'M') + (q[0] + nx * 38).toFixed(1) + ' ' + (q[1] + ny * 38).toFixed(1));
    }
    comic1.setAttribute('d', d1.join(''));
    comic2.setAttribute('d', d2.join(''));
  }

  /* Parada 2 — el bote: el perro lo tumba −82°; la tapa rueda hacia el lado
     libre (su desplazamiento se rota por el ángulo del bote, para que la
     trayectoria se vea en el mundo y no en el sistema del bote) y el
     plátano sale en arco girando −400°. */
  function parada2(u) {
    var eBote = suave(Math.min(1, u * 1.6));
    var ang = -82 * eBote;
    if (el.bote) {
      el.bote.style.transformOrigin = '18px 168px';
      el.bote.style.transform = 'rotate(' + ang.toFixed(2) + 'deg)';
    }
    if (el.tapa) {
      var e2 = suave(u);
      var rad = ang * Math.PI / 180;
      var dx = -250 * e2, dy = -90 * Math.sin(e2 * Math.PI);
      var rx = dx * Math.cos(rad) - dy * Math.sin(rad);
      var ry = dx * Math.sin(rad) + dy * Math.cos(rad);
      el.tapa.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0) rotate(' + (-520 * e2).toFixed(1) + 'deg)';
    }
    if (el.platano) {
      var e3 = suave(clamp((u - 0.15) / 0.85, 0, 1));
      el.platano.style.opacity = u > 0.15 ? 1 : 0;
      el.platano.style.transform = 'translate3d(' + (260 * e3).toFixed(1) + 'px,' + (-300 * e3 + 680 * e3 * e3).toFixed(1) + 'px,0) rotate(' + (-400 * e3).toFixed(1) + 'deg)';
    }
    brotar(1, clamp((u - 0.2) / 0.8, 0, 1));
  }

  /* Parada 3 — pruebas: la mesa tiembla 1.6°, las burbujas parpadean tres
     veces y se quedan, sube el humo y del humo nace la tarjeta. */
  function parada3(u) {
    var tiembla = 1.6 * Math.sin(u * 5 * Math.PI) * (1 - u);
    var giro = 'rotate(' + tiembla.toFixed(2) + 'deg)';
    var quieta = u >= 0.93;
    var muestra2 = (Math.floor(u * 7) % 2 === 1) || quieta;
    if (el.mesa) {
      el.mesa.style.transformOrigin = '50% 100%';
      el.mesa.style.transform = giro;
      el.mesa.style.opacity = muestra2 ? 0 : 1;
    }
    if (el.mesa2) {
      el.mesa2.style.transformOrigin = '50% 100%';
      el.mesa2.style.transform = giro;
      el.mesa2.style.opacity = muestra2 ? 1 : 0;
    }
    if (el.humo) {
      var e = suave(u);
      el.humo.style.transformOrigin = '50% 90%';
      el.humo.style.opacity = Math.min(1, u * 1.8);
      el.humo.style.transform = 'translate3d(0,' + ((1 - e) * 70).toFixed(1) + 'px,0) scale(' + (0.5 + 0.5 * e).toFixed(3) + ')';
    }
    brotar(2, clamp((u - 0.25) / 0.75, 0, 1));
  }

  /* Parada 4 — el hidrante (volteado con scaleX(-1)): el chorro crece de
     0.25 a 0.70 y empuja la tarjeta hacia la derecha. */
  function parada4(u) {
    if (el.agua) {
      var e = suave(u);
      el.agua.style.transformOrigin = '4% 65%';
      el.agua.style.opacity = u > 0.02 ? 1 : 0;
      el.agua.style.transform = 'scale(' + (0.25 + 0.45 * e).toFixed(3) + ')';
    }
    brotar(3, clamp((u - 0.1) / 0.9, 0, 1));
  }

  /* Parada 5 — la cámara da un golpe de −5°, el flash sale del visor
     (0.15→1.2, girando −28°→0) y la foto brota del flash con retraso. */
  function parada5(u) {
    if (el.camara) {
      el.camara.style.transformOrigin = '50% 80%';
      el.camara.style.transform = 'rotate(' + (-5 * Math.sin(Math.min(1, u * 2) * Math.PI)).toFixed(2) + 'deg)';
    }
    if (el.flash) {
      var e = suave(Math.min(1, u * 1.3));
      el.flash.style.transformOrigin = '66% 27%';
      el.flash.style.opacity = u > 0.02 ? 1 : 0;
      el.flash.style.transform = 'scale(' + (0.15 + 1.05 * e).toFixed(3) + ') rotate(' + (-28 + 28 * e).toFixed(1) + 'deg)';
    }
    brotar(4, clamp((u - 0.22) / 0.78, 0, 1));
  }

  /* Parada 6 — el cierre: estático y centrado, solo brota y se queda. */
  function parada6(u) {
    brotar(5, u);
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
