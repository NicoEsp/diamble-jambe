"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { supabase } from "@/lib/supabase";
import {
  buildCheckoutUrl,
  CHECKOUT_URL,
  FREE_CLIENT_LIMIT,
  FREE_INVOICE_LIMIT,
} from "@/lib/plan";
import { capture } from "@/lib/analytics";

type Reason = "clients" | "invoices" | "general";

const COPY: Record<Reason, { title: string; blocked: string }> = {
  clients: {
    title: "Llegaste al límite de clientes",
    blocked: `El plan gratis incluye hasta ${FREE_CLIENT_LIMIT} clientes activos. Podés archivar uno para liberar lugar, o desbloquear clientes ilimitados de por vida.`,
  },
  invoices: {
    title: "Llegaste al límite de facturas",
    blocked: `El plan gratis incluye hasta ${FREE_INVOICE_LIMIT} facturas. Desbloqueá facturas ilimitadas de por vida con un único pago.`,
  },
  general: {
    title: "Registruti, para siempre",
    blocked: `El plan gratis incluye hasta ${FREE_CLIENT_LIMIT} clientes y ${FREE_INVOICE_LIMIT} facturas. Desbloqueá todo de por vida con un único pago.`,
  },
};

const BENEFITS = [
  "Clientes ilimitados",
  "Facturas ilimitadas",
  "Un único pago, acceso para siempre — sin suscripción",
  "Todas las funciones futuras incluidas",
];

/**
 * Paywall del lifetime access. Se abre cuando el usuario topa un límite del
 * plan gratis. El CTA lleva al checkout de LemonSqueezy con el user_id y el
 * email precargados (así el webhook activa al usuario correcto). Si no hay
 * checkout configurado, cae a un mailto de contacto.
 */
export default function UpgradeModal({
  reason,
  onClose,
}: {
  reason: Reason;
  onClose: () => void;
}) {
  const copy = COPY[reason];
  const [href, setHref] = useState<string | null>(null);

  // El motivo separa "topó clientes" de "topó facturas" y del clic voluntario
  // desde Ajustes: son tres intenciones distintas y convierten distinto.
  useEffect(() => {
    capture("paywall_shown", { reason });
  }, [reason]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setHref(buildCheckoutUrl(data.user?.id ?? null, data.user?.email ?? null));
    });
  }, []);

  const external = Boolean(CHECKOUT_URL);

  return (
    <Modal title="Lifetime access" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">{copy.title}</p>
          <p className="mt-1 text-amber-700">{copy.blocked}</p>
        </div>

        <ul className="space-y-2">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-2 text-sm text-slate-700">
              <span className="mt-0.5 text-emerald-600">✓</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <a
          href={href ?? "#"}
          // `pointer-events-none` frena el mouse pero no el Enter del teclado:
          // sin esto, activar el CTA antes de que resuelva la URL contaría un
          // clic al checkout que nunca pasó y navegaría a "#".
          onClick={(event) => {
            if (href === null) {
              event.preventDefault();
              return;
            }
            capture("checkout_clicked", { reason });
          }}
          aria-disabled={href === null}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
          className={`block w-full rounded-lg bg-indigo-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-indigo-700 ${
            href === null ? "pointer-events-none opacity-60" : ""
          }`}
        >
          Desbloquear lifetime access
        </a>

        <button
          onClick={onClose}
          className="block w-full text-center text-xs text-slate-400 hover:text-slate-600"
        >
          Ahora no
        </button>
      </div>
    </Modal>
  );
}
