import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy de ingesta de PostHog.
 *
 * Los eventos salen a `registruti.app/ingest` en vez de a `*.i.posthog.com`
 * para que no los corten los bloqueadores por lista. El costo de esa decisión
 * es que, al ser same-origin, el browser adjunta a esas requests las cookies
 * del propio dominio, y un rewrite de `next.config.ts` reenvía los headers tal
 * cual: cualquier cookie o header de autorización nuestro terminaría en un
 * tercero. Por eso el reenvío pasa por acá y no por la config: sacamos
 * `Cookie` y `Authorization` antes de mandar.
 *
 * El `matcher` de abajo lo limita a `/ingest/*`, así que ninguna otra ruta de
 * la app paga el costo de este middleware.
 */

// Mismos valores que `POSTHOG_HOST` en src/lib/analytics.ts. Van duplicados a
// propósito: este archivo corre en el edge runtime y no debería arrastrar el
// módulo de analítica (que es "use client" e importa el SDK).
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS_HOST = POSTHOG_HOST.replace("//us.", "//us-assets.").replace(
  "//eu.",
  "//eu-assets."
);

const INGEST_PREFIX = "/ingest";
const ASSETS_PREFIX = "/ingest/static/";

export const config = {
  matcher: "/ingest/:path*",
};

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Los assets del SDK se sirven desde el subdominio `-assets` de la región.
  const base = pathname.startsWith(ASSETS_PREFIX) ? POSTHOG_ASSETS_HOST : POSTHOG_HOST;
  const target = new URL(`${pathname.slice(INGEST_PREFIX.length)}${search}`, base);

  const headers = new Headers(request.headers);
  headers.delete("cookie");
  headers.delete("authorization");

  return NextResponse.rewrite(target, { request: { headers } });
}
