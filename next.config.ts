import type { NextConfig } from "next";

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
  //
  // El proxy de `/ingest` hacia PostHog tampoco va acá. Un rewrite de config
  // reenvía los headers de la request tal cual: al ser same-origin el browser
  // adjunta las cookies del dominio, y terminan en un tercero (comprobado
  // contra un servidor de prueba, no es teórico). Vive en `src/middleware.ts`,
  // que las saca antes de reenviar.

  /**
   * Varios endpoints de PostHog terminan en barra (`/decide/`, `/e/`), y la
   * normalización automática de Next los redirige antes de que el middleware
   * de `/ingest` los vea. Apagarla no duplica URLs indexables: todas las
   * páginas públicas declaran su `canonical` sin barra final.
   */
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
