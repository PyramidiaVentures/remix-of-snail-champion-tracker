CREATE TABLE public.sop_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.trials(id) ON DELETE CASCADE,
  obs_date date NOT NULL,
  session text NOT NULL CHECK (session IN ('pm','am')),
  steps boolean[] NOT NULL DEFAULT '{}',
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trial_id, obs_date, session)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sop_checklists TO authenticated;
GRANT ALL ON public.sop_checklists TO service_role;

ALTER TABLE public.sop_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read sop_checklists" ON public.sop_checklists FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write sop_checklists" ON public.sop_checklists FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER sop_checklists_touch BEFORE UPDATE ON public.sop_checklists
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();