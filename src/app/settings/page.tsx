"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import UpgradeModal from "@/components/UpgradeModal";
import { setUserProperties } from "@/lib/analytics";
import { supabase } from "@/lib/supabase";
import ConfirmDialog from "@/components/ConfirmDialog";
import { showToast } from "@/lib/appEvents";
import {
  FREE_CLIENT_LIMIT,
  FREE_INVOICE_LIMIT,
  fetchPlanStatus,
  type PlanStatus,
} from "@/lib/plan";
import { COUNTRIES, countryFor, localeFor, validateTaxId } from "@/lib/countries";
import { setMoneyLocale } from "@/lib/format";
import { sha256Hex } from "@/lib/crypto";
import { SITE_URL } from "@/lib/site";

export default function SettingsPage() {
  return (
    <AppShell>
      <Settings />
    </AppShell>
  );
}

function Settings() {
  const [businessName, setBusinessName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // `select *` tolera columnas todavía no migradas (ej. country).
    const { data, error: err } = await supabase.from("profiles").select("*").maybeSingle();
    if (err) {
      // Tabla inexistente (migración sin aplicar) u otro error: dejamos el form vacío.
      setError(err.message);
    } else if (data) {
      setBusinessName(data.business_name ?? "");
      setTaxId(data.tax_id ?? "");
      setEmail(data.email ?? "");
      setAddress(data.address ?? "");
      setCountry(data.country ?? "");
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const countryConfig = countryFor(country);
  const taxIdLabel = countryConfig?.taxIdLabel ?? "CUIT / ID fiscal";
  const taxIdPlaceholder = countryConfig?.taxIdPlaceholder ?? "20-12345678-9";
  const taxIdOk = validateTaxId(countryConfig, taxId);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No hay sesión activa.");
      setBusy(false);
      return;
    }
    const { error: err } = await supabase.from("profiles").upsert({
      user_id: user.id,
      business_name: businessName.trim() || null,
      tax_id: taxId.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      country: country || null,
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    // Los montos de toda la app pasan a formatearse con el locale del país.
    setMoneyLocale(localeFor(country || null));
    if (country) setUserProperties({ country });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Ajustes</h1>
      <p className="mb-6 text-sm text-slate-500">
        Datos del emisor que aparecen como <span className="font-medium">“De:”</span> en tus
        facturas en PDF.
      </p>

      {error && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">País</label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            >
              <option value="">Elegir…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag} {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Define el tipo de ID fiscal y el formato de los montos.
            </p>
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
            <label className="mb-1 block text-xs font-medium text-slate-500">{taxIdLabel}</label>
            <input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder={taxIdPlaceholder}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
            {!taxIdOk && (
              <p className="mt-1 text-xs text-amber-600">
                El formato no parece un {taxIdLabel} válido (ej. {taxIdPlaceholder}). Se guarda
                igual.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Email de contacto</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hola@tunegocio.com"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">Dirección</label>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              placeholder="Calle 123, Ciudad, País"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Guardando…" : "Guardar"}
            </button>
            {saved && <span className="text-sm text-emerald-600">Guardado ✓</span>}
          </div>
        </form>
      )}

      <PlanSection />

      <McpSection />

      <AccountSection />
    </div>
  );
}

function PlanSection() {
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  useEffect(() => {
    fetchPlanStatus().then(setStatus);
  }, []);

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Plan</h2>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {status === null ? (
          <p className="text-sm text-slate-400">Cargando…</p>
        ) : status.pro ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              ★ Lifetime access
            </span>
            <p className="text-sm text-slate-500">
              Tenés clientes y facturas ilimitados. Gracias por bancar el proyecto.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-700">Plan gratis</p>
              <p className="mt-1 text-sm text-slate-500">
                Usás{" "}
                <span className="font-medium text-slate-700">
                  {status.activeClients}/{FREE_CLIENT_LIMIT}
                </span>{" "}
                clientes y{" "}
                <span className="font-medium text-slate-700">
                  {status.invoices}/{FREE_INVOICE_LIMIT}
                </span>{" "}
                facturas.
              </p>
            </div>
            <button
              onClick={() => setShowUpgrade(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              Desbloquear lifetime access
            </button>
          </div>
        )}
      </div>
      {showUpgrade && <UpgradeModal reason="general" onClose={() => setShowUpgrade(false)} />}
    </section>
  );
}

interface McpToken {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface McpGrant {
  id: string;
  client_name: string;
  scope: string;
  created_at: string;
  last_used_at: string | null;
}

const MCP_ENDPOINT = `${SITE_URL}/api/mcp`;

/** Genera un token opaco de 256 bits: "reg_" + 64 chars hex. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `reg_${hex}`;
}

function usageLabel(createdAt: string, lastUsedAt: string | null): string {
  const created = new Date(createdAt).toLocaleDateString();
  return lastUsedAt
    ? `Conectada el ${created} · último uso ${new Date(lastUsedAt).toLocaleDateString()}`
    : `Conectada el ${created} · sin usar todavía`;
}

function McpSection() {
  const [grants, setGrants] = useState<McpGrant[]>([]);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null); // token recién creado (se muestra una vez)
  const [showTokens, setShowTokens] = useState(false);
  const [deleting, setDeleting] = useState<
    { kind: "grant"; item: McpGrant } | { kind: "token"; item: McpToken } | null
  >(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [grantsRes, tokensRes] = await Promise.all([
      supabase
        .from("oauth_grants")
        .select("id, client_name, scope, created_at, last_used_at")
        .order("created_at", { ascending: false }),
      // Los access tokens del flujo OAuth también viven en mcp_tokens (con
      // grant_id); acá solo van los personales.
      supabase
        .from("mcp_tokens")
        .select("id, name, created_at, last_used_at")
        .is("grant_id", null)
        .order("created_at", { ascending: false }),
    ]);
    const err = grantsRes.error ?? tokensRes.error;
    if (err) setError(err.message);
    else {
      setGrants(grantsRes.data as McpGrant[]);
      setTokens(tokensRes.data as McpToken[]);
      if ((tokensRes.data ?? []).length > 0) setShowTokens(true);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(MCP_ENDPOINT);
      showToast("✓ URL copiada");
    } catch {
      /* clipboard bloqueado */
    }
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("No hay sesión activa.");
      setCreating(false);
      return;
    }
    const token = generateToken();
    const token_hash = await sha256Hex(token);
    const { error: err } = await supabase
      .from("mcp_tokens")
      .insert({ user_id: user.id, token_hash, name: name.trim() || null });
    setCreating(false);
    if (err) {
      setError(err.message);
      return;
    }
    setFresh(token);
    setName("");
    load();
  }

  async function confirmDelete() {
    if (!deleting) return;
    const table = deleting.kind === "grant" ? "oauth_grants" : "mcp_tokens";
    const { error: err } = await supabase.from(table).delete().eq("id", deleting.item.id);
    const kind = deleting.kind;
    setDeleting(null);
    if (err) setError(err.message);
    else {
      showToast(kind === "grant" ? "✓ App desconectada" : "✓ Token revocado");
      load();
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-sm font-semibold text-slate-700">
        Conexión con Claude y otros asistentes (MCP)
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Cargá horas y consultá cómo vas hablándole a Claude (web, escritorio o celular), Claude
        Code, Cursor u otro cliente MCP.{" "}
        <Link href="/blog/mcp" className="text-indigo-600 hover:underline">
          Ver la guía paso a paso
        </Link>
        .
      </p>

      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <div>
          <p className="text-sm font-medium text-slate-700">Conectar una app</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            En Claude: <strong>Ajustes → Conectores → Agregar conector personalizado</strong>, pegá
            esta URL y, cuando te lo pida, autorizá el acceso con tu cuenta. En Claude Code:{" "}
            <code className="font-mono">claude mcp add --transport http registruti {MCP_ENDPOINT}</code>{" "}
            y después <code className="font-mono">/mcp</code> para autorizar.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-800">
              {MCP_ENDPOINT}
            </code>
            <button
              onClick={copyEndpoint}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Copiar
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700">Apps conectadas</p>
          {loading ? (
            <p className="mt-1 text-sm text-slate-400">Cargando…</p>
          ) : grants.length === 0 ? (
            <p className="mt-1 text-sm text-slate-400">
              Todavía no conectaste ninguna app. Cuando autorices una desde Claude u otro cliente,
              aparece acá.
            </p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-100">
              {grants.map((g) => (
                <li key={g.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {g.client_name}
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-500">
                        {g.scope.includes("write") ? "Lectura y carga de horas" : "Solo lectura"}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">{usageLabel(g.created_at, g.last_used_at)}</p>
                  </div>
                  <button
                    onClick={() => setDeleting({ kind: "grant", item: g })}
                    className="shrink-0 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    Desconectar
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <button
            onClick={() => setShowTokens((v) => !v)}
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
            aria-expanded={showTokens}
          >
            {showTokens ? "▾" : "▸"} Tokens personales (para clientes sin OAuth)
          </button>

          {showTokens && (
            <div className="mt-3 space-y-4">
              <p className="text-xs text-slate-500">
                Para clientes que no saben autorizar solos, como el archivo de configuración de
                Claude Desktop o un script propio: se manda como{" "}
                <code className="font-mono">Authorization: Bearer &lt;token&gt;</code>. Da acceso
                total a tus datos y no vence: tratalo como una contraseña.
              </p>

              {fresh && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-medium text-emerald-800">
                    Token nuevo — copialo ahora, no se vuelve a mostrar:
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs">
                      {fresh}
                    </code>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(fresh);
                          showToast("✓ Token copiado");
                        } catch {
                          /* clipboard bloqueado: el token sigue visible para copiarlo a mano */
                        }
                      }}
                      className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                    >
                      Copiar
                    </button>
                  </div>
                  <button
                    onClick={() => setFresh(null)}
                    className="mt-2 text-xs text-emerald-700 underline"
                  >
                    Ya lo guardé
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-40 flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Nombre del token (opcional)
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej: Claude Desktop"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {creating ? "Generando…" : "Generar token"}
                </button>
              </div>

              {loading ? null : tokens.length === 0 ? (
                <p className="text-sm text-slate-400">Todavía no generaste ningún token.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {tokens.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{t.name || "Sin nombre"}</p>
                        <p className="text-xs text-slate-500">
                          Creado {new Date(t.created_at).toLocaleDateString()}
                          {t.last_used_at
                            ? ` · último uso ${new Date(t.last_used_at).toLocaleDateString()}`
                            : " · sin usar"}
                        </p>
                      </div>
                      <button
                        onClick={() => setDeleting({ kind: "token", item: t })}
                        className="shrink-0 rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Revocar token"
                      >
                        🗑
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {deleting && (
        <ConfirmDialog
          title={deleting.kind === "grant" ? "Desconectar app" : "Revocar token"}
          message={
            deleting.kind === "grant"
              ? `${deleting.item.client_name} va a dejar de tener acceso a tu cuenta. Podés volver a conectarla cuando quieras.`
              : `Se va a revocar "${deleting.item.name || "Sin nombre"}". Cualquier cliente MCP que lo use dejará de tener acceso.`
          }
          confirmLabel={deleting.kind === "grant" ? "Desconectar" : "Revocar"}
          danger
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </section>
  );
}

function AccountSection() {
  const [email, setEmail] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null));
  }, []);

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Cuenta</h2>
      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {email && <p className="truncate text-sm text-slate-500">{email}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setChangingPassword(true)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
          >
            Cambiar contraseña
          </button>
          <button
            onClick={() => supabase.auth.signOut()}
            className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
      {changingPassword && <PasswordModal onClose={() => setChangingPassword(false)} />}
    </section>
  );
}

function PasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    showToast("✓ Contraseña actualizada");
    onClose();
  }

  return (
    <Modal title="Cambiar contraseña" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Nueva contraseña
          </label>
          <input
            type="password"
            autoFocus
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">
            Repetir contraseña
          </label>
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
          />
        </div>
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
            disabled={busy || !password || !confirmation}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Actualizar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
