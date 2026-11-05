"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCrm } from "@/lib/data";
import { activitiesCsv, downloadCsv, prospectsCsv, stamp } from "@/lib/csv";
import type { Activity } from "@/lib/types";

type Factor = { id: string; status: string };
type Enrolling = { id: string; qr: string; secret: string };

export default function AccountPage() {
  const { supabase, me, prospects, memberName } = useCrm();
  const router = useRouter();

  // --- Contraseña ---
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [pwBusy, setPwBusy] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pw.length < 10)
      return setPwMsg({ ok: false, text: "Usá al menos 10 caracteres." });
    if (pw !== pw2)
      return setPwMsg({ ok: false, text: "Las contraseñas no coinciden." });
    setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    if (error) {
      return setPwMsg({
        ok: false,
        text: /same|different/i.test(error.message)
          ? "La nueva contraseña tiene que ser distinta a la actual."
          : "No se pudo cambiar. Si el problema sigue, cerrá sesión y volvé a entrar.",
      });
    }
    setPw("");
    setPw2("");
    setPwMsg({ ok: true, text: "Contraseña actualizada ✓" });
  }

  // --- Verificación en dos pasos ---
  const [verified, setVerified] = useState<Factor | null>(null);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState("");
  const [mfaMsg, setMfaMsg] = useState<string | null>(null);
  const [mfaBusy, setMfaBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const loadFactors = useCallback(async () => {
    const { data } = await supabase.auth.mfa.listFactors();
    setVerified(data?.totp?.[0] ?? null);
  }, [supabase]);

  useEffect(() => {
    void loadFactors();
  }, [loadFactors]);

  async function startEnroll() {
    setMfaMsg(null);
    setMfaBusy(true);
    // Limpia intentos abandonados para que no choquen con uno nuevo.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const f of all?.all ?? []) {
      if (f.status === "unverified")
        await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Impulso 365",
    });
    setMfaBusy(false);
    if (error || !data)
      return setMfaMsg(
        "No se pudo iniciar la activación. Reintentá en un momento.",
      );
    setEnrolling({
      id: data.id,
      qr: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setCode("");
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    if (!enrolling) return;
    setMfaBusy(true);
    setMfaMsg(null);
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolling.id,
      code: code.replace(/\s/g, ""),
    });
    setMfaBusy(false);
    if (error)
      return setMfaMsg(
        "Código incorrecto. Revisá que el que ingresás sea el actual de la app.",
      );
    setEnrolling(null);
    await loadFactors();
    router.refresh();
  }

  async function disable() {
    if (!verified) return;
    setMfaBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({
      factorId: verified.id,
    });
    setMfaBusy(false);
    setConfirmOff(false);
    if (error)
      return setMfaMsg(
        "No se pudo desactivar. Cerrá sesión, volvé a entrar con el código y reintentá.",
      );
    await loadFactors();
  }

  // --- Respaldo ---
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);

  async function backup(kind: "prospectos" | "historial") {
    setBackupBusy(true);
    setBackupMsg(null);
    if (kind === "prospectos") {
      downloadCsv(
        `impulso365-prospectos-completo-${stamp()}.csv`,
        prospectsCsv(prospects, memberName),
      );
      setBackupMsg(`Descargados ${prospects.length} prospectos.`);
      return setBackupBusy(false);
    }
    // El historial puede superar el límite de 1000 filas por consulta: se baja por páginas.
    const all: Activity[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("i365_activities")
        .select("*")
        .order("contacted_at", { ascending: false })
        .range(from, from + 999);
      if (error) {
        setBackupMsg("No se pudo descargar el historial. Reintentá.");
        return setBackupBusy(false);
      }
      all.push(...(data as Activity[]));
      if (!data || data.length < 1000) break;
    }
    const names = new Map(prospects.map((p) => [p.id, p.company_name]));
    downloadCsv(
      `impulso365-historial-${stamp()}.csv`,
      activitiesCsv(all, (id) => names.get(id) ?? "(eliminada)", memberName),
    );
    setBackupMsg(`Descargadas ${all.length} actividades.`);
    setBackupBusy(false);
  }

  async function signOutEverywhere() {
    await supabase.auth.signOut({ scope: "global" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-sm text-muted">
          {me?.full_name} · {me?.email}
        </p>
      </div>

      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-semibold">Verificación en dos pasos (2FA)</h2>
          <p className="text-sm text-muted">
            Además de la contraseña, pide un código de 6 dígitos de una app como
            Google Authenticator, Microsoft Authenticator o Authy. Si alguien
            averigua tu contraseña, igual no puede entrar.
          </p>
        </div>

        {verified && !enrolling && (
          <div className="space-y-3">
            <p className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm text-accent">
              ✓ Activada. Al ingresar te vamos a pedir el código.
            </p>
            {confirmOff ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-danger">
                  ¿Desactivar la verificación en dos pasos?
                </span>
                <button
                  className="btn-danger !py-1"
                  disabled={mfaBusy}
                  onClick={() => void disable()}
                >
                  Sí, desactivar
                </button>
                <button
                  className="btn-ghost !py-1"
                  onClick={() => setConfirmOff(false)}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                className="text-xs text-muted underline hover:text-danger"
                onClick={() => setConfirmOff(true)}
              >
                Desactivar
              </button>
            )}
          </div>
        )}

        {!verified && !enrolling && (
          <button
            className="btn-primary"
            disabled={mfaBusy}
            onClick={() => void startEnroll()}
          >
            {mfaBusy ? "Preparando…" : "Activar verificación en dos pasos"}
          </button>
        )}

        {enrolling && (
          <form onSubmit={confirmEnroll} className="space-y-4">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              <li>Abrí tu app autenticadora y elegí «agregar cuenta».</li>
              <li>Escaneá este código QR (o ingresá la clave a mano).</li>
              <li>Escribí abajo el código de 6 dígitos que muestra la app.</li>
            </ol>
            <div className="flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enrolling.qr}
                alt="Código QR para la app autenticadora"
                className="size-40 rounded-lg bg-white p-2"
              />
              <div className="min-w-0 text-sm">
                <div className="text-xs text-muted">Clave manual</div>
                <code className="break-all rounded bg-surface-2 px-2 py-1 text-xs">
                  {enrolling.secret}
                </code>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="mfa-code">
                Código de la app
              </label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                className="input !w-40 tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <button
                className="btn-primary"
                disabled={mfaBusy || code.replace(/\s/g, "").length < 6}
              >
                {mfaBusy ? "Verificando…" : "Confirmar y activar"}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setEnrolling(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        {mfaMsg && (
          <p role="alert" className="text-sm text-danger">
            {mfaMsg}
          </p>
        )}
      </section>

      <form onSubmit={changePassword} className="card space-y-4 p-5">
        <h2 className="font-semibold">Cambiar contraseña</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pw">
              Nueva contraseña
            </label>
            <input
              id="pw"
              type="password"
              autoComplete="new-password"
              minLength={10}
              className="input"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="pw2">
              Repetila
            </label>
            <input
              id="pw2"
              type="password"
              autoComplete="new-password"
              className="input"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted">
          Mínimo 10 caracteres. Mejor una frase larga que una palabra con
          números.
        </p>
        {pwMsg && (
          <p
            role={pwMsg.ok ? "status" : "alert"}
            className={`text-sm ${pwMsg.ok ? "text-accent" : "text-danger"}`}
          >
            {pwMsg.text}
          </p>
        )}
        <button className="btn-primary" disabled={pwBusy || !pw}>
          {pwBusy ? "Guardando…" : "Cambiar contraseña"}
        </button>
      </form>

      {me?.role === "admin" && (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="font-semibold">Respaldo de datos</h2>
            <p className="text-sm text-muted">
              Descargá una copia completa en CSV (se abre en Excel o Google
              Sheets). Guardala fuera de Supabase, por ejemplo en Drive, una vez
              por semana o antes de cambios grandes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-ghost"
              disabled={backupBusy}
              onClick={() => void backup("prospectos")}
            >
              Descargar prospectos ({prospects.length})
            </button>
            <button
              className="btn-ghost"
              disabled={backupBusy}
              onClick={() => void backup("historial")}
            >
              Descargar historial de actividad
            </button>
          </div>
          {backupMsg && (
            <p role="status" className="text-sm text-muted">
              {backupMsg}
            </p>
          )}
        </section>
      )}

      <section className="card space-y-2 p-5">
        <h2 className="font-semibold">Sesiones</h2>
        <p className="text-sm text-muted">
          Si perdiste un dispositivo o usaste una compu ajena, cerrá la sesión
          en todos lados.
        </p>
        <button className="btn-ghost" onClick={() => void signOutEverywhere()}>
          Cerrar sesión en todos los dispositivos
        </button>
      </section>
    </div>
  );
}
