# Shopify hace el login: quita los formularios de acceso

Cambio de rumbo en la sección de cuenta: **BUNGOT no captura credenciales**. Quien da de alta y
autentica es Shopify (`/account/login` y `/account/register`). Nuestras pantallas solo llevan ahí y
guardan lo que Shopify no guarda: la ficha del perro y su avatar.

Aplica esto sobre lo que ya existe. No cambies colores, tipografía, radios ni el resto del layout —
solo lo que se indica. Diseño de referencia actualizado: `BUNGOT Cuenta 2026.dc.html` (bloques `1a`
y `1b`). Archivos: `snippets/account-modal.liquid`, `sections/cuenta-login.liquid`,
`sections/cuenta-registro.liquid`, `templates/customers/login.liquid`,
`templates/customers/register.liquid`, `templates/page.crear-cuenta.json`.

## 1. El modal de entrar ya no tiene formulario

Borra del modal: los inputs de **correo** y **contraseña**, el checkbox de "mantener la sesión", los
botones de **Google** y **Apple**, y el separador "o con tu correo". El `{% form 'customer_login' %}`
se va completo.

Queda la columna derecha con esto, en este orden y con el mismo espaciado de 18px:

1. Título "Entra a tu cuenta" (Fredoka 700 30px uppercase `#013C3E`).
2. Párrafo de 16px `rgba(1,60,62,.75)`, `max-width: 34ch`: "Te llevamos a la pantalla segura de
   acceso. Tu carrito se queda justo como está."
3. **Entrar** — `<a>` de 54px, radio 999px, fondo `#EA4A27`, texto crema Fredoka 700 17px, hover
   fondo `#013C3E`. `href="{{ routes.account_login_url }}?return_to={{ request.path | url_encode }}"`.
4. **Crear cuenta** — `<a>` de 54px, fondo blanco, borde 2px `#013C3E`, texto `#013C3E`, hover fondo
   `#D8EFEC`. `href="{{ routes.account_register_url }}"`.
5. Línea 2px dashed `rgba(1,60,62,.18)`.
6. Pie de 14px: enlace "¿Se te olvidó tu contraseña?" → `{{ routes.account_recover_url }}`, y la
   nota "El correo y la contraseña los pide Shopify en su pantalla de acceso — aquí no se capturan."

El panel verde de la izquierda no cambia salvo dos cosas: el párrafo ahora dice "Entra y termina el
pedido donde lo dejaste." (no repitas la promesa del carrito dos veces en el mismo modal), y la
ilustración `ilus-guion.png` deja de ser `position: absolute`: va en el flujo, 190px de ancho,
`margin: auto auto -34px`, para que no se encime con el texto ahora que la caja es más baja.

Como ya no hay formulario, tampoco hay validación, ni spinner, ni estados de error. El modal solo
abre, cierra (X, velo, `Esc`, foco de regreso al botón "Yo") y navega.

`templates/customers/login.liquid` no monta un formulario propio: deja la pantalla de acceso de
Shopify.

## 2. La página de "crear cuenta" ya no crea la cuenta

La página deja de ser un registro y pasa a ser **el paso siguiente al alta**: el cliente ya volvió
de Shopify con su cuenta hecha y aquí llena la ficha de su perro.

Quita: los botones de Google y Apple, el separador "o con tu correo", y la fila de **Tu nombre /
Correo / Contraseña** completa. El `{% form 'create_customer' %}` se va.

Queda:

- Título **"Cuéntanos de tu perro"** (Fredoka 700 38px uppercase) y a su derecha, 14px: "Tu cuenta
  ya quedó. **Saltar por ahora**" (enlace a `{{ routes.account_url }}`).
- Bajada de 16px `rgba(1,60,62,.75)`, `max-width: 46ch`: "Con esto te recomendamos el tamaño correcto
  y le ponemos cara a tu cuenta. Lo puedes cambiar cuando quieras."
- Los campos del perro tal como están: **Cómo se llama**, **Tamaño** (chico/mediano/grande),
  **Cumpleaños**, en grid `1.2fr 1fr 1fr` con gap 12px, inputs de 52px radio 14px.
- El selector de cara: grid de 6 columnas, botones de 86px radio 20px, borde 3px; el seleccionado
  lleva borde `#013C3E` y fondo `#FFE7B8`. La etiqueta muestra el nombre del avatar elegido.
- CTA **"Guardar su ficha"** de 56px en `#EA4A27`, hover `#013C3E`, y junto a él la nota de 13px:
  "Nada de esto es obligatorio: guarda lo que quieras y sigue comprando."
- Se borró el encabezado interno "Tu perro" y su nota "opcional": ya no hace falta, toda la pantalla
  es del perro. **No escribas la palabra "opcional" como marca de campo.**

Guarda los datos en metafields del cliente (`custom.perro_nombre`, `custom.perro_tamano`,
`custom.perro_cumple`, `custom.perro_avatar`) vía `{% form 'customer' %}` o el App Proxy que ya uses;
al guardar, redirige a `{{ routes.account_url }}`.

La página requiere sesión: si no hay `customer`, redirige a
`{{ routes.account_login_url }}?return_to={{ request.path | url_encode }}`.

`templates/customers/register.liquid` redirige a `pages/crear-cuenta` **solo cuando ya hay
`customer`**; si no, manda a la pantalla de registro de Shopify.

## Antes de terminar

- Ni el modal ni la página tienen un solo `<input>` de correo o contraseña.
- No queda ningún botón de Google o Apple en el flujo de cuenta.
- El texto no se encima con la ilustración en el panel verde del modal.
- Los dos CTA del modal navegan a URLs reales y funcionan con el JS desactivado.
- Consola limpia, foco visible, navegable con teclado.
- Corre `shopify theme check`.
