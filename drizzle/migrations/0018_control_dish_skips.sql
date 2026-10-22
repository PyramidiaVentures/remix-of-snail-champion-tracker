CREATE TABLE public.control_dish_skips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  trial_id uuid NOT NULL REFERENCES public.trials(id),
  obs_date date NOT NULL,
  reason text NOT NULL DEFAULT 'Nothing placed in the control dish that evening',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trial_id, obs_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.control_dish_skips TO authenticated;
GRANT ALL ON public.control_dish_skips TO service_role;
ALTER TABLE public.control_dish_skips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read control_dish_skips" ON public.control_dish_skips FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write control_dish_skips" ON public.control_dish_skips FOR ALL TO authenticated USING (true) WITH CHECK (true);