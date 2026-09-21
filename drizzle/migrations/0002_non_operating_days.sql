ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS non_operating_weekdays integer[] NOT NULL DEFAULT '{}';

CREATE TABLE public.site_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  closure_date date NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (site_id, closure_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_closures TO authenticated;
GRANT ALL ON public.site_closures TO service_role;

ALTER TABLE public.site_closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read site_closures" ON public.site_closures
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write site_closures" ON public.site_closures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
