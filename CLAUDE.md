# CLAUDE.md — BUNGOT 2026

Guía para trabajar en este proyecto. Léela antes de tocar código.

## Qué es esto

Tema de **Shopify Online Store 2.0** para **BUNGOT**, una marca mexicana de premios y snacks naturales para perros (también gatos, huesos y juguetes). Tono juguetón, cálido y colorido — nada de plantilla genérica de e-commerce.

- **Tienda:** `e30306-22.myshopify.com` (dominio `bungot.com`) · precios en **MXN**.
- **Idioma:** todo el copy y los comentarios en **español de México (tú)**. No uses voseo argentino ("vos/usá/dejás") aunque encuentres código viejo escrito así.

## Stack y filosofía

- **Liquid + CSS vanilla + JS vanilla.** Sin frameworks, sin build step, sin dependencias. Si algo se puede hacer con CSS, no metas JS.
- **Cada sección es autónoma.** `theme.js` (y cada `*.js` de página) auto-inicializa cada bloque solo si su markup está presente (`if (!el) return;`), así se puede borrar cualquier sección desde el customizer sin romper el resto. Mantén ese patrón.
- **Todo configurable desde el customizer.** Colores, textos e imágenes viven en `settings` / `section.settings` / `block.settings`, no hardcodeados.
- **La única pieza con servidor** es el worker de Cloudflare en `app-ficha/` (ver *Cuentas y ficha del perro*). Todo lo demás es tema puro.

## Comandos y flujo de trabajo

```bash
git pull               # SIEMPRE antes de trabajar: el customizer regresa como commits del bot de Shopify
shopify theme dev      # levantar en local con hot reload (sirve /pages/contact, no /pages/contacto, etc.)
shopify theme check    # linter de Liquid/tema (córrelo antes de dar por hecho un cambio)
cd app-ficha && npx wrangler deploy   # solo si tocaste el worker (login de wrangler ya hecho en esta máquina)
```

Este proyecto **sí** es un repo git (rama `main`, remoto `joacogm12/bungot-2026`) y está
**conectado a Shopify** con la integración de GitHub: el tema **"bungot-2026/main"** se
actualiza solo con cada push, y los cambios del customizer regresan como commits del bot
de Shopify. **El deploy es commit + push.** No uses `theme push` contra el tema conectado
ni force-push a `main`. El tema "BUNGOT 2026 (prueba)" quedó como respaldo congelado de
antes de la conexión.

### Fallas de upload que `theme check` NO detecta

Si `theme dev` responde 500 "Failed to Upload Theme Files" en todas las páginas, revisa esto antes que nada (la página del error dice qué archivo es):

1. **Llave literal dentro de `{{ }}`** — algo como `{{ 'clave' | t: amount: '{amount}' }}` truena con "Variable was not properly terminated". Para placeholders que sustituye JS usa corchetes: `[amount]`, `[pieces]` (así está el blob i18n de `cart-recibo.liquid`).
2. **BOM en JSON** — `Set-Content` / `Out-File -Encoding utf8` en Windows PowerShell 5.1 escriben UTF-8 con BOM y Shopify responde "JSON inválido en templates/*.json". Escribe JSON del tema con la herramienta Write o con `printf`/heredoc de bash, nunca con Set-Content.

Si el server se quedó trabado con un upload viejo, mata el node del puerto 9292 y relanza `theme dev`.

## Estructura

```
layout/theme.liquid        Shell HTML: <head>, preloads de fuentes, base.css, header/footer groups,
                           window.BUNGOT (usuario, fichaServidor, fichaApi con firma HMAC) y theme.js
sections/*.liquid          Secciones (cada una con su {% schema %} al final)
                           + header-group.json / footer-group.json (grupos de sección del layout)
snippets/*.liquid          Parciales: product-card, banda-card, card-color, cart-linea, dog-avatar,
                           avatar-picker, ficha-campos, account-nav, account-url, account-modal,
                           font-face, meta-tags, pup-illustration, wave-edge
templates/*.json           Plantillas OS2.0: index, product, product.juguete, product.caja,
                           product.suscripcion, collection, cart, page,
                           page.conocenos, page.contacto, page.mi-perro, page.mis-pedidos,
                           page.mis-direcciones, page.crear-cuenta, search, 404
templates/customers/*.json login/register/account/addresses/order — existen pero NO se renderizan
                           (cuentas nuevas de Shopify, ver abajo)
templates/*.liquid         Fallbacks sin migrar (article, blog, list-collections) — pásalos a .json si los tocas
assets/                    base.css + theme.js (globales) · un par css/js por página custom (ver abajo)
                           · fuentes .woff2 · imágenes .webp/.png/.gif
config/settings_schema.json  Ajustes globales (Marca, Colores, Tarjetas, Social, whatsapp_numero…)
config/settings_data.json    Valores guardados (lo escribe el customizer)
locales/es.default.json    Todos los textos de UI (filtro | t)
app-ficha/                 Worker de Cloudflare (worker.js, wrangler.toml, README.md) — la ficha del perro
pantones/                  Hojas pantone de la marca (referencia, no se sirven)
pg_web/                    Fuente de contenido: docx de textos (Conócenos, productos), SVG del paseo, íconos
inspiracion/               Briefs y referencias (no es código del tema)
fotos/                     Fotos fuente sin procesar (gitignored, no es asset)
```

**Material de referencia en la raíz que NO es parte del tema** (no lo edites como si fuera código, no lo subas):
`BUNGOT_logo_vector.svg`, `Informacion de etiquetas.xlsx`, `*.zip` (gitignored). Los exports y handoffs viejos (`home2/3/4.html`, `ficha2.html`, `BUNGOT Portada.dc.html`, `7-*.md`, `8-*`) se borraron en la limpieza de 2026-08-18; si hace falta alguno está en el historial de git.

### Páginas custom: una sección full-bleed + su CSS/JS propio

Las páginas grandes NO usan las secciones `main-*` genéricas: cada una es **una sección propia** que carga su hoja y su script con `asset_url` desde el propio Liquid, y **todo su CSS va scopeado bajo una clase raíz** para no pisar `base.css`:

| Página | Plantilla | Sección | Assets | Scope |
|---|---|---|---|---|
| Landing | `index.json` | hero, favoritos (foto + caja de texto "Ver producto"; el bloque "panel" de Juguetes lleva chip + párrafo + botón), statement, feature-panel, conocenos-bonche (bonche de 10 fotos que se dispersa + titular/CTA a Conócenos; se ajusta con ?acomodar), full-photo | base.css / theme.js | — |
| Catálogo | `collection.json` | `collection-bandas` (bandas por familia, collection-driven; padding lateral vía `--pg-pad` — 63/40/28/20 por corte —, en teléfono el perro del carrito sube arriba del título y en teléfono acostado las tarjetas se escalan al 62%; el bloque `suscripcion` (el tipo conserva el nombre viejo) pinta el **panel de entrada a las cajas prearmadas** arriba de las bandas y es **el mismo `.fpanel` de la landing** —solo `.fpanel--catalogo` en `productos.css` cambia el marco a `--pg-pad`—, con `order: -1` porque el filtro sube bandas con `order: 0`; el CTA con link vacío ancla a la banda de cajas de la misma página (`#banda-cajas`, familia `cajas`), después cae al producto del ajuste global `caja_product` —grupo *Suscripción*, en pausa— y al final a `/#suscripcion`, ancla que expone `feature-panel` vía su ajuste `anchor`. Desde 2026-09-01 el panel del catálogo va en **azul `#2E5FA0`** (el del bonche; el de la portada sigue naranja) y su gráfico lo elige el ajuste `art` del bloque: `sticker` (el perro en el kayak, `bungot-sticker-kayak.png`, `.fpanel__sticker` en `base.css`, **sin `data-peel` a propósito**: el panel es lo primero del catálogo y el peel por scroll lo dejaría medio tapado de gris en la primera pantalla) o `bici` (el repartidor de la portada)) | productos.css/js | `.pgal` |
| PDP | `product.json`, `product.juguete.json`, `product.caja.json`, `product.suscripcion.json` | `producto-bungot` (split fijo 50/50, cinturón, cruzada; la plantilla de las cajas prearmadas trae acordeones/beneficios de caja con stepper y cruzada prendidos; la de suscripción —asignada a la Caja BUNGOT, hoy en borrador— apaga el stepper de cantidad y la venta cruzada con los ajustes `show_stepper` / `show_cross` y trae acordeones y cinturón propios de la suscripción, nada de ingredientes/cuidados/envíos) | producto.css/js | `.pdpage` |
| Carrito | `cart.json` | `cart-recibo` (recibo de papel, sugeridos, /cart/change.js; responsive con cortes 900 · 760 · 430 · 389 — el 389 NO es redundante, ver los comentarios de `carrito.css` —: título y total en `clamp`, miniatura de 92 en todos los anchos, ≤430 la línea es retícula con áreas y la ✕ absoluta, ≤389 los controles vuelven al renglón completo; el "· $ c/u" viaja en `.rlinea__unit` con `&nbsp;` porque el JS reescribe `[data-rc-unit]`; la sombra es `drop-shadow` —nunca `box-shadow`— y nada dentro del recibo lleva `border-radius` salvo el sello) | carrito.css/js | `.rcpage` |
| Contacto | `page.contacto.json` | `contacto` | contacto.css/js | `.ctpage` |
| Conócenos | `page.conocenos.json` | `conocenos-paseo` (el paseo del salchicha: lienzo fijo 1582×5650 escalado con `zoom`, riel de 17000px + ventana sticky + escena que mueve JS; tres fases de scroll `FASE_*` — perro, remate del rollo, carrusel por scroll —; posiciones fijas en el CSS, anclajes al camino en el JS; el recorrido corre en **todo ancho >640 de marco** (el JS publica el factor del zoom en `--paseo-zoom` y entre 641–900 el CSS contraescala la copia de tarjetas y bajada con `calc(px / var(--paseo-zoom))`); **abajo de 640 de marco** `medirPista()` pone `.paseo--vertical` — derivada de la MEDICIÓN, nunca de un matchMedia, porque el media query mide el viewport con barra de scroll y el marco sin ella — que activa el modo plano y el CSS re-maqueta en columna: solo las 5 tarjetas en orden narrativo (sin camino ni utilería) y el rollo como tira con scroll nativo) | conocenos-paseo.css/js | `.paseo` |
| Cuenta | `page.mi-perro/mis-pedidos/mis-direcciones/crear-cuenta.json` | `cuenta-perro`, `cuenta-pedidos`, `cuenta-direcciones`, `cuenta-registro`, `cuenta-login` | cuenta.css/js (**los carga el header** en todas las páginas) | `.cpage` |

- De las secciones `main-*` genéricas solo quedan `main-page`, `main-search` y `main-404` (las usan `page.json`, `search.json` y `404.json`). `main-collection`, `main-product`, `main-cart`, `product-grid` y las secciones de landing que ya no se montaban (`announcement-marquee`, `benefits`, `cta-closer`, `newsletter`, `product-carousel`, `testimonials`, `wave`, `word-marquee`) se borraron junto con su CSS/JS. Antes de borrar cualquier otra, `grep` en `templates/`, `sections/*-group.json` y `config/settings_data.json`.
- El patrón para una página nueva es el mismo: sección → `assets/mipagina.css` + `assets/mipagina.js` cargados desde la sección → clase raíz propia → nada de nav ni footer adentro.
- Los productos **juguete** llevan plantilla propia (`product.juguete.json`, mismo `producto-bungot` con otros bloques), las **cajas prearmadas** la suya (`product.caja.json`, `templateSuffix: caja`), y la **Caja BUNGOT** de suscripción la suya (`product.suscripcion.json`, `templateSuffix: suscripcion` — en pausa, el producto está en borrador).

## Convenciones que debes respetar

### Color y paleta
- La paleta son **8 triadas de pantones tratadas como un solo sistema**, definidas como CSS vars en `assets/base.css` (`:root`). Los hex están muestreados de las hojas de `pantones/`, **no inventados** — no inventes colores nuevos.
- Color madre de la marca: verde azulado `--brand` / PANTONE 7716 C `#00978E`.
- Las tarjetas de producto rotan colores desde el setting `card_colors` (lista de hex por coma). Un producto puntual puede fijar su color con el metafield `custom.card_color`.
- **`snippets/card-color.liquid` es la única fuente de verdad del color de un producto.** Si necesitas el color de un producto en cualquier lado, renderiza ese snippet — no dupliques la lógica de rotación.
- **El color de un producto es el de su familia del catálogo.** Las familias (colección o `product_type` + color de banda) viven en los ajustes globales `fam_<clave>_collection/_type/_bg/_fg` (grupo *Familias del catálogo* en `settings_schema.json`), no en los bloques de `collection-bandas`: es la única forma de que la PDP (fondo de la galería), la venta cruzada y la búsqueda lean el mismo color que pinta la banda, porque desde otra plantilla no se pueden leer los bloques de una sección. `card-color.liquid` cae a la rotación solo para lo que no está en ninguna familia (la Caja). El `family_color` de `producto-bungot` se deja vacío a propósito.
- Mismo criterio con la cara del perro: **`snippets/dog-avatar.liquid` es la única fuente de verdad del avatar** — nunca armes el nombre de archivo de una carita a mano.

### Categorías (¡ojo, no triviales!)
Las categorías **no viven en un solo campo** y se solapan:
- **Perros / Gatos** → colecciones.
- **Huesos / Juguetes** → `product.type`.
- Un hueso es Perros **y** Huesos a la vez.
- Los productos **no tienen tags** en esta tienda.
- Las **cajas prearmadas** (compra única) son productos de tipo `Caja` en la colección `cajas-bungot`: esa colección es su familia del catálogo (`fam_cajas_*`).
- La **Caja BUNGOT** (suscripción, HOY EN PAUSA: está en borrador) es un producto de tipo `Suscripción` que **no va en colecciones**, para no colarse en el catálogo.

Por eso `product-card.liquid` (hoy solo lo usa la búsqueda) emite tags + type + handles de colección juntos en `data-tags`. El catálogo (`collection-bandas`) no filtra por categoría: reordena/oculta bandas por familia en `productos.js`. Si vuelves a hacer filtrado por categoría, mantén esas tres fuentes.

### Metafields de producto (los lee la PDP)
Namespace `custom`: `beneficios` (lista de metaobjetos `beneficio` con `titulo` + `icono`), `beneficio_principal`, `gramaje`, `ingredientes`, `instrucciones`, `recomendacion`, `aviso_legal`, análisis garantizado (`proteina_cruda`, `grasa_cruda`, `fibra_cruda`, `humedad`, `cenizas`, `eln` — **en porcentaje**, 72 = 72%), `card_color`, `card_eyebrow`. El cinturón de `producto-bungot.liquid` usa `beneficios` y cae a los bloques `beneficio` de la sección si el producto no trae ninguno. El copy fuente es el docx de `pg_web/Productos/`.

### Video en la galería de la PDP
La galería de `producto-bungot` itera `product.media` (fotos **y** videos), no `product.images`. Reglas que no se ven en el código a simple vista:
- **La primera posición siempre es una foto** (`bag` = `featured_image`, que es imagen aunque el video vaya primero en el admin): el LCP es el `<img fetchpriority="high">` y el video no pesa nada al cargar.
- Cada video vive en un `<template>` y `producto.js` lo clona al slot del marco cuando eligen su miniatura; entra con `preload="none"`, `playsinline`, sin `autoplay`, y solo el botón de play dispara la descarga. **Chrome no pide el `poster` de un `<video>` que nació en un `<template>`** — por eso el JS vuelve a asignar el atributo ya en el DOM; no lo quites.
- **Liquid solo expone dos `media.sources`: el HLS (`m3u8`) y el mp4 original** — las versiones 480p/720p existen en el CDN (las lista la Admin API) pero no llegan al tema, así que no hay forma de elegir "el 720p". El orden es el del `video_tag` de Shopify: HLS primero (adaptativo en Safari/iOS), mp4 de respaldo.
- Videos externos (YouTube/Vimeo) muestran el poster y el iframe se crea hasta el play. Modelos 3D no se pintan.
- En móvil el marco toma la proporción del video (`--pd-frame-ar` desde `data-ar`, tope `78svh`) para que un vertical se vea entero; la tira de miniaturas se desplaza en horizontal.

### Paquetes prearmados (compra única) — lo que se vende HOY
Desde 2026-09-03 se venden **paquetes prehechos de compra única**, no suscripción. **Ojo con el nombre**: de cara al cliente todo dice **"paquetes"** (los productos se llaman "Paquete …", tipo `paquetes`, y así va el copy de paneles, banda, chip y plantilla), pero las **claves internas siguen siendo `cajas`** a propósito — familia `cajas` (`fam_cajas_*`), ancla `#banda-cajas`, colección `cajas-bungot`, plantilla `product.caja.json` (`templateSuffix: caja`) — no las renombres, romperías ajustes guardados. Los 6 paquetes reales los cargó el cliente el 2026-09-03 (Los de Siempre, Cepillo Natural, Bisagras Nuevas, Alumno de Diez, Jumbo Pulmón de Res y Para Chuparse las Garras, de gato). La plantilla es el mismo `producto-bungot` con stepper y venta cruzada prendidos y acordeones/beneficios de paquete. La familia `cajas` (rosa PANTONE 709 C `#EB5F7A`) da: banda propia hasta arriba del catálogo, chip de filtro "Paquetes" (solo sale si hay productos) y color consistente en PDP/cruzada/búsqueda vía `card-color.liquid`. Los paneles de portada (`feature-panel`) y catálogo (bloque `suscripcion` de `collection-bandas` — el tipo conserva el nombre viejo a propósito) anuncian los paquetes: su CTA con link vacío cae a la banda `#banda-cajas` (ancla que exponen todas las bandas, con `scroll-margin-top` en `productos.css`); el del catálogo ancla en la misma página y el de la portada va a `fam_cajas_collection.url + '#banda-cajas'`. El contenido de cada paquete va en su **descripción**: no hay picker ni metafields, son SKUs fijos. **Gotcha de Admin API**: productos/colecciones creados por API no quedan publicados en Online Store — hace falta `publishablePublish` a la publicación "Tienda online", si no Liquid los ve como blank (404, banda vacía). Los 3 placeholders de la primera tanda (Bienvenida, Cumpleañera, Michi) quedaron ARCHIVADOS en el admin.

### Suscripción (selling plans) — EN PAUSA desde 2026-09-03
La suscripción quedó **guardada completa pero dormida**: la Caja BUNGOT está **en borrador** en el admin (con eso `settings.caja_product` resuelve a blank en Liquid y nada de lo suyo se pinta; para revivirla basta regresarla a activo). Todo lo de abajo sigue en el código y no hay que quitarlo. La tienda usa **Shopify Subscriptions** (app gratis) para la Caja BUNGOT. El tema ya lo soporta: selector `.pdplan` + `input[name=selling_plan]` en la PDP (producto.js lo habilita/deshabilita), línea "Suscripción · …" en `cart-linea`, `banda-card` acepta `selling_plan_id`, y los agregados rápidos de un producto `requires_selling_plan` mandan su primer plan (sin él Shopify rechaza el add). Los sugeridos del carrito excluyen los de solo-suscripción. **El producto de la Caja vive en el ajuste global `caja_product`** (grupo *Suscripción* de `settings_schema.json`): los botones "Empieza tu suscripción" de la portada (`feature-panel`) y del catálogo (bloque `suscripcion` de `collection-bandas`) caen a `settings.caja_product.url` cuando su `cta_url` está vacío — es la única fuente de verdad de cuál producto es la suscripción, nunca hardcodees `/products/caja-bungot`. **No propongas bundles ni apps de paga**: la caja es un SKU y la elección del suscriptor vive en un metafield del cliente. **"Arma tu caja" ya existe** (2026-09-01): en la PDP de la Caja —y solo ahí: el producto se reconoce por el ajuste global `caja_product`— `producto-bungot` pinta el fieldset `.pdcaja` con los premios de la colección del ajuste `caja_collection` (vacío = la de la familia deshidratados), steppers con repetición y tope `caja_count` (default 3); el CTA se bloquea hasta completar. Lo elegido viaja como propiedades de línea (`Premios` legible + `_caja_picks` JSON de handles — la clave `Premios` es dato, no la traduzcas) que `cart-linea` y el checkout muestran, y con sesión se escribe al momento en el metafield `custom.caja_picks` vía la ruta `/caja` del worker (misma firma HMAC de `fichaApi`; cambiar premios = volver a la PDP y mover steppers). Pendiente: la receta de Flow que copia el metafield a la nota del pedido de renovación.

### Header y footer: siempre los de la landing (en TODAS las páginas)

**Regla:** el navbar y el footer son únicos y no cambian de página a página. Los buenos son **los que ya están en la landing** (`templates/index.json`): mismo markup, mismos links, mismo estilo y mismo comportamiento en index, product, collection, cart, page, search, 404 y en cualquier plantilla nueva. Son identidad de marca, no elementos por plantilla.

**Esta regla gana sobre cualquier diseño que te manden.** Si llega un mockup, un HTML exportado, un Figma o un ZIP con otro header u otro footer — otros links, otro logo, otro layout, otros colores — **ignora esa parte del diseño y deja el header y el footer de la landing tal cual**. No preguntes cuál usar, no hagas una variante "solo para esa página" y no los adaptes "un poquito" al diseño nuevo. Toma del diseño el contenido de en medio; el marco ya está decidido. Si de plano crees que el diseño exige tocarlos, dilo y espera confirmación antes de cambiar nada.

- Fuentes de verdad: `sections/header.liquid` (vía `sections/header-group.json`, que también trae el `preloader` — hoy `enabled: false`) y `sections/footer.liquid` (vía `sections/footer-group.json`). Los dos los renderiza `layout/theme.liquid` con `{% sections 'header-group' %}` / `{% sections 'footer-group' %}`, así que salen solos en toda plantilla: **no los agregues al `order` de ningún `templates/*.json`.**
- **No dupliques ni "forkees" ninguno de los dos.** Nada de `header-alt.liquid` ni `footer-2.liquid`, ni una nav o un footer propios dentro de otra sección, ni un `{% render %}` de nav/footer en una página custom. Si una página necesita algo distinto arriba o abajo, ponlo *entre* el header y el footer como su propia sección.
- Los links salen de los menús de Shopify (`main-menu` en el header y en la columna "Tienda" del footer, `footer` en "Ayuda"), no hardcodeados. Cambiar el menú en el admin lo cambia en todas las páginas — que es justo el punto.
- Si de plano hace falta una variante (ej. pintar el marquee crema en el catálogo), hazla **con una CSS var o un modifier / `body:has(.scope)` sobre el mismo componente**, nunca con otro componente.
- El botón de cuenta del header es el enlace de texto "Mi cuenta": sin sesión abre la hoja de acceso de Shopify (`<shopify-account>`), con sesión navega directo a Mis pedidos. **No revivas el dropdown de cuenta ni la pastilla con la carita** aunque un mockup o el handoff viejo los traigan.
- **En celu/tablet (≤900) el menú es una tarjeta crema que se abate** desde la esquina (rotación con bisagra arriba-derecha, todo en `base.css`), por debajo de las pestañas de logo/carrito/hamburguesa que se quedan colgadas del techo (z-index 56). No congela el scroll y se cierra al tocar fuera. El link de carrito **dentro** de la tarjeta (`.header__link--cart`) queda apagado por CSS a propósito — se conserva en el markup como respaldo por si la hoja no carga; no lo borres ni lo reactives.
- La pestaña del carrito en celu/tablet muestra el **ícono** en vez de la palabra: "Carrito ·" queda solo para el lector de pantalla (`.header__cart-label`, truco visually-hidden) y el contador es siempre el `<span data-cart-count>` que actualiza `theme.js` — no lo quites ni lo escondas. En escritorio la pestaña no cambia.
- El footer **ya no lleva franja de disclaimer** (markup, setting y CSS se quitaron a pedido en el rediseño responsive de 2026-08; no la revivas) y el wordmark gigante usa tokens fluidos (`min(420px, (100vw − 24px)/3.25)`) para no desbordarse nunca; ≤900 va en una columna con el nav entre el alta y el wordmark.
- El header sticky se sigue empujando por el footer vía `--nav-push` (`initFooterPushesNav()`, ver abajo). Cualquier cambio debe dejar ese comportamiento intacto.

### Footer: sube en flujo, SIN parallax

**Regla:** el footer no lleva animación de entrada. Sube en flujo normal con el resto de la página y ya. Lo único que hace al entrar es empujar el nav sticky fuera de pantalla.

Hubo un parallax en el que el cierre de arriba se rezagaba mientras el footer subía (`initFooterParallax()` en `theme.js` + `setupFooterReveal()` en `productos.js`, con `data-parallax-lag` / `data-reveal-lag`). **Se quitó a propósito de todo el tema** — junto con los envoltorios que lo recortaban (`.pdend` en la PDP, `.pg-reveal` en el catálogo). No lo revivas ni lo reimplementes "porque se veía bien": si vuelve, que sea porque se pidió otra vez.

Lo que sí queda y no se toca:

- `initFooterPushesNav()` en `theme.js` — el footer empuja el nav sticky fuera de la pantalla vía `--nav-push`. Funciona solo en todas las plantillas (header y footer salen de los grupos de sección del layout), no necesita markup extra. Se mide con el rect del **footer**, que nunca lleva transform, así que su posición es de layout puro: inmune a sticky, a cadenas de `offsetParent` y a que crezca contenido más arriba. No lo cambies a medir con otra cosa.
- Re-busca sus referencias si el hot-reload de `shopify theme dev` re-renderiza la sección. Mantén ese chequeo.

Como ya no hay nada rezagado, **la última sección antes del footer no tiene requisitos especiales**: ni `data-parallax-lag`, ni `overflow: clip`, ni estirarse a `100svh`. Ponla donde caiga en el `order`.

### Cuentas y ficha del perro

- La tienda usa las **cuentas de cliente NUEVAS** de Shopify: `/account`, `/account/login`, `/account/register`, `/account/addresses` redirigen al área hospedada por Shopify. Por eso `templates/customers/*` **nunca se renderiza**, no existe campo de contraseña (correo + código) y **no propongas login/registro como plantillas Liquid**. El objeto `customer` de Liquid es poco fiable con sesión — pruébalo con una sesión real antes de apoyarte en él.
- Las pantallas de cuenta del tema viven en **plantillas de página** (`page.mi-perro`, `page.mis-pedidos`, `page.mis-direcciones`, `page.crear-cuenta`) con layout `.cpage` + barra lateral `snippets/account-nav.liquid`. **`snippets/account-url.liquid` es la única fuente de verdad de esos destinos**: si la página con ese handle existe en el admin usa su URL, si no cae a `/pages/mi-perro?view=…`. Nunca hardcodees esas rutas.
- **La ficha del perro** (nombre, tamaño, cumpleaños, avatar) se guarda **solo** a través de `window.BUNGOT.perro` (`read`/`write`/`clear`) en `theme.js`: `localStorage` por usuario (`bungot:perro:<customer.id>` con sesión, `bungot:perro` sin) y, con sesión, el worker `app-ficha/` escribe los metafields `custom.perro_*` / `custom.dog_avatar` **al momento** vía Admin API. Ningún otro archivo debe tocar el almacenamiento. Respaldo: atributos `_perro_*` del carrito + workflow de Shopify Flow, cubre compras sin sesión.
- El worker autentica con el `customer.id` firmado por HMAC desde Liquid: **el secreto vive en `layout/theme.liquid` (`hmac_sha256`) y en el secreto `FIRMA_SECRET` del worker — si cambias uno, cambia el otro.** `ficha_api_url` vacío = worker apagado y el tema cae solo al respaldo. El token de Admin API es un secreto de wrangler, nunca va al repo. Detalles en `app-ficha/README.md` y `worker.js`.
- Ojo con los atributos de la ventana de entrar: el disparador es `[data-login-open]` en botones y el estado del body es `data-login-abierta` — se llaman distinto **a propósito** (si fueran iguales, el clic burbujea y el body matchea como abridor).

### Formularios que se mandan por fetch (hCaptcha)
La tienda tiene **la protección anti-spam de Shopify (hCaptcha invisible) ACTIVA**. Su binder envuelve `form.submit`, intercepta el `submit`, pide token y luego llama a lo que `form.submit` ERA. Por eso `contacto.js` hace `form.submit = enviaPorFetch` al cargar y en su listener no manda nada si `form.dataset.hcaptchaBound`: el token viaja en el FormData del fetch y la confirmación (`.ct-ok`) se queda en la página; sin token/red cae al submit nativo y Liquid pinta el panel con `?contact_posted=true`. **Cualquier otro form del tema que quieras mandar por fetch (newsletter del footer, etc.) necesita el mismo enganche**, si no cada envío brinca a `/challenge`.

Datos de contacto sin hardcodear: WhatsApp del ajuste `whatsapp_numero`, Instagram de `social_instagram`, correo de `shop.email`. Renglón sin ajuste = renglón que no se pinta.

### Textos e i18n
- **Nunca hardcodees texto de UI.** Va en `locales/es.default.json` y se lee con `{{ 'clave' | t }}`.
- El copy que edita el cliente va en `settings` con `default:` en español.

### Fuentes
- **Anton** (display: títulos, nombres de producto y cifras grandes, vía `--font-display`), **Inter** (body y todo el texto chico: labels, botones, chips, precios chicos, vía `--font-body`) y **BROOKLINE Condensed** (solo el wordmark, vía `--font-wordmark`) son self-hosted desde el CDN de Shopify vía `snippets/font-face.liquid`. No metas Google Fonts. Fredoka salió del tema (sin `@font-face` y sin .woff2 en assets; si se revierte, están en el historial de git).
- Anton solo trae peso 400: el `font-synthesis-weight: none` del `body` en `base.css` evita el faux-bold — no lo quites. La Inter cargada llega hasta 600; no pidas 700.
- Las tres se precargan con `crossorigin: 'anonymous'` en `theme.liquid` — el `crossorigin` es obligatorio o el navegador baja la fuente dos veces.
- Hay dos logotipos: el wordmark en BROOKLINE y el sticker "groovy". La BROOKLINE instalada es una demo sin licencia comercial — no la extiendas a más texto.

### Pantalla de carga
`snippets/pantalla-carga.liquid` + `assets/pantalla-carga.css/js`, renderizada desde `layout/theme.liquid` cuando el ajuste global `pantalla_carga` (grupo *Marca*) está activo. Crema + el repartidor pedaleando; nada más. `bungot-carga.mp4` trae el **fondo negro horneado a propósito**: el `<video>` va escondido y `pantalla-carga.js` recorta el negro cuadro por cuadro en un `<canvas>` (umbral 62 sobre r+g+b — no lo subas, a ~110 se comen los contornos). Mínimo 1 s en pantalla (en cualquier modo), tope 3 s aunque el video no cargue. **Cuándo sale** lo decide el script inline del snippet antes del primer pintado (`data-carga-modo`): en la primera página de la sesión (`sessionStorage`), siempre en las plantillas del ajuste `pantalla_carga_plantillas` (default `conocenos`), y como transición cuando un clic interno tarda más de 450 ms en traer la siguiente página (el JS guarda la hora del clic en `bungot:carga:ida`, la pone suave sobre la página vieja y la nueva llega con ella puesta hasta su `load`). La cortina no se destruye, se esconde con `hidden` y se reutiliza. La sección `preloader` vieja del header-group queda apagada; no la revivas.

### Imágenes animadas (perros)
- **El CDN de Shopify re-comprime los `.png` de `assets/` y aplana los APNG** (llegan congelados). Los `.gif` sí pasan intactos (alfa de 1 bit). **Nunca prometas APNG en assets.**
- El repartidor de la landing y del catálogo (`.fpanel__bici`, markup único en `snippets/fpanel-bici.liquid`) es `bungot-repartidor.gif` + `bungot-repartidor-estatico.png` para `prefers-reduced-motion`; el recorte medido del lienzo (`--bici-x/y/w/h` en `base.css`) hay que volver a medirlo si cambia el GIF, y `.fpanel__box` lleva `overflow: clip` para que el sobrante transparente de la imagen no ensanche el documento. El perro del carrito del catálogo (`.phead__art`) son **dos PNG normales** (`bungot-carrito-a/-b.png`) alternados con `@keyframes … steps(1,end)` en `productos.css`. El hero v2 son PNG sueltos (`perro2-sway`).
- El usuario pidió que el movimiento sea el dibujo real (cuadros), no keyframes moviendo al perro ni video sin alfa.

### Accesibilidad y performance
- Respeta `prefers-reduced-motion` (ya se hace en el preloader y animaciones). Toda animación nueva debe tener su fallback.
- Imágenes con `alt`, `width`/`height`, `loading="lazy"` y `srcset` responsivo (ver `product-card.liquid` como patrón).
- Mantén el `skip-link` y los roles/landmarks del layout.
- **Responsive:** cada página custom lleva sus media queries en su propia hoja (`productos.css`, `producto.css`, `conocenos-paseo.css`…) y las secciones de la landing en `base.css`; cortes usados: 900 (tablet/teléfono), 640 (teléfono) y algún 760/820 puntual. Verifica a 390×844 y 768×1024 con el skill `browser-automation` (viewport con `page.setViewportSize`) midiendo `scrollWidth` y capturando; ojo con las capturas *full page*: en secciones movidas por scroll (Favoritos, bonche, paseo) solo valen las capturas a viewport en varios puntos del scroll.
- Ojo con `transform` en ancestros de un `position: sticky` (lo rompe) — conocenos-paseo.css lo documenta: el lienzo del paseo se escala con `zoom`, nunca con `transform: scale()`.
- **Scroll móvil sin brincos (2026-08-31):** en celu, esconder/mostrar la barra del navegador dispara `resize` y cambia `innerHeight` **sin mover el ancho**. Toda rutina de JS que dependa del alto del viewport (Favoritos, bonche, paseo, patas del hero, empuje del footer) **cachea el alto y solo lo re-mide cuando cambia el ANCHO** (rotación) — misma lógica que `svh` en CSS, que es contra lo que esos cálculos tienen que cuadrar. Cualquier medición nueva del viewport sigue este patrón; un `window.innerHeight` leído en cada frame hace brincar la página a mitad de scroll. Van con esto y no se quitan: alturas en `svh` con línea `vh` de respaldo (no `vh` a secas), `overscroll-behavior-y: contain` en el `body` (sin pull-to-refresh ni rebote) y el meta viewport con `viewport-fit=cover` + `interactive-widget=resizes-content` en `theme.liquid`.

### Estilo de código
- Comenta el **por qué**, no el qué — como ya está el código (ej. por qué el `crossorigin`, por qué el color no sale de los pantones). Comentarios en español de México.
- Liquid: usa `{%- -%}` para controlar whitespace igual que el código existente.
- CSS: nombres tipo BEM (`card__foot`, `benefit__icon`) y CSS vars locales por componente (`--card-bg`, `--benefit-bg`). En las páginas custom, todo bajo su clase raíz.
- JS: fechas `"AAAA-MM-DD"` se parten a mano — `new Date()` con solo fecha la interpreta en UTC y en México corre un día para atrás.

## Al agregar una sección nueva

1. Crea `sections/mi-seccion.liquid` con su `{% schema %}` al final (nombre en español, blocks configurables).
2. Estilos en `base.css` bajo un bloque comentado — o, si es una página completa, en su propio `assets/mipagina.css` + `.js` cargados desde la sección y scopeados bajo una clase raíz (ver *Páginas custom*). JS (si de verdad hace falta) como función auto-inicializable.
3. Textos fijos → `locales/es.default.json`; textos editables → `settings` con defaults en español.
4. Enchúfala en el `templates/*.json` correspondiente. Puede ir en cualquier punto del `order`, incluida la última posición: el footer ya no tiene parallax, así que no le pide nada a la sección de arriba (ver *Footer: sube en flujo, SIN parallax*). Y nunca metas un nav ni un footer propios: ya vienen del `header-group` / `footer-group` (ver *Header y footer: siempre los de la landing*).
5. Corre `shopify theme check`, y si `theme dev` da 500 revisa *Fallas de upload*.
6. Verifica en el navegador (skill `browser-automation` con patchright funciona en esta máquina; el `console` no se captura, verifica por DOM/requests).
