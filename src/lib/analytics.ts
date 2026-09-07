"use client";

import type { PostHog } from "posthog-js";

/**
 * Analítica de producto (PostHog).
 *
 * El objetivo es responder tres preguntas que hoy no tienen respuesta: cuánta
 * gente se registra, cuánta llega a cargar horas y facturar, y cuánta ve el
 * paywall y hace clic en el checkout. Nada más: la lista de eventos es corta a
 * propósito y está tipada acá abajo para que no se llene de nombres sueltos.
 *
 * Dos decisiones que valen para toda la instalación:
 *
 * 1. **Se carga aparte.** `posthog-js` pesa ~276 KB y esto vive en el layout
 *    raíz, así que estaría en el camino crítico de la landing y de las páginas
 *    de comparación —justo las que traen el tráfico orgánico y las que Google
 *    mide—. Con el `import()` dinámico de acá abajo queda en un chunk propio
 *    que se pide después de que la página ya es interactiva. Los eventos que
 *    ocurran antes de que termine de cargar se encolan y salen igual.
 *
 * 2. **Sin key, no existe.** Si falta `NEXT_PUBLIC_POSTHOG_KEY` (desarrollo
 *    local, previews) no se descarga el script ni se manda un solo request. La
 *    app nunca depende de que la analítica funcione.
 */

/** Project API key de PostHog (`phc_…`). Es pública: identifica al proyecto, no autoriza a leer nada. */
export const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

/**
 * Host del proyecto, según la región elegida al crearlo. Registruti está en US;
 * la env var solo hace falta si algún día se migra a EU
 * (`https://eu.i.posthog.com`), y esa elección es definitiva por proyecto.
 */
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

/**
 * Ruta propia por la que viajan los eventos. El rewrite de `next.config.ts` la
 * proxea al host de PostHog: para el browser es una request al mismo dominio,
 * así que no la corta uBlock/Brave ni ningún bloqueador de listas.
 */
export const POSTHOG_INGEST_PATH = "/ingest";

export const ANALYTICS_ENABLED = POSTHOG_KEY.length > 0;

/**
 * Todos los eventos que emite la app. Agregar uno nuevo es agregarlo acá: si no
 * está en esta unión, `capture()` no compila.
 *
 * - `signed_up` — primer ingreso de una cuenta nueva (vuelta del OAuth).
 * - `onboarding_completed` — el wizard de bienvenida terminó (salteado o no).
 * - `time_entry_created` — se registró tiempo (activación).
 * - `invoice_created` — se generó una factura (el momento de valor real).
 * - `paywall_shown` — se topó un límite del plan gratis y se abrió el modal.
 * - `checkout_clicked` — clic en "Desbloquear lifetime access" (salida a LemonSqueezy).
 */
export type AnalyticsEvent =
  | "signed_up"
  | "onboarding_completed"
  | "time_entry_created"
  | "invoice_created"
  | "paywall_shown"
  | "checkout_clicked";

type Props = Record<string, unknown>;

/** La instancia, una vez que el chunk bajó y se inicializó. */
let client: PostHog | null = null;
/** La carga en curso, para no pedir el chunk dos veces. */
let loading: Promise<void> | null = null;
/** Lo que se quiso registrar antes de que estuviera lista, en orden. */
const pending: Array<(ph: PostHog) => void> = [];

function load(): void {
  if (!ANALYTICS_ENABLED || typeof window === "undefined" || loading) return;
  loading = import("posthog-js")
    .then(({ default: posthog }) => {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_INGEST_PATH,
        // Adónde apunta el proxy: PostHog lo necesita para armar los links a su
        // propia UI ("ver esta persona") desde el debugger del browser.
        ui_host: POSTHOG_HOST,
        // Los pageviews los mandamos a mano desde PostHogProvider: con el App
        // Router la navegación del cliente no recarga la página, y el
        // automático solo contaría la primera vista de la sesión.
        capture_pageview: false,
        capture_pageleave: true,
        // Solo se crea perfil de persona para usuarios identificados. Las
        // visitas anónimas del marketing igual generan eventos (y los embudos
        // siguen funcionando), pero no inflan la cuenta de perfiles facturables.
        person_profiles: "identified_only",
        // Session replay apagado desde el código: grabar la app entera sería
        // guardar las horas, las descripciones y los clientes de cada usuario.
        // Si algún día hace falta, que sea una decisión explícita acá y no un
        // switch prendido por error en el panel.
        disable_session_recording: true,
        // Do Not Track respetado, como promete /privacy. Importa especialmente
        // acá: los eventos salen por nuestro propio dominio (ver el proxy de
        // next.config.ts), así que las listas de bloqueo no los frenan y esta
        // es la única salida real que le queda a quien no quiere ser medido.
        respect_dnt: true,
        // Autocapture acotado a clics en links y botones: alcanza para ver qué
        // CTA se tocan, sin registrar el tipeo de los formularios.
        autocapture: {
          dom_event_allowlist: ["click"],
          element_allowlist: ["a", "button"],
        },
      });
      client = posthog;
      // Todo lo que pasó mientras bajaba el chunk, en el orden original.
      for (const fn of pending.splice(0)) fn(posthog);
    })
    .catch(() => {
      // Un bloqueador o una red caída no pueden romper la app: se descartan los
      // eventos pendientes y se sigue como si la analítica no existiera.
      pending.length = 0;
    });
}

/** Corre `fn` con PostHog listo, disparando la carga si hace falta. */
function withPostHog(fn: (ph: PostHog) => void): void {
  if (!ANALYTICS_ENABLED || typeof window === "undefined") return;
  if (client) {
    fn(client);
    return;
  }
  pending.push(fn);
  load();
}

/** Empieza a cargar PostHog. Lo llama el provider una vez montada la página. */
export function initAnalytics(): void {
  load();
}

/** Registra un evento. */
export function capture(event: AnalyticsEvent, props?: Props): void {
  withPostHog((ph) => ph.capture(event, props));
}

/** Registra un pageview con la URL indicada. */
export function capturePageview(url: string): void {
  withPostHog((ph) => ph.capture("$pageview", { $current_url: url }));
}

/**
 * Asocia los eventos a un usuario. El id es el `user_id` de Supabase, así que
 * lo que se ve en PostHog se puede cruzar con la base sin ambigüedad.
 */
export function identifyUser(user: {
  id: string;
  email?: string | null;
  created_at?: string | null;
}): void {
  withPostHog((ph) =>
    ph.identify(
      user.id,
      { email: user.email ?? undefined },
      // Fecha de alta: se escribe una sola vez y no la pisa un login posterior.
      { signup_date: user.created_at ?? undefined }
    )
  );
}

/** Propiedades de la persona (el país del perfil, por ahora). */
export function setUserProperties(props: Props): void {
  withPostHog((ph) => ph.setPersonProperties(props));
}

/**
 * Corta el vínculo con el usuario al cerrar sesión, para no atribuirle a una
 * cuenta lo que hace la siguiente en el mismo browser. Si PostHog nunca llegó a
 * cargar no hay nada que resetear, y no vale la pena bajarlo para eso.
 */
export function resetAnalytics(): void {
  client?.reset();
}

/** Ventana en la que un ingreso todavía cuenta como alta y no como login. */
const SIGNUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Emite `signed_up` si quien vuelve del login es una cuenta recién creada.
 * Se llama al entrar a la app después del OAuth: alguien que vuelve tiene
 * `created_at` viejo y no dispara nada.
 */
export function captureSignupIfNew(createdAt?: string | null): void {
  if (!createdAt) return;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return;
  if (Date.now() - created > SIGNUP_WINDOW_MS) return;
  capture("signed_up");
}
