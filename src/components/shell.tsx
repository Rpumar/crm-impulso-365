"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCrm } from "@/lib/data";
import { todayISO } from "@/lib/dates";
import { CLOSED_STATUSES } from "@/lib/types";

const NAV = [
  { href: "/", label: "Inicio", icon: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10" },
  {
    href: "/llamadas",
    label: "Llamadas",
    icon: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z",
  },
  { href: "/prospectos", label: "Prospectos", icon: "M4 6h16M4 12h16M4 18h16" },
  {
    href: "/seguimientos",
    label: "Seguimientos",
    icon: "M12 8v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  { href: "/plantillas", label: "Plantillas", icon: "M4 5h16v11H8l-4 4V5z" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}

export function Shell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const { me, loading, error, prospects, supabase } = useCrm();
  const path = usePathname();
  const router = useRouter();

  const today = todayISO();
  const due = prospects.filter(
    (p) =>
      p.next_follow_up &&
      p.next_follow_up <= today &&
      !CLOSED_STATUSES.includes(p.status),
  ).length;

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  if (!loading && !me) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <div className="card max-w-md space-y-3 p-6 text-center">
          <h1 className="text-lg font-semibold">
            Tu cuenta todavía no tiene acceso
          </h1>
          <p className="text-sm text-muted">
            Ingresaste como <b className="text-white">{email}</b>, pero ese
            email no está en la lista del equipo de Impulso 365. Pedile a un
            administrador que te dé de alta.
          </p>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={signOut} className="btn-ghost">
            Cerrar sesión
          </button>
        </div>
      </main>
    );
  }

  const isActive = (href: string) =>
    href === "/" ? path === "/" : path.startsWith(href);

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">
            365
          </div>
          <span className="font-semibold">Impulso 365</span>
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                isActive(n.href)
                  ? "bg-surface-2 text-accent"
                  : "text-muted hover:bg-surface-2 hover:text-white"
              }`}
            >
              <Icon d={n.icon} />
              {n.label}
              {n.href === "/seguimientos" && due > 0 && (
                <span className="ml-auto rounded-full bg-danger px-1.5 text-xs font-semibold text-black">
                  {due}
                </span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-4 text-sm">
          <div className="truncate font-medium">{me?.full_name}</div>
          <div className="truncate text-xs text-muted">{email}</div>
          <div className="mt-2 flex gap-3 text-xs">
            <Link
              href="/cuenta"
              className="text-muted underline hover:text-white"
            >
              Mi cuenta
            </Link>
            <button
              onClick={signOut}
              className="text-muted underline hover:text-white"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-accent text-xs font-bold text-accent-ink">
              365
            </div>
            <span className="font-semibold">Impulso 365</span>
          </div>
          <div className="flex gap-3 text-xs">
            <Link href="/cuenta" className="text-muted underline">
              Mi cuenta
            </Link>
            <button onClick={signOut} className="text-muted underline">
              Salir
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-8">
          {loading ? <p className="text-sm text-muted">Cargando…</p> : children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface md:hidden">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-xs ${isActive(n.href) ? "text-accent" : "text-muted"}`}
          >
            <Icon d={n.icon} />
            {n.label}
            {n.href === "/seguimientos" && due > 0 && (
              <span className="absolute right-[28%] top-1 rounded-full bg-danger px-1.5 text-[10px] font-semibold text-black">
                {due}
              </span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
