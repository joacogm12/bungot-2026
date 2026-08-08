# Prompt para Claude Code — Más contenido en la landing (BUNGOT)

Copiá y pegá esto en Claude Code para la siguiente iteración del theme.

---

## Contexto

La landing actual solo tiene portada (hero) y después pasa directo al grid completo de productos. Necesito que tenga más desarrollo narrativo antes de llegar al catálogo — texto, fotos, y un momento de marca antes de vender.

## 1. Sección "Favoritos" con scroll-driven color interpolation

- Mostrar solo los productos con el **tag `favorito`** (colección automática o filtro por tag — no un pick manual, así se actualiza solo si cambio los tags en el admin).
- A medida que el usuario scrollea por esta sección, el color de fondo (o de un elemento acento, a definir visualmente) va **interpolando suavemente** entre los colores asociados a cada producto favorito (podés usar el mismo metafield `custom.card_color` que ya definiste para las tarjetas del grid, así queda consistente).
- Implementación: usar **CSS scroll-driven animations** (`animation-timeline: view()` / `scroll()`) como base, con un fallback vía `IntersectionObserver` + JS para navegadores sin soporte (Safari todavía tiene soporte parcial). Que sea progressive enhancement — sin el efecto, la sección tiene que verse bien igual (colores estáticos).
- Cada producto favorito se presenta con foto grande + nombre + precio + CTA corto, uno abajo del otro o en scroll horizontal (elegí lo que se sienta mejor con el resto del theme).

## 2. Sección "Nosotros" (teaser de marca)

- **Ya no son placeholders**: las fotos reales están en `inspiracion/fotos/fotos_faride/` (34 fotos, full-res, del shoot de marca). Usalas para esta sección y para la de Favoritos si suman.
- Texto corto (2-3 líneas) contando quiénes somos / por qué existe BUNGOT.
- Todo el bloque (o un botón "conocé nuestra historia") linkea a la página `nuestra historia` que ya está en el nav.

## 3. Secciones adicionales — proponé y armá las que tengan sentido

Sumá las que consideres más efectivas para una landing de e-commerce de premios para mascotas, por ejemplo (elegí y ajustá, no hace falta hacerlas todas):

- FAQ corta (envíos, ingredientes, ¿es apto para cachorros?).
- Bloque de envíos/garantía (ej. "envío gratis desde $X", "hecho en México").
- Reviews con foto de mascotas reales usando el producto (placeholder por ahora).
- Instagram feed o grid de fotos de usuarios con sus perros.
- Bloque comparativo simple (por qué BUNGOT vs. premios genéricos).

Mantené el tono juguetón definido en el prompt original y la paleta de `pantones/`. Cada sección nueva tiene que poder activarse/desactivarse y reordenarse desde el customizer, como ya hiciste con el preloader.

## Orden sugerido de la landing

1. Preloader (ya existe)
2. Hero (ya existe)
3. Favoritos — scroll color interpolation
4. Nosotros (teaser → link a nuestra historia)
5. Secciones adicionales que elijas
6. Grid completo de productos con filtros (ya existe)
7. Beneficios / testimonios / newsletter (ya existen)
8. Footer (ya existe)

Antes de programar el efecto de scroll, mostrame un mock o descripción de cómo se vería la interpolación de color para confirmar que es lo que tengo en mente.
