import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/setup")({
  component: SetupPage,
});

type AgeGroup = "Juveniles" | "Growers" | "Adults";

function SetupPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Setup</h1>
        <p className="text-sm text-muted-foreground">Pens and feed library.</p>
      </header>
      <PensSection />
      <FeedsSection />
    </div>
  );
}

function PensSection() {
  const qc = useQueryClient();
  const pens = useQuery({
    queryKey: ["pens"],
    queryFn: async () => (await supabase.from("pens").select("*").order("age_group")).data ?? [],
  });
  const [label, setLabel] = useState("");
  const [age, setAge] = useState<AgeGroup>("Juveniles");
  const [count, setCount] = useState(0);

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pens").insert({ label, age_group: age, snail_count: count });
      if (error) throw error;
    },
    onSuccess: () => { setLabel(""); setCount(0); qc.invalidateQueries({ queryKey: ["pens"] }); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("pens").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pens"] }),
  });

  const update = useMutation({
    mutationFn: async (p: { id: string; snail_count: number }) => {
      await supabase.from("pens").update({ snail_count: p.snail_count }).eq("id", p.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pens"] }),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Pens</h2>
      <ul className="space-y-2 mb-4">
        {pens.data?.map((p) => (
          <li key={p.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <div className="flex-1">
              <div className="font-medium">{p.label}</div>
              <div className="text-xs text-muted-foreground">{p.age_group}</div>
            </div>
            <input type="number" defaultValue={p.snail_count} min={0}
              onBlur={(e) => update.mutate({ id: p.id, snail_count: Number(e.target.value) })}
              className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right" />
            <span className="text-xs text-muted-foreground">snails</span>
            <button onClick={() => del.mutate(p.id)} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {pens.data?.length === 0 && <li className="text-sm text-muted-foreground">No pens yet.</li>}
      </ul>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
        <label className="text-xs col-span-full sm:col-span-1">
          <span className="block mb-1 text-muted-foreground">Label</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Pen A"
            className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-muted-foreground">Age</span>
          <select value={age} onChange={(e) => setAge(e.target.value as AgeGroup)} className="rounded-md border border-input bg-background px-3 py-2">
            <option>Juveniles</option><option>Growers</option><option>Adults</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-muted-foreground">Snails</span>
          <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-20 rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <button disabled={!label} onClick={() => add.mutate()} className="rounded-md bg-primary px-3 py-2 text-primary-foreground text-sm font-medium disabled:opacity-50">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function FeedsSection() {
  const qc = useQueryClient();
  const feeds = useQuery({
    queryKey: ["feeds"],
    queryFn: async () => (await supabase.from("feeds").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [cost, setCost] = useState<string>("");
  const [availability, setAvailability] = useState<"year_round" | "seasonal">("year_round");

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("feeds").insert({
        name, source: source || null,
        cost_per_kg: cost ? Number(cost) : null,
        availability,
      });
      if (error) throw error;
    },
    onSuccess: () => { setName(""); setSource(""); setCost(""); qc.invalidateQueries({ queryKey: ["feeds"] }); },
  });

  const del = useMutation({
    mutationFn: async (id: string) => { await supabase.from("feeds").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feeds"] }),
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="font-semibold mb-3">Feeds</h2>
      <ul className="space-y-2 mb-4">
        {feeds.data?.map((f) => (
          <li key={f.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                {f.name}
                <StatusBadge status={f.status} />
              </div>
              <div className="text-xs text-muted-foreground">
                {f.source || "—"} · {f.availability === "year_round" ? "Year-round" : "Seasonal"}
                {f.cost_per_kg != null && ` · ${f.cost_per_kg}/kg`}
              </div>
            </div>
            <button onClick={() => del.mutate(f.id)} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
          </li>
        ))}
        {feeds.data?.length === 0 && <li className="text-sm text-muted-foreground">No feeds yet.</li>}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs col-span-2">
          <span className="block mb-1 text-muted-foreground">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cassava leaves"
            className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-muted-foreground">Source</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} placeholder="Farm plot 2"
            className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <label className="text-xs">
          <span className="block mb-1 text-muted-foreground">Cost/kg</span>
          <input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2" />
        </label>
        <label className="text-xs col-span-2">
          <span className="block mb-1 text-muted-foreground">Availability</span>
          <select value={availability} onChange={(e) => setAvailability(e.target.value as "year_round" | "seasonal")}
            className="w-full rounded-md border border-input bg-background px-3 py-2">
            <option value="year_round">Year-round</option>
            <option value="seasonal">Seasonal</option>
          </select>
        </label>
        <button disabled={!name} onClick={() => add.mutate()} className="col-span-2 rounded-md bg-primary py-2 text-primary-foreground text-sm font-medium disabled:opacity-50">
          <Plus className="h-4 w-4 inline mr-1" /> Add feed
        </button>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    active: "bg-accent text-accent-foreground",
    champion: "bg-primary text-primary-foreground",
    eliminated: "bg-destructive/10 text-destructive",
  };
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase ${map[status] ?? "bg-muted"}`}>{status}</span>;
}
