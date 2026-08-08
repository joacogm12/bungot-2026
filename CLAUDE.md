# CLAUDE.md — BUNGOT 2026

Guía para trabajar en este proyecto. Léela antes de tocar código.

## Qué es esto

Tema de **Shopify Online Store 2.0** para **BUNGOT**, una marca mexicana de premios y snacks naturales para perros (también gatos, huesos y juguetes). Tono juguetón, cálido y colorido — nada de plantilla genérica de e-commerce.

- **Tienda:** `e30306-22.myshopify.com` · precios en **MXN**.
- **Idioma:** todo el copy y los comentarios en **español de México (tú)**. No uses voseo argentino ("vos/usá/dejás") aunque encuentres código viejo escrito así.

## Stack y filosofía

- **Liquid + CSS vanilla + JS vanilla.** Sin frameworks, sin build step, sin dependencias. Si algo se puede hacer con CSS, no metas JS.
- **Cada sección es autónoma.** `theme.js` auto-inicializa cada bloque solo si su markup está presente (`if (!el) return;`), así se puede borrar cualquier sección desde el customizer sin romper el resto. Mantén ese patrón.
- **Todo configurable desde el customizer.** Colores, textos e imágenes viven en `settings` / `section.settings` / `block.settings`, no hardcodeados.

## Comandos

```bash
shopify theme dev      # levantar en local con hot reload
shopify theme check    # linter de Liquid/tema (córrelo antes de dar por hecho un cambio)
shopify theme push     # subir a la tienda (con cuidado)
```

Este proyecto **no** es un repo git todavía. No asumas historial ni ramas.

## Estructura

```
layout/theme.liquid        Shell HTML: <head>, fuentes, CSS vars raíz, header/footer groups
sections/*.liquid          Secciones (cada una con su bloque {% schema %} al final)
                           + header-group.json / footer-group.json (grupos de sección)
snippets/*.liquid          Parciales reutilizables: product-card, card-color, font-face,
                           meta-tags, pup-illustration
templates/*.json           Plantillas OS2.0 que ensamblan secciones (index, product,
                           collection, cart, page, search, 404)
templates/*.liquid         Plantillas de fallback aún sin migrar a JSON (article, blog,
                           list-collections) — pásalas a .json si las tocas
assets/                    base.css, theme.js, fuentes .woff2, imágenes .webp/.png
config/settings_schema.json  Ajustes globales del tema (Marca, Colores, Tarjetas, Social)
config/settings_data.json    Valores guardados de esos ajustes (lo escribe el customizer)
locales/es.default.json    Todos los textos de UI (se leen con el filtro `| t`)
pantones/                  Hojas pantone originales de la marca (referencia, no se sirven)
inspiracion/               Briefs y notas de referencia (no es código del tema)
fotos/                     Fotos fuente sin procesar (no es asset del tema)
```

> En la raíz también hay `BUNGOT Portada.dc.html` y `Diseño de página con tres variantes.zip`: material de diseño/exportaciones, **no** son parte del tema — no los edites ni los subas con `theme push`.

## Convenciones que debes respetar

### Color y paleta
- La paleta son **8 triadas de pantones tratadas como un solo sistema**, definidas como CSS vars en `assets/base.css` (`:root`). Los hex están muestreados de las hojas de `pantones/`, **no inventados** — no inventes colores nuevos.
- Color madre de la marca: verde azulado `--brand` / PANTONE 7716 C `#00978E`.
- Las tarjetas de producto rotan colores desde el setting `card_colors` (lista de hex por coma). Un producto puntual puede fijar su color con el metafield `custom.card_color`.
- **`snippets/card-color.liquid` es la única fuente de verdad del color de un producto.** Si necesitas el color de un producto en cualquier lado, renderiza ese snippet — no dupliques la lógica de rotación.

### Categorías (¡ojo, no triviales!)
Las categorías **no viven en un solo campo** y se solapan:
- **Perros / Gatos** → colecciones.
- **Huesos / Juguetes** → `product.type`.
- Un hueso es Perros **y** Huesos a la vez.
- Los productos **no tienen tags** en esta tienda.

Por eso `product-card.liquid` emite tags + type + handles de colección juntos en `data-tags`, y los chips de filtro deciden en el cliente cuál matchear. Si tocas filtrado, mantén esas tres fuentes.

### Header y footer: siempre los de la landing (en TODAS las páginas)

**Regla:** el navbar y el footer son únicos y no cambian de página a página. Los buenos son **los que ya están en la landing** (`templates/index.json`): mismo markup, mismos links, mismo estilo y mismo comportamiento en index, product, collection, cart, page, search, 404 y en cualquier plantilla nueva. Son identidad de marca, no elementos por plantilla.

**Esta regla gana sobre cualquier diseño que te manden.** Si llega un mockup, un HTML exportado, un Figma o un ZIP con otro header u otro footer — otros links, otro logo, otro layout, otros colores — **ignora esa parte del diseño y deja el header y el footer de la landing tal cual**. No preguntes cuál usar, no hagas una variante "solo para esa página" y no los adaptes "un poquito" al diseño nuevo. Toma del diseño el contenido de en medio; el marco ya está decidido. Si de plano crees que el diseño exige tocarlos, dilo y espera confirmación antes de cambiar nada.

- Fuentes de verdad: `sections/header.liquid` (vía `sections/header-group.json`) y `sections/footer.liquid` (vía `sections/footer-group.json`). Los dos los renderiza `layout/theme.liquid` con `{% sections 'header-group' %}` / `{% sections 'footer-group' %}`, así que salen solos en toda plantilla: **no los agregues al `order` de ningún `templates/*.json`.**
- **No dupliques ni "forkees" ninguno de los dos.** Nada de `header-alt.liquid` ni `footer-2.liquid`, ni una nav o un footer propios dentro de otra sección, ni un `{% render %}` de nav/footer en una página custom. Si una página necesita algo distinto arriba o abajo, ponlo *entre* el header y el footer como su propia sección.
- Los links salen de los menús de Shopify (`main-menu` en el header y en la columna "Tienda" del footer, `footer` en "Ayuda"), no hardcodeados. Cambiar el menú en el admin lo cambia en todas las páginas — que es justo el punto.
- Si de plano hace falta una variante (ej. header transparente sobre un hero), hazla **con una CSS var o un modifier de clase sobre el mismo componente**, nunca con otro componente.
- El header sticky se sigue empujando por el footer vía `--nav-push` (`initFooterPushesNav()`, ver abajo). Cualquier cambio debe dejar ese comportamiento intacto.

### Footer: sube en flujo, SIN parallax

**Regla:** el footer no lleva animación de entrada. Sube en flujo normal con el resto de la página y ya. Lo único que hace al entrar es empujar el nav sticky fuera de pantalla.

Hubo un parallax en el que el cierre de arriba se rezagaba mientras el footer subía (`initFooterParallax()` en `theme.js` + `setupFooterReveal()` en `productos.js`, con `data-parallax-lag` / `data-reveal-lag`). **Se quitó a propósito de todo el tema** — junto con los envoltorios que lo recortaban (`.pdend` en la PDP, `.pg-reveal` en el catálogo). No lo revivas ni lo reimplementes "porque se veía bien": si vuelve, que sea porque se pidió otra vez.

Lo que sí queda y no se toca:

- `initFooterPushesNav()` en `theme.js` — el footer empuja el nav sticky fuera de la pantalla vía `--nav-push`. Funciona solo en todas las plantillas (header y footer salen de los grupos de sección del layout), no necesita markup extra. Se mide con el rect del **footer**, que nunca lleva transform, así que su posición es de layout puro: inmune a sticky, a cadenas de `offsetParent` y a que crezca contenido más arriba. No lo cambies a medir con otra cosa.
- Re-busca sus referencias si el hot-reload de `shopify theme dev` re-renderiza la sección. Mantén ese chequeo.

Como ya no hay nada rezagado, **la última sección antes del footer no tiene requisitos especiales**: ni `data-parallax-lag`, ni `overflow: clip`, ni estirarse a `100svh`. Ponla donde caiga en el `order`.

### Textos e i18n
- **Nunca hardcodees texto de UI.** Va en `locales/es.default.json` y se lee con `{{ 'clave' | t }}`.
- El copy que edita el cliente va en `settings` con `default:` en español.

### Fuentes
- **Fredoka** (display, títulos) e **Inter** (body) son self-hosted desde el CDN de Shopify vía `snippets/font-face.liquid`. No metas Google Fonts.
- Las dos principales se precargan con `crossorigin: 'anonymous'` en `theme.liquid` — el `crossorigin` es obligatorio o el navegador baja la fuente dos veces.

### Accesibilidad y performance
- Respeta `prefers-reduced-motion` (ya se hace en el preloader y animaciones). Toda animación nueva debe tener su fallback.
- Imágenes con `alt`, `width`/`height`, `loading="lazy"` y `srcset` responsivo (ver `product-card.liquid` como patrón).
- Mantén el `skip-link` y los roles/landmarks del layout.

### Estilo de código
- Comenta el **por qué**, no el qué — como ya está el código (ej. por qué el `crossorigin`, por qué el color no sale de los pantones). Comentarios en español de México.
- Liquid: usa `{%- -%}` para controlar whitespace igual que el código existente.
- CSS: nombres tipo BEM (`card__foot`, `benefit__icon`) y CSS vars locales por componente (`--card-bg`, `--benefit-bg`).

## Al agregar una sección nueva

1. Crea `sections/mi-seccion.liquid` con su `{% schema %}` al final (nombre en español, blocks configurables).
2. Estilos en `base.css` bajo un bloque comentado; JS (si de verdad hace falta) como función auto-inicializable en `theme.js`.
3. Textos fijos → `locales/es.default.json`; textos editables → `settings` con defaults en español.
4. Enchúfala en el `templates/*.json` correspondiente. Puede ir en cualquier punto del `order`, incluida la última posición: el footer ya no tiene parallax, así que no le pide nada a la sección de arriba (ver *Footer: sube en flujo, SIN parallax*). Y nunca metas un nav ni un footer propios: ya vienen del `header-group` / `footer-group` (ver *Header y footer: siempre los de la landing*).
5. Corre `shopify theme check`.
