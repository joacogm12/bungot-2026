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
templates/*.json           Plantillas OS2.0: index, product, product.juguete, collection, cart, page,
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
`home4.html` (export estático de la home para Claude Design), `BUNGOT_logo_vector.svg`, `Informacion de etiquetas.xlsx`, `*.zip` (gitignored). Los exports y handoffs viejos (`home2/3.html`, `ficha2.html`, `BUNGOT Portada.dc.html`, `7-*.md`, `8-*`) se borraron en la limpieza de 2026-08-18; si hace falta alguno está en el historial de git.

### Páginas custom: una sección full-bleed + su CSS/JS propio

Las páginas grandes NO usan las secciones `main-*` genéricas: cada una es **una sección propia** que carga su hoja y su script con `asset_url` desde el propio Liquid, y **todo su CSS va scopeado bajo una clase raíz** para no pisar `base.css`:

| Página | Plantilla | Sección | Assets | Scope |
|---|---|---|---|---|
| Landing | `index.json` | hero, favoritos, reviews-pin, statement, feature-panel, full-photo | base.css / theme.js | — |
| Catálogo | `collection.json` | `collection-bandas` (bandas por familia, collection-driven) | productos.css/js | `.pgal` |
| PDP | `product.json`, `product.juguete.json` | `producto-bungot` (split fijo 50/50, cinturón, cruzada) | producto.css/js | `.pdpage` |
| Carrito | `cart.json` | `cart-recibo` (recibo de papel, sugeridos, /cart/change.js) | carrito.css/js | `.rcpage` |
| Contacto | `page.contacto.json` | `contacto` | contacto.css/js | `.ctpage` |
| Conócenos | `page.conocenos.json` | `conocenos-paseo` (la historia como paseo; escena en PROPS/PARADAS de conocenos.js) | conocenos.css/js | — |
| Cuenta | `page.mi-perro/mis-pedidos/mis-direcciones/crear-cuenta.json` | `cuenta-perro`, `cuenta-pedidos`, `cuenta-direcciones`, `cuenta-registro`, `cuenta-login` | cuenta.css/js (**los carga el header** en todas las páginas) | `.cpage` |

- De las secciones `main-*` genéricas solo quedan `main-page`, `main-search` y `main-404` (las usan `page.json`, `search.json` y `404.json`). `main-collection`, `main-product`, `main-cart`, `product-grid` y las secciones de landing que ya no se montaban (`announcement-marquee`, `benefits`, `cta-closer`, `newsletter`, `product-carousel`, `testimonials`, `wave`, `word-marquee`) se borraron junto con su CSS/JS. Antes de borrar cualquier otra, `grep` en `templates/`, `sections/*-group.json` y `config/settings_data.json`.
- El patrón para una página nueva es el mismo: sección → `assets/mipagina.css` + `assets/mipagina.js` cargados desde la sección → clase raíz propia → nada de nav ni footer adentro.
- Los productos **juguete** llevan plantilla propia (`product.juguete.json`, mismo `producto-bungot` con otros bloques).

## Convenciones que debes respetar

### Color y paleta
- La paleta son **8 triadas de pantones tratadas como un solo sistema**, definidas como CSS vars en `assets/base.css` (`:root`). Los hex están muestreados de las hojas de `pantones/`, **no inventados** — no inventes colores nuevos.
- Color madre de la marca: verde azulado `--brand` / PANTONE 7716 C `#00978E`.
- Las tarjetas de producto rotan colores desde el setting `card_colors` (lista de hex por coma). Un producto puntual puede fijar su color con el metafield `custom.card_color`.
- **`snippets/card-color.liquid` es la única fuente de verdad del color de un producto.** Si necesitas el color de un producto en cualquier lado, renderiza ese snippet — no dupliques la lógica de rotación.
- Mismo criterio con la cara del perro: **`snippets/dog-avatar.liquid` es la única fuente de verdad del avatar** — nunca armes el nombre de archivo de una carita a mano.

### Categorías (¡ojo, no triviales!)
Las categorías **no viven en un solo campo** y se solapan:
- **Perros / Gatos** → colecciones.
- **Huesos / Juguetes** → `product.type`.
- Un hueso es Perros **y** Huesos a la vez.
- Los productos **no tienen tags** en esta tienda.
- La **Caja BUNGOT** (suscripción) es un producto de tipo `Suscripción` que **no va en colecciones**, para no colarse en el catálogo.

Por eso `product-card.liquid` (hoy solo lo usa la búsqueda) emite tags + type + handles de colección juntos en `data-tags`. El catálogo (`collection-bandas`) no filtra por categoría: reordena/oculta bandas por familia en `productos.js`. Si vuelves a hacer filtrado por categoría, mantén esas tres fuentes.

### Metafields de producto (los lee la PDP)
Namespace `custom`: `beneficios` (lista de metaobjetos `beneficio` con `titulo` + `icono`), `beneficio_principal`, `gramaje`, `ingredientes`, `instrucciones`, `recomendacion`, `aviso_legal`, análisis garantizado (`proteina_cruda`, `grasa_cruda`, `fibra_cruda`, `humedad`, `cenizas`, `eln` — **en porcentaje**, 72 = 72%), `card_color`, `card_eyebrow`. El cinturón de `producto-bungot.liquid` usa `beneficios` y cae a los bloques `beneficio` de la sección si el producto no trae ninguno. El copy fuente es el docx de `pg_web/Productos/`.

### Suscripciones (selling plans)
La tienda usa **Shopify Subscriptions** (app gratis) para la Caja BUNGOT. El tema ya lo soporta: selector `.pdplan` + `input[name=selling_plan]` en la PDP (producto.js lo habilita/deshabilita), línea "Suscripción · …" en `cart-linea`, `banda-card` acepta `selling_plan_id`, y los agregados rápidos de un producto `requires_selling_plan` mandan su primer plan (sin él Shopify rechaza el add). Los sugeridos del carrito excluyen los de solo-suscripción. **No propongas bundles ni apps de paga**: la caja es un SKU y la elección del suscriptor vive en un metafield del cliente (pendiente: página "Arma tu caja" + ruta `/caja` en el worker + Flow).

### Header y footer: siempre los de la landing (en TODAS las páginas)

**Regla:** el navbar y el footer son únicos y no cambian de página a página. Los buenos son **los que ya están en la landing** (`templates/index.json`): mismo markup, mismos links, mismo estilo y mismo comportamiento en index, product, collection, cart, page, search, 404 y en cualquier plantilla nueva. Son identidad de marca, no elementos por plantilla.

**Esta regla gana sobre cualquier diseño que te manden.** Si llega un mockup, un HTML exportado, un Figma o un ZIP con otro header u otro footer — otros links, otro logo, otro layout, otros colores — **ignora esa parte del diseño y deja el header y el footer de la landing tal cual**. No preguntes cuál usar, no hagas una variante "solo para esa página" y no los adaptes "un poquito" al diseño nuevo. Toma del diseño el contenido de en medio; el marco ya está decidido. Si de plano crees que el diseño exige tocarlos, dilo y espera confirmación antes de cambiar nada.

- Fuentes de verdad: `sections/header.liquid` (vía `sections/header-group.json`, que también trae el `preloader` — hoy `enabled: false`) y `sections/footer.liquid` (vía `sections/footer-group.json`). Los dos los renderiza `layout/theme.liquid` con `{% sections 'header-group' %}` / `{% sections 'footer-group' %}`, así que salen solos en toda plantilla: **no los agregues al `order` de ningún `templates/*.json`.**
- **No dupliques ni "forkees" ninguno de los dos.** Nada de `header-alt.liquid` ni `footer-2.liquid`, ni una nav o un footer propios dentro de otra sección, ni un `{% render %}` de nav/footer en una página custom. Si una página necesita algo distinto arriba o abajo, ponlo *entre* el header y el footer como su propia sección.
- Los links salen de los menús de Shopify (`main-menu` en el header y en la columna "Tienda" del footer, `footer` en "Ayuda"), no hardcodeados. Cambiar el menú en el admin lo cambia en todas las páginas — que es justo el punto.
- Si de plano hace falta una variante (ej. pintar el marquee crema en el catálogo), hazla **con una CSS var o un modifier / `body:has(.scope)` sobre el mismo componente**, nunca con otro componente.
- El botón de cuenta del header es el enlace de texto "Mi cuenta": sin sesión abre la hoja de acceso de Shopify (`<shopify-account>`), con sesión navega directo a Mis pedidos. **No revivas el dropdown de cuenta ni la pastilla con la carita** aunque un mockup o el handoff viejo los traigan.
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

### Imágenes animadas (perros)
- **El CDN de Shopify re-comprime los `.png` de `assets/` y aplana los APNG** (llegan congelados). Los `.gif` sí pasan intactos (alfa de 1 bit). **Nunca prometas APNG en assets.**
- El repartidor de la landing (`feature-panel`, `.fpanel__bici`) es `bungot-repartidor.gif` + `bungot-repartidor-estatico.png` para `prefers-reduced-motion`. El perro del carrito del catálogo (`.phead__art`) son **dos PNG normales** (`bungot-carrito-a/-b.png`) alternados con `@keyframes … steps(1,end)` en `productos.css`. El hero v2 son PNG sueltos (`perro2-sway`).
- El usuario pidió que el movimiento sea el dibujo real (cuadros), no keyframes moviendo al perro ni video sin alfa.

### Accesibilidad y performance
- Respeta `prefers-reduced-motion` (ya se hace en el preloader y animaciones). Toda animación nueva debe tener su fallback.
- Imágenes con `alt`, `width`/`height`, `loading="lazy"` y `srcset` responsivo (ver `product-card.liquid` como patrón).
- Mantén el `skip-link` y los roles/landmarks del layout.
- Ojo con `transform` en ancestros de un `position: sticky` (lo rompe) — conocenos.css lo documenta.

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
