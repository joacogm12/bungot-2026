# Arreglar la navegación de la cuenta: a dónde lleva cada botón

Ahorita varios botones de la sección de cuenta no llevan a ningún lado (abren un menú vacío, se
quedan en `#`, o el modal no tiene salida a la página real). Este prompt es **solo de navegación**:
no cambies el diseño, los colores, la tipografía ni el copy. Cambia únicamente destinos, `href`,
handlers de clic y redirecciones.

Tema Shopify de BUNGOT (Liquid + CSS y JS vanilla). Archivos que tocas:
`sections/header.liquid`, `snippets/account-menu.liquid`, `snippets/account-modal.liquid`,
`snippets/account-nav.liquid`, `assets/cuenta.js`, y las plantillas `templates/customers/*` y
`templates/page.*.json` si falta alguna ruta.

## Regla de oro

**Todo lo que se ve clickeable navega a una URL real.** Nada de `href="#"`, nada de `<button>` sin
handler, nada de `preventDefault()` que no abra algo. Cada enlace debe funcionar aunque el JS falle:
el `href` es la verdad y el JS solo mejora la experiencia.

Usa siempre las rutas de Shopify por variable, nunca strings a mano:

| Destino | URL |
| --- | --- |
| Iniciar sesión | `{{ routes.account_login_url }}` |
| Crear cuenta | `{{ routes.account_register_url }}` |
| Recuperar contraseña | `{{ routes.account_recover_url }}` |
| Cerrar sesión | `{{ routes.account_logout_url }}` |
| Perfil / mi cuenta | `{{ routes.account_url }}` |
| Mis pedidos | `{{ routes.root_url }}pages/mis-pedidos` |
| La ficha del perro | `{{ routes.root_url }}pages/mi-perro` |
| Mis direcciones | `{{ routes.root_url }}pages/mis-direcciones` |

Si tu página de registro vive en `pages/crear-cuenta`, deja esa como destino visible **y** haz que
`templates/customers/register.liquid` redirija ahí, para que las dos URLs terminen en la misma
pantalla. Lo mismo con login: `templates/customers/login.liquid` debe mostrar la pantalla de entrar
de BUNGOT, no la de Shopify pelona.

## Botón "Yo" del navbar (`sections/header.liquid` + `assets/cuenta.js`)

- **Sin sesión:** el botón "Yo" es un `<a href="{{ routes.account_login_url }}">`. Con JS abre el
  modal de entrar; **sin** JS, o si el modal no existe en esa página, el clic navega a la página de
  iniciar sesión. Hoy el `preventDefault()` se come el clic cuando `abrirLogin` no está definida:
  arréglalo — si no hay modal, deja que el enlace navegue.
- **Con sesión:** el botón muestra el avatar + el nombre del cliente y es un
  `<a href="{{ routes.account_url }}">`. Con JS despliega el menú de cuenta; **el nombre del cliente
  siempre lleva al perfil**: si el menú no abre por lo que sea, el clic navega a `account_url`.
- Dentro del menú abierto, la cabecera "Hola, {nombre}" también es un enlace a
  `{{ routes.account_url }}` (mismo hover que los demás renglones), para que "picarle a tu nombre te
  lleve a tu perfil" sea cierto en los dos lugares.
- No uses la ficha del perro guardada en `localStorage` para decidir si hay sesión: sin `customer`
  el botón lleva a iniciar sesión, punto. La ficha solo cambia el avatar que se pinta.

## Menú de cuenta (`snippets/account-menu.liquid`)

Renglones y destinos, en este orden:

1. **Hola, {nombre}** → `{{ routes.account_url }}`
2. **Mis pedidos** → `{{ routes.root_url }}pages/mis-pedidos`
3. **La ficha de {perro}** → `{{ routes.root_url }}pages/mi-perro`
4. **Direcciones** → `{{ routes.root_url }}pages/mis-direcciones`
5. **Cerrar sesión** → `{{ routes.account_logout_url }}` (solo con `customer`)

Sin sesión el menú no se renderiza; el navbar conserva el botón "Yo".

## Modal de entrar (`snippets/account-modal.liquid`)

- El `<form>` postea a `{{ routes.account_login_url }}` con
  `{% form 'customer_login' %}`; al entrar bien, Shopify regresa a `account_url` — agrega
  `<input type="hidden" name="return_to" value="{{ request.path }}">` para que el cliente vuelva a
  la página donde estaba, no al perfil, cuando entra desde el catálogo o el carrito.
- **"¿Se te olvidó tu contraseña?"** → `{{ routes.account_recover_url }}`.
- **"Crear cuenta"** (el pie del modal) → **navega de verdad** a la página de registro
  (`{{ routes.root_url }}pages/crear-cuenta`). Si prefieres cambiar el modal a la vista de registro
  sin recargar, el elemento sigue siendo un `<a>` con ese `href` y el JS hace `preventDefault()`
  solo cuando la vista de registro existe en el DOM.
- La **X** y el clic en el velo cierran el modal y devuelven el foco al botón "Yo". `Esc` igual.
- Si el cliente llega directo a `/account/login` sin JS, ve la pantalla completa de entrar (no el
  modal): `templates/customers/login.liquid` renderiza `sections/cuenta-login.liquid`.

## Página de registro (`sections/cuenta-registro.liquid`)

- `{% form 'create_customer' %}` postea a `{{ routes.account_register_url }}`.
- Al crear la cuenta, redirige a la ficha del perro (`pages/mi-perro`) — es el siguiente paso
  natural del alta. Usa `return_to` o un redirect en la plantilla.
- **"Ya tengo cuenta"** al pie → `{{ routes.account_login_url }}`.

## Menú lateral de cuenta (`snippets/account-nav.liquid`)

Mismos destinos que el menú del navbar. El renglón de la página actual lleva
`aria-current="page"` y no es clickeable a sí mismo. Verifica que la comparación se haga contra
`request.path` y no contra un string fijo.

## Botones dentro de las páginas de cuenta

- Tarjeta de pedido → `{{ order.customer_url }}` (o `pages/mis-pedidos` + modal de detalle, pero el
  `href` de respaldo siempre existe).
- "Volver a pedir" → agrega al carrito y manda a `{{ routes.cart_url }}`.
- "Seguir comprando" / estado vacío de pedidos → `{{ routes.all_products_collection_url }}`.
- "Agregar dirección" / "Editar" / "Eliminar" en direcciones → formularios `customer_address` con su
  `return_to` a `pages/mis-direcciones`.
- Logo del navbar → `{{ routes.root_url }}`. Carrito → `{{ routes.cart_url }}`.

## Antes de terminar

- Recorre la pantalla y haz clic en **todo**: ningún elemento clickeable se queda sin navegar.
- Repite el recorrido **con el JS desactivado**: todos los enlaces siguen funcionando.
- Prueba los dos estados: sin sesión (Yo → entrar; crear cuenta → registro) y con sesión (nombre →
  perfil; menú → pedidos, ficha, direcciones, cerrar sesión).
- Consola limpia, foco visible, navegable con teclado.
- Corre `shopify theme check`.
