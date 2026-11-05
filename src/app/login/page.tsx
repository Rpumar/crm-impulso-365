"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [factorId, setFactorId] = useState<string | null>(null); // si no es null → paso de código 2FA
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Devuelve el factor TOTP si la sesión actual todavía necesita el segundo paso.
  async function pendingFactor() {
    const supabase = createClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel !== "aal2" || aal?.currentLevel === "aal2") return null;
    const { data } = await supabase.auth.mfa.listFactors();
    return data?.totp?.[0]?.id ?? null;
  }

  // Si llegó con la contraseña ya validada pero sin el código, va directo al paso 2.
  useEffect(() => {
    void pendingFactor().then((id) => id && setFactorId(id));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      setError("Email o contraseña incorrectos.");
      setBusy(false);
      return;
    }
    const pending = await pendingFactor();
    if (pending) {
      setFactorId(pending);
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s/g, ""),
    });
    if (error) {
      setError("Código incorrecto o vencido. Probá con el que muestra tu app ahora.");
      setBusy(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  async function cancel() {
    await createClient().auth.signOut();
    setFactorId(null);
    setCode("");
    setPassword("");
    setError(null);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      {factorId ? (
        <form onSubmit={onVerify} className="card w-full max-w-sm space-y-4 p-6">
          <div>
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-lg font-bold text-accent-ink">
              365
            </div>
            <h1 className="text-xl font-semibold">Verificación en dos pasos</h1>
            <p className="text-sm text-muted">Ingresá el código de 6 dígitos de tu app autenticadora.</p>
          </div>
          <div>
            <label className="label" htmlFor="code">Código</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]*"
              maxLength={7}
              required
              autoFocus
              className="input tracking-[0.4em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || code.replace(/\s/g, "").length < 6}>
            {busy ? "Verificando…" : "Verificar"}
          </button>
          <button type="button" onClick={cancel} className="w-full text-xs text-muted underline hover:text-white">
            Volver
          </button>
        </form>
      ) : (
        <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-6">
          <div>
            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-lg font-bold text-accent-ink">
              365
            </div>
            <h1 className="text-xl font-semibold">Impulso 365</h1>
            <p className="text-sm text-muted">Ingresá con tu cuenta del equipo.</p>
          </div>
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" type="email" required autoComplete="email" className="input"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="password">Contraseña</label>
            <input id="password" type="password" required autoComplete="current-password" className="input"
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      )}
    </main>
  );
}
