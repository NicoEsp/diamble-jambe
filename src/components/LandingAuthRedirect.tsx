"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { consumePostLoginNext } from "@/lib/postLogin";
import { captureSignupIfNew } from "@/lib/analytics";

/**
 * Red de seguridad para el retorno de OAuth / confirmación de email.
 *
 * Si en Supabase la Redirect URL exacta (`/auth/callback`) no matchea la
 * allowlist, el token vuelve al Site URL raíz — es decir, a esta landing —
 * con `#access_token=...` en el hash. El cliente de Supabase
 * (detectSessionInUrl) igual procesa ese token y crea la sesión, pero la
 * landing no tiene lógica para entrar a la app y el usuario queda mirando el
 * marketing. Acá detectamos ese caso y lo mandamos al tracker.
 *
 * Solo actúa cuando hay un token de auth en la URL: un usuario ya logueado que
 * navega la landing a propósito (sin hash) no se ve afectado.
 */
export default function LandingAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash;
    const isAuthReturn = hash.includes("access_token=") || hash.includes("error=");
    if (!isAuthReturn) return;

    let done = false;
    const enter = (session: Session) => {
      if (done) return;
      done = true;
      captureSignupIfNew(session.user);
      router.replace(consumePostLoginNext() ?? "/tracker");
    };

    // La sesión puede quedar lista antes o después de suscribirnos.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) enter(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) enter(session);
    });

    return () => sub.subscription.unsubscribe();
  }, [router]);

  return null;
}
