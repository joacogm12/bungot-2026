/* ==========================================================================
   BUNGOT — worker de la ficha del perro (Cloudflare Workers)

   La única pieza con servidor de todo el proyecto. Existe porque el tema
   tiene prohibido escribir metafields del cliente (cuentas nuevas, sin app):
   theme.js le manda la ficha al guardar y este worker la escribe AL MOMENTO
   en los metafields del cliente vía la Admin API. El camino viejo (atributos
   de carrito + Flow) sigue vivo como respaldo para quien compra sin sesión.

   Seguridad — cómo sabemos QUIÉN guarda:
   theme.liquid manda el id del cliente firmado con HMAC-SHA256 (el filtro
   hmac_sha256 de Liquid, con el mismo secreto que este worker tiene en
   FIRMA_SECRET). Solo una página renderizada por Shopify con esa sesión
   produce una firma válida, y la firma amarra el id: nadie puede escribirle
   la ficha a otro cliente. Lo peor que puede hacer un atacante con SU propia
   firma es cambiarse SU perro — riesgo aceptado para una ficha opcional.

   Secretos (wrangler secret put):
     SHOPIFY_TOKEN  token Admin API de la app custom (scope write_customers)
     FIRMA_SECRET   el mismo secreto del hmac_sha256 en layout/theme.liquid

   Rutas (mismo POST firmado en las dos):
     /       la ficha del perro (metafields custom.perro_* / dog_avatar)
     /caja   los premios elegidos para la Caja BUNGOT (metafield
             custom.caja_picks, JSON handle → cantidad). Lo manda el picker
             "Arma tu caja" de la PDP; el respaldo sin sesión viaja como
             propiedades de la línea del carrito.
   ========================================================================== */

const TIENDA = 'e30306-22.myshopify.com';
const API = `https://${TIENDA}/admin/api/2026-01/graphql.json`;

// Solo el storefront puede llamar. El dominio myshopify va por los previews.
const ORIGENES = [
  'https://bungot.com',
  'https://www.bungot.com',
  'https://e30306-22.myshopify.com',
];

// Mismas listas que valida el tema (dog-avatar.liquid / ficha-campos).
const CARAS = ['bruno', 'cleo', 'greta', 'manolo', 'ramona', 'bache',
  'chuleta', 'felipe', 'guion', 'mac', 'pecas', 'sansa'];
const TAMANOS = ['chico', 'mediano', 'grande'];

// ficha del tema -> metafield del cliente (namespace custom).
const CAMPOS = {
  nombre: 'perro_nombre',
  tamano: 'perro_tamano',
  cumple: 'perro_cumple',
  avatar: 'dog_avatar',
};

function conCors(origen, res) {
  res.headers.set('Access-Control-Allow-Origin', origen);
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return res;
}

function json(origen, cuerpo, status = 200) {
  return conCors(origen, new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  }));
}

async function hmacHex(secreto, mensaje) {
  const llave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const firma = await crypto.subtle.sign('HMAC', llave, new TextEncoder().encode(mensaje));
  return [...new Uint8Array(firma)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// Comparación en tiempo constante: no filtrar por cuánto tardamos en decir no.
function igualas(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// La ficha entera es opcional: lo inválido se descarta en silencio (mismo
// criterio que el tema — nunca frena, nunca regaña).
function limpiar(ficha) {
  const f = ficha && typeof ficha === 'object' ? ficha : {};
  return {
    nombre: typeof f.nombre === 'string' ? f.nombre.trim().slice(0, 60) : '',
    tamano: TAMANOS.includes(f.tamano) ? f.tamano : '',
    cumple: /^\d{4}-\d{2}-\d{2}$/.test(f.cumple || '') ? f.cumple : '',
    avatar: CARAS.includes(f.avatar) ? f.avatar : '',
  };
}

// Picks de la Caja: objeto handle → cantidad. Mismo criterio que la ficha
// (validar y descartar, nunca regañar), pero aquí un envío sin nada válido sí
// es error: no hay "caja vacía" que guardar, y borrar la elección no es algo
// que el tema haga (se pisa con la siguiente elección completa).
function limpiarPicks(crudo) {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null;
  const picks = {};
  let total = 0;
  for (const handle of Object.keys(crudo).slice(0, 24)) {
    if (!/^[a-z0-9-]{1,80}$/.test(handle)) continue;
    const qty = Number(crudo[handle]);
    if (!Number.isInteger(qty) || qty < 1 || qty > 12) continue;
    picks[handle] = qty;
    total += qty;
  }
  if (!Object.keys(picks).length || total > 24) return null;
  return picks;
}

async function shopify(env, query, variables) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

export default {
  async fetch(request, env) {
    const origen = request.headers.get('Origin') || '';
    if (!ORIGENES.includes(origen)) {
      return new Response('origen no permitido', { status: 403 });
    }
    if (request.method === 'OPTIONS') {
      return conCors(origen, new Response(null, { status: 204 }));
    }
    if (request.method !== 'POST') {
      return json(origen, { error: 'solo POST' }, 405);
    }

    let cuerpo;
    try {
      cuerpo = await request.json();
    } catch (e) {
      return json(origen, { error: 'JSON inválido' }, 400);
    }

    const id = String(cuerpo.id || '');
    if (!/^\d+$/.test(id)) return json(origen, { error: 'id inválido' }, 400);

    const esperada = await hmacHex(env.FIRMA_SECRET, id);
    if (!igualas(esperada, String(cuerpo.firma || ''))) {
      return json(origen, { error: 'firma inválida' }, 403);
    }

    const dueno = `gid://shopify/Customer/${id}`;

    // ---------- /caja: los premios elegidos ----------
    if (new URL(request.url).pathname === '/caja') {
      const picks = limpiarPicks(cuerpo.picks);
      if (!picks) return json(origen, { error: 'picks inválidos' }, 400);
      const respuestaCaja = await shopify(
        env,
        `mutation GuardarCaja($mf: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $mf) { userErrors { field message } } }`,
        { mf: [{ ownerId: dueno, namespace: 'custom', key: 'caja_picks', type: 'json', value: JSON.stringify(picks) }] }
      );
      const erroresCaja = []
        .concat(respuestaCaja.data?.metafieldsSet?.userErrors || [])
        .concat(respuestaCaja.errors || []);
      if (erroresCaja.length) {
        console.error('GuardarCaja errores:', JSON.stringify(erroresCaja));
        return json(origen, { ok: false }, 502);
      }
      return json(origen, { ok: true });
    }

    const ficha = limpiar(cuerpo.ficha);

    // EL CANDADO DEL CUMPLEAÑOS: se escribe UNA vez. Con esa fecha va el
    // regalo de cumpleaños del cliente, así que un cumpleaños ya guardado ni
    // se pisa ni se borra desde la tienda — aunque el navegador mande otra
    // cosa. Para corregirlo, el cliente escribe y se cambia en el admin (los
    // metafields del admin no pasan por aquí).
    const actual = await shopify(
      env,
      `query CumpleGuardado($id: ID!) { customer(id: $id) { metafield(namespace: "custom", key: "perro_cumple") { value } } }`,
      { id: dueno }
    );
    const cumpleGuardado = actual.data?.customer?.metafield?.value;

    // Lo que tiene valor se escribe; lo vacío se BORRA (así "Borrar la ficha"
    // en el tema también limpia la cuenta, no deja fantasmas). El cumpleaños
    // ya guardado se salta completo: ni set ni delete.
    const poner = [];
    const quitar = [];
    for (const campo in CAMPOS) {
      if (campo === 'cumple' && cumpleGuardado) continue;
      const key = CAMPOS[campo];
      if (ficha[campo]) {
        poner.push({ ownerId: dueno, namespace: 'custom', key, type: 'single_line_text_field', value: ficha[campo] });
      } else {
        quitar.push({ ownerId: dueno, namespace: 'custom', key });
      }
    }

    const partes = [];
    if (poner.length) {
      partes.push(`pon: metafieldsSet(metafields: $pon) { userErrors { field message } }`);
    }
    if (quitar.length) {
      partes.push(`quita: metafieldsDelete(metafields: $quita) { userErrors { field message } }`);
    }
    const defs = [
      poner.length ? '$pon: [MetafieldsSetInput!]!' : null,
      quitar.length ? '$quita: [MetafieldIdentifierInput!]!' : null,
    ].filter(Boolean).join(', ');

    const respuesta = await shopify(
      env,
      `mutation GuardarFicha(${defs}) { ${partes.join(' ')} }`,
      { ...(poner.length && { pon: poner }), ...(quitar.length && { quita: quitar }) }
    );

    const errores = []
      .concat(respuesta.data?.pon?.userErrors || [])
      .concat(respuesta.data?.quita?.userErrors || [])
      .concat(respuesta.errors || []);
    if (errores.length) {
      // El detalle queda en los logs del worker; al tema solo le decimos "no".
      console.error('GuardarFicha errores:', JSON.stringify(errores));
      return json(origen, { ok: false }, 502);
    }

    return json(origen, { ok: true });
  },
};
