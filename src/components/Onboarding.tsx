"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CLIENT_COLORS, CURRENCIES } from "@/lib/types";
import { COUNTRIES, countryFor, localeFor } from "@/lib/countries";
import { setMoneyLocale } from "@/lib/format";
import { takeCalculatedRate } from "@/lib/calculatedRate";
import { capture, setUserProperties } from "@/lib/analytics";

const ONBOARDED_KEY = "registruti_onboarded_v1";

/**
 * Wizard de bienvenida para usuarios nuevos. Se muestra una sola vez, cuando el
 * usuario todavía no tiene proyectos cargados. Pide (de forma opcional) datos de
 * facturación y ayuda a crear el primer proyecto. Todo es salteable.
 */
export default function Onboarding() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  // Datos de facturación (opcionales)
  const [country, setCountry] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [taxId, setTaxId] = useState("");

  // Primer proyecto
  const [projectName, setProjectName] = useState("");
  const [rate, setRate] = useState("");
  const [currency, setCurrency] = useState<string>("USD");

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  /** La tarifa vino de la calculadora pública, no de un default nuestro. */
  const [rateFromCalculator, setRateFromCalculator] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(ONBOARDED_KEY)) return;
    // Solo mostramos el wizard si el usuario no tiene proyectos aún.
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (error) return; // ante cualquier problema, no molestamos
        if ((count ?? 0) === 0) setShow(true);
        else localStorage.setItem(ONBOARDED_KEY, "1");
      });
  }, []);

  // Si la persona llegó desde la calculadora de tarifa, el primer cliente
  // arranca con el número que calculó. Se consume recién cuando el wizard se
  // va a mostrar: si no, lo borraríamos sin usarlo.
  useEffect(() => {
    if (!show) return;
    const calculated = takeCalculatedRate();
    if (!calculated) return;
    setRate(String(calculated.rate));
    setCurrency(calculated.currency);
    setRateFromCalculator(true);
  }, [show]);

  function finish() {
    // `step` dice hasta dónde llegó: 3 es el wizard completo, menos es salida
    // temprana. Es la diferencia entre "el onboarding es largo" y "no engancha".
    capture("onboarding_completed", { last_step: step, created_client: changed });
    if (typeof window !== "undefined") localStorage.setItem(ONBOARDED_KEY, "1");
    setShow(false);
    if (changed) window.location.reload();
  }

  async function saveBilling() {
    setBusy(true);
    setNote(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && (country || businessName.trim() || taxId.trim())) {
      const { error } = await supabase.from("profiles").upsert({
        user_id: user.id,
        business_name: businessName.trim() || null,
        tax_id: taxId.trim() || null,
        country: country || null,
      });
      if (error) {
        // La tabla puede no existir todavía (migración sin aplicar): no bloqueamos.
        setNote("No se pudieron guardar los datos de facturación ahora; podés cargarlos luego en Ajustes.");
      } else {
        if (country) {
          setMoneyLocale(localeFor(country));
          setUserProperties({ country });
        }
        setChanged(true);
      }
    }
    setBusy(false);
    setStep(2);
  }

  async function createProject() {
    if (!projectName.trim()) return;
    setBusy(true);
    setNote(null);
    const { error } = await supabase.from("clients").insert({
      name: projectName.trim(),
      hourly_rate: rate ? Number(rate) : 0,
      currency,
      color: CLIENT_COLORS[0],
    });
    setBusy(false);
    if (error) {
      setNote(error.message);
      return;
    }
    setChanged(true);
    setStep(3);
  }

  if (!show) return null;

  return (
    <div
      data-overlay
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4"
    >
      <div className="sheet-in w-full max-w-md rounded-t-2xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-6">
        {/* Progreso */}
        <div className="mb-5 flex gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? "bg-indigo-600" : "bg-slate-200"}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Bienvenido/a a Registruti 👋</h2>
            <p className="mt-2 text-sm text-slate-600">
              Registruti te ayuda a ver <strong>cuánto tiempo le dedicás a cada proyecto</strong>.
              Cargás tus horas en segundos y sabés al instante en qué se te va la semana. Si además
              querés facturar esas horas, también podés.
            </p>
            <div className="mt-6 flex justify-between">
              <button onClick={finish} className="text-sm text-slate-500 hover:text-slate-800">
                Saltar
              </button>
              <button
                onClick={() => setStep(1)}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Empezar
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Datos de facturación</h2>
            <p className="mt-1 text-sm text-slate-500">
              Opcional. Sólo los necesitás si vas a generar facturas. Podés completarlos después en
              Ajustes.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  ¿Desde dónde trabajás?
                </label>
                <select
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    // La moneda del primer proyecto arranca en la del país.
                    const config = countryFor(e.target.value);
                    // El país sugiere moneda, pero no pisa la que la persona
                    // eligió en la calculadora: quedaría una tarifa en dólares
                    // rotulada en pesos.
                    if (config && !rateFromCalculator) setCurrency(config.currency);
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Elegir país…</option>
                  {COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.flag} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Nombre o razón social
                </label>
                <input
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Tu nombre o el de tu negocio"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  {countryFor(country)?.taxIdLabel ?? "CUIT / ID fiscal"}
                </label>
                <input
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                  placeholder={countryFor(country)?.taxIdPlaceholder ?? "20-12345678-9"}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
            {note && <p className="mt-3 text-xs text-amber-600">{note}</p>}
            <div className="mt-6 flex justify-between">
              <button
                onClick={() => setStep(2)}
                className="text-sm text-slate-500 hover:text-slate-800"
              >
                Omitir
              </button>
              <button
                onClick={saveBilling}
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? "Guardando…" : "Continuar"}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Tu primer proyecto</h2>
            <p className="mt-1 text-sm text-slate-500">
              Un proyecto (o cliente) es aquello a lo que le vas a imputar tiempo.
            </p>
            {rateFromCalculator && (
              <p className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                Dejamos cargada la tarifa que calculaste: {rate} {currency} por hora. Podés
                cambiarla acá o después, cliente por cliente.
              </p>
            )}
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Nombre</label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Ej: App de Juan, Cliente X…"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Tarifa por hora (opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs font-medium text-slate-500">Moneda</label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {note && <p className="mt-3 text-xs text-red-600">{note}</p>}
            <div className="mt-6 flex justify-between">
              <button onClick={finish} className="text-sm text-slate-500 hover:text-slate-800">
                Omitir
              </button>
              <button
                onClick={createProject}
                disabled={busy || !projectName.trim()}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy ? "Creando…" : "Crear proyecto"}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-semibold tracking-tight">¡Listo! 🎉</h2>
            <p className="mt-2 text-sm text-slate-600">
              Ya podés empezar a cargar tu tiempo. Entrá al Tracker y sumá tu primera entrada del
              día.
            </p>
            <div className="mt-6 flex justify-end">
              <button
                onClick={finish}
                className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Ir al tracker
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
