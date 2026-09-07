import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Leaf } from "lucide-react";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/home" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/home" });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <Leaf className="h-7 w-7" />
          </div>
          <h1 className="mt-3 text-2xl font-bold">SNOVA Growth Tracker</h1>
          <p className="text-sm text-muted-foreground">Snail feed palatability field study</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex rounded-lg bg-muted p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`flex-1 rounded-md py-2 text-sm font-medium ${mode === m ? "bg-card shadow" : "text-muted-foreground"}`}>
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-3 text-base outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-3 text-base outline-none focus:ring-2 focus:ring-ring" />
          </label>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <button disabled={busy} type="submit"
            className="w-full rounded-lg bg-primary py-3 text-base font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
