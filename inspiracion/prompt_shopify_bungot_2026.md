# Prompt para Claude Code — Tienda Shopify BUNGOT 2026

Copiá y pegá esto en Claude Code (en la carpeta de tu proyecto Shopify) para que empiece a generar el tema.

---

## Contexto del proyecto

Quiero que generes un **tema de Shopify completo** (Online Store 2.0, estructura de secciones JSON) para **BUNGOT**, una marca de premios y snacks para perros. Es un borrador nuevo de la tienda para 2026: divertido, colorido y con mucha personalidad — nada de plantilla genérica de e-commerce.

Trabajá con la estructura estándar de un tema Shopify: `layout/theme.liquid`, `sections/`, `snippets/`, `templates/*.json`, `assets/` (CSS/JS), `config/settings_schema.json`. Usá Liquid + CSS + JS vanilla (o Alpine.js si simplifica interacciones), sin frameworks pesados innecesarios.

## Marca y tono

- **Nombre:** BUNGOT
- **Producto:** premios y snacks naturales para mascotas (foco en perros; también gatos, juguetes y huesos).
- **Tono:** juguetón, cálido, directo — como si la marca le hablara al dueño y al perro por igual. Nada corporativo.
- **Público:** dueños de mascotas jóvenes/millennials que cuidan la alimentación de sus perros pero quieren una marca con onda, no clínica.

## Inspiración (de estos 4 sitios que relevamos)

1. **bungot.com (versión actual)** — mantené la esencia: header en verde azulado, tarjetas de producto con fondo de color sólido distinto por producto (naranja, celeste, amarillo, verde), foto real del snack + ilustración simple de un perrito en cada tarjeta, filtros tipo "pill" con emoji (🐕 Perros, 🐈 Gatos, 🦴 Huesos, 🧸 Juguetes), contador de productos arriba a la derecha. **Esta es la base — lo demás son acentos para modernizarla.**
2. **gethapply.com** — tomá la idea del hero con tipografía bold/condensada enorme sobre fondo cálido, el banner marquee animado arriba (ej. "envío gratis con código X"), y el bloque de producto tipo carrusel numerado (01/03) con descripción + tags cortos (mood/ocasión).
3. **cravburgers.shop/menu** — tomá la idea de un **preloader animado con personalidad** (en vez de "armando una hamburguesa", podría ser "armando el premio perfecto" con iconitos de hueso/pata/snack apareciendo), y fotografía de producto grande y apetitosa como protagonista del hero.
4. **rockyshothoney.com** — tomá la tipografía de logo tipo "bubble letters" juguetona y el patrón de tarjetas de beneficios cortas con ícono (ej. "100% ingredientes reales", "hecho en pequeños lotes").

## Productos a incluir (de referencia, ajustá copy)

Línea "Premios — Perros" (mantener nombres/estructura similar):
- Snack Pulmón de Cerdo para Perros — $70
- Snacks Aritos de Traquea para Perros — $70
- Snacks Hígado de Cerdo para Perros — $70
- Snacks Patas de Pollo para Perros — $85

Total del catálogo: ~13 productos entre Perros, Gatos, Juguetes y Huesos (usá placeholders coherentes para las categorías que no detallé).

## Secciones que necesito

1. **Header/nav** — logo, links (shop / nuestra historia / suscribirse), ícono usuario + carrito.
2. **Preloader/intro animado** (opcional, activable/desactivable desde el customizer) con personalidad de marca.
3. **Hero** — tipografía grande estilo happly, foto de perro + producto, CTA "comprar ahora".
4. **Grid de productos con filtros** — chips con emoji por categoría (Perros/Gatos/Juguetes/Huesos), tarjetas con fondo de color sólido rotando entre una paleta definida, precio y nombre sobre franja oscura inferior (como el bungot.com actual).
5. **Bloque de beneficios** — 3 o 4 tarjetas cortas con ícono (ingredientes reales, hecho en pequeños lotes, sin aditivos, etc.).
6. **Testimonios** — cards simples con nombre + review corta.
7. **Newsletter/suscripción** — popup o sección con descuento de bienvenida (ej. 10% off), estilo divertido, no invasivo.
8. **Footer** — nav secundario, redes sociales, disclaimer si aplica.

## Paleta y tipografía sugeridas (punto de partida, ajustable)

- **Los colores oficiales de la marca están en la carpeta `pantones/` del proyecto** (junto a `inspiracion/`) — revisá esa carpeta primero y usá esos valores exactos (hex/Pantone) como paleta base del tema en vez de inventar colores nuevos. Los acentos cálidos (naranja, amarillo mostaza, rosa salmón) y el fondo crema mencionados abajo son solo orientativos hasta confirmar contra esos pantones.
- Colores base: verde azulado (herencia de bungot.com actual), + acentos cálidos (naranja, amarillo mostaza, rosa salmón) para las tarjetas de producto, fondo crema para secciones de contenido.
- Tipografía: un display bold/redondeado para títulos (estilo cómic/bubble, como happly o rocky's hot honey), y una sans neutra legible para body copy.

## Entregable

Generá la estructura completa de archivos del tema, lista para levantar con `shopify theme dev`. Empezá por `layout/theme.liquid` + `sections/hero.liquid` + `sections/product-grid.liquid`, y después seguí con el resto. Preguntame si necesitás definir contenido/copy específico antes de avanzar con una sección.
