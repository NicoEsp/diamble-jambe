"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Modal from "@/components/Modal";
import BillableCheckbox from "@/components/BillableCheckbox";
import DurationInput from "@/components/DurationInput";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import { formatDuration, toISODate } from "@/lib/format";
import { emitEntryAdded, showToast } from "@/lib/appEvents";
import { capture } from "@/lib/analytics";

/**
 * Registro rápido de tiempo, invocable desde cualquier pantalla (atajo T,
 * command palette o el botón + en mobile). Al guardar emite un evento para
 * que el tracker se refresque si está abierto, y muestra un toast.
 */
export default function QuickAddEntry({ onClose }: { onClose: () => void }) {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [clientId, setClientId] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [duration, setDuration] = useState<number | null>(60);
  const [billable, setBillable] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("clients")
      .select("*")
      .eq("archived", false)
      .order("name")
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
          setClients([]);
          return;
        }
        setClients(data);
        if (data.length === 1) setClientId(data[0].id);
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || duration == null) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("time_entries").insert({
      client_id: clientId,
      entry_date: date,
      duration_minutes: duration,
      description,
      billable,
    });
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    capture("time_entry_created", { source: "quick_add", duration_minutes: duration, billable });
    const clientName = clients?.find((c) => c.id === clientId)?.name ?? "";
    emitEntryAdded();
    showToast(`✓ ${formatDuration(duration)} registradas a ${clientName}`);
    onClose();
  }

  return (
    <Modal title="Registrar tiempo" onClose={onClose}>
      {clients !== null && clients.length === 0 ? (
        <p className="text-sm text-slate-500">
          Todavía no tenés clientes activos.{" "}
          <Link href="/clients" onClick={onClose} className="font-medium text-indigo-600 hover:underline">
            Creá el primero
          </Link>{" "}
          para empezar a registrar tiempo.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              ¿En qué trabajaste?
            </label>
            <input
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción de la tarea"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Cliente</label>
            <select
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Elegir…</option>
              {(clients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Duración</label>
              <DurationInput value={duration} onChange={setDuration} />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500">Fecha</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
          <BillableCheckbox checked={billable} onChange={setBillable} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center justify-between pt-2">
            <span className="hidden text-[11px] text-slate-400 sm:block">
              Enter para guardar · Esc para cerrar
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !clientId || duration == null}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Registrar"}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
