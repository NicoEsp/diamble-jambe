"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import BillableCheckbox from "@/components/BillableCheckbox";
import ConfirmDialog from "@/components/ConfirmDialog";
import DurationInput from "@/components/DurationInput";
import { supabase } from "@/lib/supabase";
import { capture } from "@/lib/analytics";
import { ENTRY_ADDED_EVENT, showToast, useAppEvent } from "@/lib/appEvents";
import type { Client, TimeEntry } from "@/lib/types";
import {
  DAY_ABBREV,
  addDays,
  formatDayLabel,
  formatDuration,
  formatShortDate,
  parseISODate,
  startOfWeek,
  toISODate,
} from "@/lib/format";

export default function TrackerPage() {
  return (
    <AppShell>
      <Tracker />
    </AppShell>
  );
}

function Tracker() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [deleting, setDeleting] = useState<TimeEntry | null>(null);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);

  // New entry form
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState("");
  const [date, setDate] = useState(toISODate(new Date()));
  const [duration, setDuration] = useState<number | null>(60);
  const [billable, setBillable] = useState(true);
  const [saving, setSaving] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toISODate(addDays(weekStart, i))),
    [weekStart]
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    const from = toISODate(weekStart);
    const to = toISODate(addDays(weekStart, 6));
    const [clientsRes, entriesRes] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase
        .from("time_entries")
        .select("*")
        .gte("entry_date", from)
        .lte("entry_date", to)
        .order("created_at", { ascending: false }),
    ]);
    if (clientsRes.error || entriesRes.error) {
      setError(clientsRes.error?.message ?? entriesRes.error?.message ?? null);
    } else {
      setClients(clientsRes.data);
      setEntries(entriesRes.data);
      setError(null);
    }
    setLoading(false);
  }, [weekStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Refrescar en vivo cuando se registra tiempo desde el atajo global (T / ⌘K / botón +).
  useAppEvent(ENTRY_ADDED_EVENT, loadData);

  const activeClients = clients.filter((c) => !c.archived);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const weekTotal = entries.reduce((sum, e) => sum + e.duration_minutes, 0);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId || duration == null) return;
    setSaving(true);
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
    capture("time_entry_created", {
      source: "tracker",
      duration_minutes: duration,
      billable,
    });
    setDescription("");
    loadData();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const { error: err } = await supabase.from("time_entries").delete().eq("id", deleting.id);
    setDeleting(null);
    if (err) setError(err.message);
    else loadData();
  }

  // Duplica una entrada con fecha de hoy: ideal para trabajo recurrente.
  async function handleRepeat(entry: TimeEntry) {
    if (repeatingId === entry.id) return; // ya hay un insert de esta entrada en vuelo
    setRepeatingId(entry.id);
    const { error: err } = await supabase.from("time_entries").insert({
      client_id: entry.client_id,
      entry_date: today,
      duration_minutes: entry.duration_minutes,
      description: entry.description,
      billable: entry.billable,
    });
    setRepeatingId(null);
    if (err) {
      setError(err.message);
      return;
    }
    capture("time_entry_created", {
      source: "repeat",
      duration_minutes: entry.duration_minutes,
      billable: entry.billable,
    });
    showToast(
      `✓ ${formatDuration(entry.duration_minutes)} registradas hoy a ${
        clientById.get(entry.client_id)?.name ?? "cliente"
      }`
    );
    loadData();
  }

  const today = toISODate(new Date());
  const isViewingToday = date === today && weekDays.includes(today);

  function goToToday() {
    setWeekStart(startOfWeek(new Date()));
    setDate(today);
  }

  function shiftWeek(delta: number) {
    setWeekStart(addDays(weekStart, delta * 7));
    setDate(toISODate(addDays(parseISODate(date), delta * 7)));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Tracker</h1>
          <span className="shrink-0 text-sm text-slate-500">
            Semana <strong className="text-slate-900">{formatDuration(weekTotal)}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftWeek(-1)}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-100 sm:py-1.5"
            title="Semana anterior"
          >
            ‹
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-slate-700">
            {formatShortDate(weekDays[0])} – {formatShortDate(weekDays[6])}
          </span>
          <button
            onClick={() => shiftWeek(1)}
            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm hover:bg-slate-100 sm:py-1.5"
            title="Semana siguiente"
          >
            ›
          </button>
          <button
            onClick={goToToday}
            disabled={isViewingToday}
            className="shrink-0 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 sm:py-1.5"
            title="Ir a hoy"
          >
            Hoy
          </button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-7 gap-1 sm:gap-2">
        {weekDays.map((day) => {
          const d = parseISODate(day);
          const dayTotal = entries
            .filter((e) => e.entry_date === day)
            .reduce((s, e) => s + e.duration_minutes, 0);
          const selected = date === day;
          const isToday = day === today;
          return (
            <button
              key={day}
              onClick={() => setDate(day)}
              className={`flex min-w-0 flex-col items-center rounded-lg border px-0.5 py-2 transition sm:rounded-xl sm:px-2 ${
                selected
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : isToday
                    ? "border-indigo-300 bg-white"
                    : "border-slate-200 bg-white hover:border-indigo-300"
              }`}
              title={`Seleccionar ${formatDayLabel(day)} para cargar horas`}
            >
              <span
                className={`text-[10px] font-medium uppercase ${
                  selected ? "text-indigo-100" : isToday ? "text-indigo-600" : "text-slate-400"
                }`}
              >
                {DAY_ABBREV[d.getDay()]}
              </span>
              <span className="text-sm font-semibold sm:text-base">{d.getDate()}</span>
              <span
                className={`font-mono text-[10px] ${
                  selected ? "text-indigo-100" : "text-slate-500"
                }`}
              >
                {dayTotal > 0 ? formatDuration(dayTotal) : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <form
        onSubmit={handleAdd}
        className="mb-8 flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="w-full sm:min-w-36 sm:flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">
            ¿En qué trabajaste?
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción de la tarea"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-medium text-slate-500">Cliente</label>
          <select
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none sm:w-auto"
          >
            <option value="">Elegir…</option>
            {activeClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-full gap-3 sm:w-auto">
          <div className="flex-1 sm:flex-none">
            <label className="mb-1 block text-xs font-medium text-slate-500">Fecha</label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex-1 sm:w-36 sm:flex-none">
            <label className="mb-1 block text-xs font-medium text-slate-500">Duración</label>
            <DurationInput value={duration} onChange={setDuration} />
          </div>
        </div>
        {/* pt-5 en sm+ compensa la altura del label de los otros campos, para
            que el checkbox y el botón queden en línea con los inputs. */}
        <div className="flex w-full items-center justify-between gap-4 xl:w-auto xl:justify-start xl:pt-5">
          <BillableCheckbox checked={billable} onChange={setBillable} compact />
          <button
            type="submit"
            disabled={saving || !clientId || duration == null}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-[0.98] disabled:opacity-50 sm:py-2"
          >
            Agregar
          </button>
        </div>
      </form>

      {activeClients.length === 0 && !loading && (
        <p className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Todavía no tenés clientes. Creá uno en la sección{" "}
          <a href="/clients" className="font-medium underline">
            Clientes
          </a>{" "}
          para empezar a trackear.
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <div className="space-y-6">
          {weekDays.map((day) => {
            const dayEntries = entries.filter((e) => e.entry_date === day);
            if (dayEntries.length === 0) return null;
            const dayTotal = dayEntries.reduce((s, e) => s + e.duration_minutes, 0);
            return (
              <section key={day}>
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-slate-700">{formatDayLabel(day)}</h2>
                  <span className="text-sm text-slate-500">{formatDuration(dayTotal)}</span>
                </div>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
                  {dayEntries.map((entry) => {
                    const client = clientById.get(entry.client_id);
                    return (
                      <div key={entry.id} className="flex items-center gap-2 py-2.5 pl-4 pr-2 sm:gap-3 sm:py-3 sm:pr-3">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: client?.color ?? "#94a3b8" }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">
                            {entry.description || (
                              <span className="italic text-slate-400">Sin descripción</span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {client?.name ?? "Cliente eliminado"}
                            {entry.invoice_id && (
                              <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">
                                Facturada
                              </span>
                            )}
                            {!entry.billable && (
                              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                                No facturable
                              </span>
                            )}
                          </p>
                        </div>
                        <span className="font-mono text-sm font-medium">
                          {formatDuration(entry.duration_minutes)}
                        </span>
                        <button
                          onClick={() => handleRepeat(entry)}
                          disabled={repeatingId === entry.id}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm text-slate-400 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-30"
                          title="Repetir hoy"
                        >
                          ↻
                        </button>
                        <button
                          onClick={() => setEditing(entry)}
                          disabled={!!entry.invoice_id}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm text-slate-400 hover:bg-slate-50 hover:text-indigo-600 disabled:opacity-30"
                          title={entry.invoice_id ? "Entrada facturada" : "Editar"}
                        >
                          ✎
                        </button>
                        <button
                          onClick={() => setDeleting(entry)}
                          disabled={!!entry.invoice_id}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm text-slate-400 hover:bg-slate-50 hover:text-red-600 disabled:opacity-30"
                          title={entry.invoice_id ? "Entrada facturada" : "Eliminar"}
                        >
                          🗑
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {entries.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-400">
              No hay entradas esta semana.
            </p>
          )}
        </div>
      )}

      {editing && (
        <EditEntryModal
          entry={editing}
          clients={activeClients}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            loadData();
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title="Eliminar entrada"
          message={`Se va a eliminar "${
            deleting.description || "Sin descripción"
          }" (${formatDuration(deleting.duration_minutes)}) del ${formatDayLabel(
            deleting.entry_date
          )}.`}
          confirmLabel="Eliminar"
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function EditEntryModal({
  entry,
  clients,
  onClose,
  onSaved,
}: {
  entry: TimeEntry;
  clients: Client[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(entry.description);
  const [clientId, setClientId] = useState(entry.client_id);
  const [date, setDate] = useState(entry.entry_date);
  const [duration, setDuration] = useState<number | null>(entry.duration_minutes);
  const [billable, setBillable] = useState(entry.billable);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (duration == null) return;
    setSaving(true);
    const { error: err } = await supabase
      .from("time_entries")
      .update({
        description,
        client_id: clientId,
        entry_date: date,
        duration_minutes: duration,
        billable,
      })
      .eq("id", entry.id);
    setSaving(false);
    if (err) setError(err.message);
    else onSaved();
  }

  return (
    <Modal title="Editar entrada" onClose={onClose}>
      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Descripción</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Cliente</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-500">Duración</label>
            <DurationInput value={duration} onChange={setDuration} />
          </div>
        </div>
        <BillableCheckbox checked={billable} onChange={setBillable} />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || duration == null}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}
