ALTER TABLE public.observations ADD COLUMN leftover_g numeric CHECK (leftover_g IS NULL OR leftover_g >= 0);
COMMENT ON COLUMN public.observations.refusal_score IS 'Legacy visual score for trial pens; kept for history, no longer written by new AM entries.';

ALTER TABLE public.trials
  ADD COLUMN control_feed_id uuid REFERENCES public.feeds(id),
  ADD COLUMN control_active boolean NOT NULL DEFAULT false,
  ADD COLUMN control_portion_g numeric NOT NULL DEFAULT 50 CHECK (control_portion_g > 0);

CREATE TABLE public.moisture_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  trial_id uuid NOT NULL REFERENCES public.trials(id),
  feed_id uuid NOT NULL REFERENCES public.feeds(id),
  obs_date date NOT NULL,
  offered_g numeric NOT NULL CHECK (offered_g > 0),
  remaining_g numeric CHECK (remaining_g IS NULL OR remaining_g >= 0),
  notes text,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT moisture_controls_trial_feed_date_key UNIQUE (trial_id, feed_id, obs_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.moisture_controls TO authenticated;
GRANT ALL ON public.moisture_controls TO service_role;
ALTER TABLE public.moisture_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read moisture_controls" ON public.moisture_controls FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write moisture_controls" ON public.moisture_controls FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER moisture_controls_touch_updated_at BEFORE UPDATE ON public.moisture_controls
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();