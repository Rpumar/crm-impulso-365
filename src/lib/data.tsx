"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Prospect, TeamMember } from "@/lib/types";

interface CrmData {
  supabase: SupabaseClient;
  team: TeamMember[];
  me: TeamMember | null;
  prospects: Prospect[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  memberName: (id: string | null) => string;
}

const Ctx = createContext<CrmData | null>(null);

export function useCrm() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useCrm fuera de CrmProvider");
  return v;
}

export function CrmProvider({ email, children }: { email: string; children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [t, p] = await Promise.all([
      supabase.from("i365_team").select("*").eq("active", true).order("full_name"),
      supabase.from("i365_prospects").select("*").order("created_at", { ascending: false }),
    ]);
    if (t.error || p.error) {
      setError((t.error ?? p.error)!.message);
    } else {
      setError(null);
      setTeam(t.data as TeamMember[]);
      setProspects(p.data as Prospect[]);
    }
    setLoading(false);
  }, [supabase]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    void reload();
    const channel = supabase
      .channel("i365-prospects")
      .on("postgres_changes", { event: "*", schema: "public", table: "i365_prospects" }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void reload(), 250);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [supabase, reload]);

  const me = team.find((m) => m.email === email.toLowerCase()) ?? null;
  const memberName = useCallback(
    (id: string | null) => (id ? (team.find((m) => m.id === id)?.full_name ?? "—") : "Sin asignar"),
    [team],
  );

  return (
    <Ctx.Provider value={{ supabase, team, me, prospects, loading, error, reload, memberName }}>
      {children}
    </Ctx.Provider>
  );
}
