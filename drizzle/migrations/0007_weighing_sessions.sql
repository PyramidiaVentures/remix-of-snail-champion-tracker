CREATE TABLE public.weighing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  trial_id uuid NOT NULL REFERENCES public.trials(id),
  session_date date NOT NULL,
  pens_due integer NOT NULL DEFAULT 0,
  pens_weighed integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  closed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trial_id, session_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weighing_sessions TO authenticated;
GRANT ALL ON public.weighing_sessions TO service_role;
ALTER TABLE public.weighing_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read weighing_sessions" ON public.weighing_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write weighing_sessions" ON public.weighing_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);