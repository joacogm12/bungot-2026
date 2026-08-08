# app-ficha — el worker que guarda la ficha del perro en la cuenta

La única pieza con servidor del proyecto. Recibe la ficha desde el tema al
picar "Guardar" y escribe los metafields del cliente **al momento** vía la
Admin API (con sesión iniciada). El camino de respaldo — atributos de carrito
+ workflow de Flow — sigue activo y cubre a quien compra sin sesión.

Ver `worker.js` para la arquitectura y el modelo de seguridad (HMAC).

## Qué necesita para vivir (una sola vez)

1. **App custom en Shopify** (da el token de la Admin API):
   admin → Configuración → Aplicaciones y canales de venta → Desarrollar
   aplicaciones → Crear app "BUNGOT ficha" → Configuración de la Admin API →
   scopes `read_customers` y `write_customers` → Instalar app → revelar el
   **token** (`shpat_…`). El token se enseña UNA vez: se guarda directo como
   secreto del worker, nunca en el repo.

2. **Cuenta de Cloudflare** (gratis) para hospedar el worker.

## Desplegar (desde esta carpeta)

```bash
npx wrangler login          # abre el navegador para autorizar
npx wrangler deploy         # imprime la URL https://bungot-ficha.<cuenta>.workers.dev
npx wrangler secret put SHOPIFY_TOKEN   # pegar el shpat_…
npx wrangler secret put FIRMA_SECRET    # el mismo secreto del hmac_sha256 en layout/theme.liquid
```

Después del primer deploy, pegar la URL del worker en `layout/theme.liquid`
(`assign ficha_api_url = '…'`). Con esa variable vacía, el worker queda
apagado y el tema cae solo al camino de respaldo.

## Ojo

- El secreto de la firma vive en `layout/theme.liquid` (repo privado) y en el
  secreto `FIRMA_SECRET` del worker: si se cambia uno, cambiar el otro.
- Si la tienda cambia de dominio, actualizar `ORIGENES` en `worker.js`.
