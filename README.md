# Registruti — Time Tracking & Invoicing

Aplicación de seguimiento de horas de consultoría y facturación por cliente, al estilo Toggl Track.

**App:** https://registruti.app/

## Funcionalidades

- **Tracker semanal**: registro de horas por día con duración de escritura libre ("1:30", "1.5", "90m"), en intervalos de 15 minutos (mínimo 0:15, máximo 8:00 por entrada), con descripción, cliente, marca de facturable y repetición de entradas con un click.
- **Clientes**: alta, edición, archivado y eliminación de clientes, cada uno con tarifa por hora, moneda y color propio.
- **Reportes**: horas y montos facturables por cliente y por día, con filtros por período (semana, mes, mes pasado o rango personalizado) y exportación a CSV.
- **Facturas**: generación de facturas por cliente y período a partir de las horas no facturadas, con estados (borrador → enviada → pagada), vencimiento opcional con marca de vencida, descarga de PDF con el detalle del trabajo y numeración automática.
- **Link público por factura**: cada factura tiene un link compartible (`/i/<token>`, con token de 128 bits regenerable si se filtra) para que el cliente vea el detalle de horas sin necesidad de cuenta — trazabilidad externa.
- **Por país**: el perfil guarda el país del emisor (Argentina, Uruguay, Chile, México, ... ) y con eso se adaptan el tipo de ID fiscal (CUIT, RUT, RFC, ...), la moneda sugerida y el formato de los montos.
- **Conexión MCP**: cada usuario puede generar un token en Ajustes y conectar Registruti a Claude Desktop (o cualquier cliente MCP con header de autorización) para cargar horas y consultar cómo va por lenguaje natural. Ver [Servidor MCP](#servidor-mcp) más abajo.
- **Planes (freemium + lifetime access)**: el plan gratis incluye hasta 3 clientes activos y 4 facturas; el *lifetime access* (un único pago vía LemonSqueezy) desbloquea todo de por vida. Los límites se aplican en la base con triggers (no solo en el frontend), así que no son salteables desde la consola. Ver [Planes y límites](#planes-y-límites) más abajo.

## Stack

- [Next.js 15](https://nextjs.org/) (App Router) + React 19 + TypeScript
- [Tailwind CSS 4](https://tailwindcss.com/)
- [Supabase](https://supabase.com/) — autenticación y Postgres con Row Level Security
- Deploy en [Vercel](https://vercel.com/)

## Desarrollo local

```bash
npm install
npm run dev
```

La app usa por defecto las credenciales publicables del proyecto de Supabase `diamble-jamble`
(seguras de exponer: el acceso a los datos está protegido por RLS). Se pueden sobreescribir con:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## Modelo de datos

| Tabla | Descripción |
| --- | --- |
| `clients` | Clientes con tarifa por hora, moneda y color |
| `time_entries` | Entradas de tiempo (15 min a 8 h, múltiplos de 15) vinculadas a cliente y opcionalmente a una factura |
| `invoices` | Facturas por período con totales, estado y token público de acceso |

Las tres tablas tienen RLS por `user_id`. La función `get_public_invoice(token)` (security definer)
expone una factura puntual en modo lectura a través de su token no adivinable.

## Servidor MCP

Registruti expone un servidor [MCP](https://modelcontextprotocol.io/) en `POST /api/mcp`
(transporte Streamable HTTP) para operar la app por lenguaje natural desde Claude (web,
escritorio y celular), Claude Code, Cursor u otro cliente MCP. La conexión es de un clic: el
servidor es a la vez un **authorization server OAuth 2.1**, así que el cliente descubre solo
cómo autorizarse, manda al usuario a `/oauth/authorize`, y el usuario aprueba con su sesión de
Registruti. Sin instalar nada ni copiar tokens. Para clientes sin OAuth sigue existiendo el
token personal de Ajustes.

### Tools disponibles

| Tool | Scope | Qué hace |
| --- | --- | --- |
| `list_clients` | `read` | Lista los clientes con tarifa, moneda y color |
| `log_time` | `write` | Registra una entrada de tiempo (cliente, fecha, duración libre, descripción, facturable) |
| `list_time_entries` | `read` | Consulta entradas por rango de fechas y cliente |
| `report_summary` | `read` | Resumen de horas y montos facturables por cliente y período |

Cada token resuelve un `user_id` y un conjunto de scopes; todas las tools quedan scopeadas a
los datos de ese usuario. "Hoy" y los rangos por defecto se calculan en la zona horaria del país
del perfil (`countries.ts`), no en UTC. El `initialize` devuelve `instructions` con la fecha y la
zona del usuario para que el modelo resuelva "ayer" o "este mes" sin adivinar.

### Cómo conectarlo

- **Claude (web, escritorio, celular):** Ajustes → Conectores → Agregar conector personalizado,
  con la URL `https://registruti.app/api/mcp`. Al tocar *Conectar* se abre la pantalla de
  autorización de Registruti.
- **Claude Code:** `claude mcp add --transport http --scope user registruti https://registruti.app/api/mcp`
  y después `/mcp` → *Authenticate*.
- **Cursor y otros clientes con OAuth:** servidor MCP remoto apuntando a la misma URL.
- **Clientes sin OAuth** (archivo de configuración de Claude Desktop vía `mcp-remote`, scripts):
  token personal de Ajustes en el header `Authorization: Bearer reg_…`.

La guía para usuarios está en [`/blog/mcp`](https://registruti.app/blog/mcp).

> **Tiene que ser el apex, sin `www`.** `www.registruti.app` redirige a `registruti.app` y ese
> salto es cross-origin: `fetch` (el que usan todos los clientes MCP) borra el header
> `Authorization` al seguir el redirect, la request llega sin token y el server contesta 401.
> Por eso todo el metadata OAuth se arma desde `MCP_BASE_URL`/`SITE_URL` y no desde el host de
> la request.

### Cómo funciona el OAuth (Fase 2)

Implementado a mano en `src/lib/mcp/oauth.ts`, sin dependencias nuevas, siguiendo la
[spec de autorización de MCP](https://modelcontextprotocol.io/specification/latest/basic/authorization):

| Pieza | Ruta |
| --- | --- |
| Protected resource metadata (RFC 9728) | `/.well-known/oauth-protected-resource` y `/.well-known/oauth-protected-resource/api/mcp` |
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Registro dinámico de clientes (RFC 7591) | `POST /api/oauth/register` |
| Pantalla de autorización (consentimiento) | `GET /oauth/authorize` + `POST /api/oauth/authorize` |
| Token endpoint (`authorization_code` + PKCE, `refresh_token`) | `POST /api/oauth/token` |
| Revocación (RFC 7009) | `POST /api/oauth/revoke` |

- El 401 de `/api/mcp` lleva `WWW-Authenticate: Bearer resource_metadata="…", scope="read write"`,
  que es lo que dispara el flujo en el cliente.
- Clientes: registro dinámico (públicos o con `client_secret`) o **Client ID Metadata Document**
  (el `client_id` es una URL https con el metadata; se lee en el momento, sin registro).
  `redirect_uri` solo https, loopback http (puerto libre, RFC 8252) o esquemas de apps nativas.
- PKCE S256 obligatorio; `resource` (RFC 8707) validado contra el endpoint.
- La sesión de Registruti vive en el browser (supabase-js), así que la pantalla de autorización
  valida el pedido contra `/api/oauth/authorize` y aprueba con el JWT del usuario, que el server
  verifica con Supabase Auth antes de emitir el code (de un solo uso, 10 minutos).
- Access tokens de 1 hora (filas de `mcp_tokens` con `expires_at` y `grant_id`) y refresh tokens
  de 60 días que rotan en cada uso, con 60 segundos de gracia para dos refresh concurrentes.
  Reusar un code revoca lo que salió de él.
- Cada autorización es una fila de `oauth_grants`, que el usuario ve y revoca en Ajustes →
  *Apps conectadas*; borrarla borra en cascada sus tokens. Todo secreto se guarda como SHA-256.
  Reusar un refresh token ya rotado (fuera de la gracia) también revoca la autorización entera.
- El registro dinámico es anónimo y escribe en la base, así que está limitado por IP (20/hora)
  y en total (500/hora). El conteo y el insert los hace la función `oauth_register_client()`
  serializada con un advisory lock, así que el tope no se pasa con requests concurrentes; la IP
  se guarda solo como HMAC con clave del server. Los clientes que nunca completan una
  autorización se borran a los 7 días. Los Client ID Metadata Documents se leen con `src/lib/mcp/safeFetch.ts`, que valida la
  dirección resuelta en el propio socket (nada de loopback, privadas ni link-local) y no sigue
  redirects. La limpieza de codes y tokens vencidos corre cada hora por `pg_cron`
  (`mcp_oauth_cleanup()`), además de la limpieza oportunista de los endpoints.
- Si el login hace falta en el medio, `/auth/callback` vuelve a la pantalla de autorización
  (`src/lib/postLogin.ts`) en vez de al tracker.

### Configuración

El endpoint usa la service role key de Supabase; hay que definir `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY` como env vars en Vercel (ver [`supabase/README.md`](supabase/README.md))
y aplicar las migraciones `20260721000005_mcp_tokens.sql`, `20260903000007_mcp_oauth.sql`,
`20260903000008_mcp_oauth_hardening.sql` y `20260903000009_oauth_register_atomic.sql`.

Opcionales:

- `OAUTH_IP_HASH_SALT`: clave del HMAC con el que se guarda la IP que registra un cliente MCP
  (rate limit del registro dinámico). Si no está, se usa la service role key. Cambiarla solo
  reinicia los conteos de la última hora.
- `MCP_BASE_URL`: URL pública bajo la que se anuncian el servidor y sus endpoints OAuth
  (default `SITE_URL`). Sirve para probar el flujo completo en un preview de Vercel.
- `MCP_ALLOW_INSECURE_CLIENT_METADATA=1`: acepta Client ID Metadata Documents por http. Solo
  para la prueba local; se ignora si `VERCEL_ENV=production`.

### Prueba end-to-end

```bash
npm run test:mcp            # compila si hace falta, levanta un Supabase de mentira y next start
npm run test:mcp -- --build # fuerza recompilar
```

`scripts/mcp-e2e/run.mjs` recorre con el SDK oficial de MCP el mismo camino que hace Claude
(401 → descubrimiento → registro → autorización → canje → tools → refresh → revocación) y cubre a
mano los casos de borde (consentimiento denegado, redirect_uri ajena, reuso de code, PKCE
incorrecto, clientes confidenciales, scope de solo lectura, CIMD, token personal). Es lo que hay
que correr antes de tocar cualquier cosa del MCP.

## SEO

La captación orgánica apunta a búsquedas de "alternativa a Toggl Track", "time tracker
gratis/en español" y "control de horas" (long-tail). Estructura:

- **`/alternativa-toggl-track`** — página de comparación dedicada (la "money page"):
  tabla completa, precios 2026, guía de migración y FAQ con schema propio.
- **`/cuanto-cobrar-por-hora`** — calculadora de tarifa: la página con más impresiones
  orgánicas del sitio ("cuánto cobrar por hora" y sus variantes por especialidad y por
  país). Su artículo satélite es `/blog/cobrar-por-hora-o-por-proyecto`; se linkean entre
  sí, todas las páginas de marketing la enlazan (header, footer, landing, índice del blog)
  y el CTA del resultado pasa la tarifa al onboarding (`src/lib/calculatedRate.ts`).
- **`/blog`** — artículos registrados en `src/lib/blog.ts` (metadata) con cuerpo en
  `src/components/blog/*` y mapeo por slug en `src/app/blog/[slug]/page.tsx`.
  Feed RSS en `/blog/feed.xml`.
- **Structured data** — JSON-LD por página: `Organization` + `WebSite` +
  `SoftwareApplication` + `FAQPage` en la landing; `BlogPosting` + `BreadcrumbList`
  en los posts; `Blog` en el índice; `WebPage` + `FAQPage` + `BreadcrumbList` en la
  comparación.
- **Indexación** — `robots.ts` + headers `X-Robots-Tag: noindex` (vercel.json) para
  las rutas privadas (`/tracker`, `/clients`, `/reports`, `/invoices`, `/settings`,
  `/auth`, `/api`, `/i`); `sitemap.xml` generado desde `src/app/sitemap.ts`;
  `public/llms.txt` para asistentes de IA.
- **Search Console** — para verificar la propiedad por meta tag, setear en Vercel la
  env var `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` con el token del método "HTML tag"
  (solo el `content`). Alternativa: verificación por DNS, sin tocar nada acá.

Al publicar un post nuevo: entrada en `src/lib/blog.ts` + componente + mapeo del slug.
El sitemap, el feed y el índice lo levantan solos.

## Analítica (PostHog)

La app manda eventos a [PostHog](https://posthog.com/) para responder tres
preguntas del embudo: cuánta gente se registra, cuánta llega a cargar horas y
facturar, y cuánta ve el paywall y hace clic en el checkout.

**Env var en Vercel** (una sola, y es pública):

```
NEXT_PUBLIC_POSTHOG_KEY=phc_...   # Project API key, en PostHog → Settings → Project
```

`NEXT_PUBLIC_POSTHOG_HOST` es opcional y solo cambia si el proyecto se crea en
la región EU (`https://eu.i.posthog.com`); el default es US, que es donde está
Registruti. Sin la key, la analítica es un no-op: no se descarga el script ni
se manda un request, así que en local y en los previews no se ensucian los datos.

### Eventos

Están todos tipados en `src/lib/analytics.ts` (`AnalyticsEvent`): si un nombre
no está en esa unión, no compila.

| Evento | Dónde | Propiedades |
| --- | --- | --- |
| `signed_up` | vuelta del OAuth (`/auth/callback` y la landing) | — |
| `onboarding_completed` | fin del wizard, salteado o no | `last_step`, `created_client` |
| `time_entry_created` | tracker, registro rápido y repetir entrada | `source`, `duration_minutes`, `billable` |
| `invoice_created` | alta de factura | `currency`, `total_minutes`, `entries` |
| `paywall_shown` | se abre `UpgradeModal` | `reason` (`clients` / `invoices` / `general`) |
| `checkout_clicked` | clic en "Desbloquear lifetime access" | `reason` |

Más `$pageview` por navegación (a mano: con el App Router el automático solo
contaría la primera vista) y autocapture de clics en links y botones.

Las horas se pueden cargar también por el servidor MCP, y eso **no** genera
eventos: `log_time` corre server-side y `posthog-js` es del browser. Si el uso
por MCP crece, hay que sumar `posthog-node` en `src/lib/mcp/tools.ts`.

### Decisiones que conviene no deshacer sin pensarlo

- **Proxy inverso** (`/ingest` → PostHog, en `next.config.ts`): los eventos
  salen por el propio dominio, así que no los cortan los bloqueadores por lista.
  Obliga a `skipTrailingSlashRedirect: true`, porque varios endpoints de PostHog
  terminan en barra y la normalización de Next los redirigía antes del rewrite.
  No duplica URLs indexables: todas las páginas públicas declaran su `canonical`.
- **Carga diferida**: `posthog-js` pesa ~276 KB y esto vive en el layout raíz.
  Con el `import()` dinámico queda en un chunk aparte que no entra en el camino
  crítico de la landing ni de las páginas de comparación (la landing baja de
  258 kB a 168 kB de First Load JS). Los eventos que ocurren antes de que
  termine de cargar se encolan.
- **Nada de datos de los clientes del usuario**: no se mandan nombres de
  clientes, descripciones de tareas ni montos facturados. `invoice_created`
  lleva horas y moneda, no plata.
- **Session replay apagado** (`disable_session_recording`) y **DNT respetado**
  (`respect_dnt`), que es lo que promete `/privacy`. Con el proxy inverso, DNT
  es la única salida real que le queda a quien no quiere ser medido.
- **`person_profiles: "identified_only"`**: las visitas anónimas del marketing
  generan eventos igual (los embudos funcionan), pero no crean perfiles
  facturables.

## Planes y límites

Registruti es **freemium con lifetime access** (pago único, sin suscripción):

| | Plan gratis | Lifetime access |
| --- | --- | --- |
| Clientes activos | hasta **3** | ilimitados |
| Facturas | hasta **4** | ilimitadas |
| Pago | — | único, para siempre |

Al topar cualquiera de los dos límites (lo que llegue primero) la UI abre un
paywall con el checkout. Los topes se aplican con **triggers en Postgres**
(`clients`, `invoices`), no solo en el frontend, así que no se pueden saltear
desde la consola del browser. El entitlement vive en `profiles.pro` y está
**blindado**: el usuario no puede escribirlo; solo la service role o el SQL
Editor lo activan.

### Cobro con LemonSqueezy

El flujo de pago usa [LemonSqueezy](https://www.lemonsqueezy.com/):

1. El botón "Desbloquear lifetime access" abre el checkout de LemonSqueezy con el
   `user_id` de Registruti en `custom_data` y el email precargados.
2. Al concretarse el pago, LemonSqueezy dispara el evento `order_created` al
   webhook `POST /api/webhooks/lemonsqueezy`.
3. El endpoint verifica la firma HMAC y llama a la RPC `grant_pro`, que marca
   `profiles.pro = true` del usuario (resuelto por `user_id`, o por email si no
   vino). El pago con otro email igual se matchea gracias al `user_id`.

El webhook solo activa el `pro` si la orden es del **variant del lifetime
access** (`1934751`), como defensa por si un evento ajeno llegara al endpoint.

**Config del webhook** (LemonSqueezy → Settings → Webhooks):

- **Callback URL:** `https://registruti.app/api/webhooks/lemonsqueezy`
- **Signing secret:** un valor que elegís vos; el mismo va en la env var de Vercel.
- **Eventos:** `order_created`.

**Env vars en Vercel:**

```
LEMONSQUEEZY_WEBHOOK_SECRET=...      # el signing secret del webhook (secreto) — REQUERIDA

# Opcionales (tienen default hardcodeado):
NEXT_PUBLIC_LEMONSQUEEZY_CHECKOUT_URL=https://nicoproducto.lemonsqueezy.com/checkout/buy/...
LEMONSQUEEZY_VARIANT_ID=1934751     # variant del producto; 0 = no verificar
```

El checkout URL y el variant ya vienen con default en el código (son públicos),
así que solo hace falta setear `LEMONSQUEEZY_WEBHOOK_SECRET`. El webhook reusa
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` (las mismas del MCP) para activar el
acceso. Ver [`supabase/README.md`](supabase/README.md) para la activación manual
y el detalle de la migración.
