"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { consumePostLoginNext } from "@/lib/postLogin";
import { captureSignupIfNew } from "@/lib/analytics";
import Logo from "@/components/Logo";
import Wordmark from "@/components/Wordmark";

/**
 * Landing del OAuth de Google y del link de confirmación por email.
 * El cliente de Supabase (detectSessionInUrl) procesa los tokens de la URL;
 * acá esperamos la sesión y entramos a la app, o mostramos el error del provider.
 * Si el login arrancó desde otro flujo (la autorización OAuth del MCP que abre
 * Claude), volvemos a ese destino en vez de al tracker.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let done = false;
    const enter = (session: Session) => {
      if (done) return;
      done = true;
      // Única pasada por acá en todo el alta: si la cuenta se creó recién, es
      // un registro nuevo y no un login de alguien que vuelve.
      captureSignupIfNew(session.user);
      router.replace(consumePostLoginNext() ?? "/tracker");
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) enter(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) enter(session);
    });

    // Errores devueltos por el provider (en query o en el hash).
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const providerError = query.get("error_description") ?? hash.get("error_description");
    if (providerError) setError(providerError);

    // Si en unos segundos no hubo sesión ni error explícito, avisamos.
    const timer = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session && !done) {
          setError((prev) => prev ?? "No se pudo completar el inicio de sesión. Probá de nuevo.");
        }
      });
    }, 5000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-4 text-center">
      <div className="flex items-center gap-2">
        <Logo size={32} />
        <Wordmark className="text-xl text-slate-800" />
      </div>
      {error ? (
        <>
          <p className="max-w-sm text-sm text-red-600">{error}</p>
          <a href="/login" className="text-sm font-medium text-indigo-600 hover:underline">
            Volver a iniciar sesión
          </a>
        </>
      ) : (
        <p className="text-sm text-slate-500">Completando tu ingreso…</p>
      )}
    </div>
  );
}
