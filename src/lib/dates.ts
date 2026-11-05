const pad = (n: number) => String(n).padStart(2, "0");

export function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDaysISO(days: number, from = new Date()) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** "2026-11-03" -> "3 nov" (sin desfase de zona horaria). */
export function formatDay(iso: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es", { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function daysFromToday(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86400000);
}

export function relativeFollowUp(iso: string | null) {
  if (!iso) return "—";
  const n = daysFromToday(iso);
  if (n === 0) return "Hoy";
  if (n === 1) return "Mañana";
  if (n === -1) return "Ayer";
  if (n < 0) return `Hace ${-n} días`;
  return `En ${n} días`;
}

/** Valor para <input type="datetime-local"> en hora local. */
export function toLocalInput(d = new Date()) {
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
