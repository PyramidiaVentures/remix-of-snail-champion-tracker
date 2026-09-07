-- Enums
CREATE TYPE public.feed_type AS ENUM ('fresh_leaf','compounded','animal_protein','mixed','other');
CREATE TYPE public.dm_source AS ENUM ('literature','supplier','measured');
CREATE TYPE public.trial_status AS ENUM ('setup','active','closed');
CREATE TYPE public.dish_action AS ENUM ('emptied_refilled','topped_up','emptied_spoiled');
CREATE TYPE public.refusal_score AS ENUM ('none_left','trace','about_25','about_50','most_left');
CREATE TYPE public.biomass_method AS ENUM ('whole_pen','subsample');
CREATE TYPE public.population_event_type AS ENUM ('mortality','escape','removal','addition');
CREATE TYPE public.population_cause AS ENUM ('disease','predation','handling','unknown','harvested','other');
CREATE TYPE public.health_flag AS ENUM ('shell_damage','lethargy','abnormal_mucus','foul_smell','mould_in_dish','visible_dead');
CREATE TYPE public.dish_condition AS ENUM ('clean','soiled','mouldy');
CREATE TYPE public.substrate_condition AS ENUM ('good','dry','waterlogged','soiled');

-- 4.3 trials
CREATE TABLE public.trials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  planned_end_date date,
  end_date date,
  status public.trial_status NOT NULL DEFAULT 'setup',
  weighing_interval_days integer NOT NULL DEFAULT 7,
  acclimation_days integer NOT NULL DEFAULT 7,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trials TO authenticated;
GRANT ALL ON public.trials TO service_role;
ALTER TABLE public.trials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read trials" ON public.trials FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write trials" ON public.trials FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX trials_single_active ON public.trials ((status)) WHERE status = 'active';

-- 4.4 treatments
CREATE TABLE public.treatments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.trials(id) ON DELETE CASCADE,
  feed_id uuid NOT NULL REFERENCES public.feeds(id),
  label text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trial_id, feed_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treatments TO authenticated;
GRANT ALL ON public.treatments TO service_role;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read treatments" ON public.treatments FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write treatments" ON public.treatments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4.5 pen_assignments
CREATE TABLE public.pen_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.trials(id) ON DELETE CASCADE,
  pen_id uuid NOT NULL REFERENCES public.pens(id),
  treatment_id uuid NOT NULL REFERENCES public.treatments(id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trial_id, pen_id, start_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pen_assignments TO authenticated;
GRANT ALL ON public.pen_assignments TO service_role;
ALTER TABLE public.pen_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read pen_assignments" ON public.pen_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write pen_assignments" ON public.pen_assignments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX pen_assignments_one_open ON public.pen_assignments (trial_id, pen_id) WHERE end_date IS NULL;

-- 4.7 biomass_events
CREATE TABLE public.biomass_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.trials(id) ON DELETE CASCADE,
  pen_id uuid NOT NULL REFERENCES public.pens(id),
  event_date date NOT NULL,
  live_count integer NOT NULL,
  method public.biomass_method NOT NULL DEFAULT 'whole_pen',
  subsample_count integer,
  tare_g numeric NOT NULL,
  gross_g numeric NOT NULL,
  net_biomass_g numeric NOT NULL,
  photo_url text,
  recorded_by text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trial_id, pen_id, event_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.biomass_events TO authenticated;
GRANT ALL ON public.biomass_events TO service_role;
ALTER TABLE public.biomass_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read biomass_events" ON public.biomass_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write biomass_events" ON public.biomass_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER biomass_events_touch_updated_at BEFORE UPDATE ON public.biomass_events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 4.8 population_events
CREATE TABLE public.population_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.trials(id) ON DELETE CASCADE,
  pen_id uuid NOT NULL REFERENCES public.pens(id),
  event_date date NOT NULL,
  event_type public.population_event_type NOT NULL,
  count integer NOT NULL,
  cause public.population_cause,
  photo_url text,
  notes text,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.population_events TO authenticated;
GRANT ALL ON public.population_events TO service_role;
ALTER TABLE public.population_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read population_events" ON public.population_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write population_events" ON public.population_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 4.9 welfare_checks
CREATE TABLE public.welfare_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trial_id uuid NOT NULL REFERENCES public.trials(id) ON DELETE CASCADE,
  pen_id uuid NOT NULL REFERENCES public.pens(id),
  obs_date date NOT NULL,
  activity public.snail_activity,
  health_flags public.health_flag[],
  dish_condition public.dish_condition,
  substrate_condition public.substrate_condition,
  temp_c numeric,
  humidity_pct numeric,
  notes text,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trial_id, pen_id, obs_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.welfare_checks TO authenticated;
GRANT ALL ON public.welfare_checks TO service_role;
ALTER TABLE public.welfare_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read welfare_checks" ON public.welfare_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write welfare_checks" ON public.welfare_checks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER welfare_checks_touch_updated_at BEFORE UPDATE ON public.welfare_checks FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Additive columns on existing tables
ALTER TABLE public.feeds
  ADD COLUMN feed_type public.feed_type,
  ADD COLUMN dm_percent numeric CHECK (dm_percent IS NULL OR (dm_percent >= 0 AND dm_percent <= 100)),
  ADD COLUMN dm_source public.dm_source,
  ADD COLUMN notes text;

ALTER TABLE public.pens ADD COLUMN area_m2 numeric;

ALTER TABLE public.observations
  ADD COLUMN trial_id uuid REFERENCES public.trials(id),
  ADD COLUMN offered_g numeric,
  ADD COLUMN dish_action public.dish_action,
  ADD COLUMN refusal_score public.refusal_score,
  ADD COLUMN recorded_by text;

UPDATE public.observations SET offered_g = weight_given_g WHERE weight_given_g IS NOT NULL;

ALTER TABLE public.session_photos ADD COLUMN trial_id uuid REFERENCES public.trials(id);