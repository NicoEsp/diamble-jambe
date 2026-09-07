import type { NextConfig } from "next";

/**
 * Host de PostHog según la región del proyecto (`https://us.i.posthog.com` o
 * `https://eu.i.posthog.com`). Los assets del SDK se sirven desde el subdominio
 * `-assets` de la misma región.
 */
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";
const POSTHOG_ASSETS_HOST = POSTHOG_HOST.replace("//us.", "//us-assets.").replace(
  "//eu.",
  "//eu-assets."
);

const nextConfig: NextConfig = {
  // Canonicalización de host (www vs apex): NO agregar redirects por host acá.
  //
  // Eso lo decide la config de Domains en el panel de Vercel, y tiene que ser
  // el único dueño. Un redirect a nivel app no puede ver cómo está configurado
  // el dominio en el edge: si el panel apunta en el sentido contrario, cada
  // capa deshace a la otra y el sitio entero cae con ERR_TOO_MANY_REDIRECTS
  // (pasó en producción: el panel mandaba apex → www y la app www → apex).
  //
  // Para canonicalizar en https://registruti.app (lo que declaran SITE_URL,
  // los canonical y el sitemap): Vercel → Settings → Domains → registruti.app
  // como dominio primario, y www.registruti.app en "Redirect to" hacia él.

  /**
   * Proxy inverso de PostHog: los eventos salen a `registruti.app/ingest` y
   * Vercel los reenvía. Para el browser es una request al propio dominio, así
   * que no la cortan los bloqueadores de anuncios (que sí bloquean
   * `*.i.posthog.com` por lista) y no se pierde un tercio de los datos.
   */
  async rewrites() {
    return [
      { source: "/ingest/static/:path*", destination: `${POSTHOG_ASSETS_HOST}/static/:path*` },
      { source: "/ingest/:path*", destination: `${POSTHOG_HOST}/:path*` },
    ];
  },

  /**
   * Varios endpoints de PostHog terminan en barra (`/decide/`, `/e/`), y la
   * normalización automática de Next los redirige antes de que el rewrite los
   * vea. Apagarla no duplica URLs indexables: todas las páginas públicas
   * declaran su `canonical` sin barra final.
   */
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
