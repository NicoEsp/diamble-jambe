"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  ANALYTICS_ENABLED,
  capturePageview,
  identifyUser,
  initAnalytics,
  resetAnalytics,
} from "@/lib/analytics";

/**
 * Arranca PostHog y lo mantiene al día con la navegación y la sesión.
 *
 * Va en el layout raíz, así cubre marketing y app con la misma instalación: el
 * embudo "visita la landing → se registra → carga horas → factura" necesita que
 * sea el mismo usuario anónimo el que después se identifica.
 *
 * Si no hay key configurada no monta nada.
 */
export default function PostHogProvider() {
  useEffect(() => {
    initAnalytics();
  }, []);

  // La sesión de Supabase manda: cada vez que hay usuario lo identificamos, y
  // al salir cortamos el vínculo para no atribuirle a una cuenta lo que hace la
  // siguiente en el mismo browser.
  useEffect(() => {
    if (!ANALYTICS_ENABLED) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        identifyUser({
          id: session.user.id,
          email: session.user.email,
          created_at: session.user.created_at,
        });
      } else if (event === "SIGNED_OUT") {
        resetAnalytics();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ANALYTICS_ENABLED) return null;

  // useSearchParams obliga a un límite de Suspense: sin él, toda página que
  // monte este componente se vuelve dinámica y las estáticas del marketing
  // dejarían de prerenderizarse.
  return (
    <Suspense fallback={null}>
      <PageviewTracker />
    </Suspense>
  );
}

/**
 * Un `$pageview` por navegación. Con el App Router los cambios de ruta no
 * recargan la página, así que el pageview automático de posthog-js solo
 * contaría la primera vista de la sesión.
 */
function PageviewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!pathname) return;
    const query = searchParams.toString();
    capturePageview(`${window.location.origin}${pathname}${query ? `?${query}` : ""}`);
  }, [pathname, searchParams]);

  return null;
}
