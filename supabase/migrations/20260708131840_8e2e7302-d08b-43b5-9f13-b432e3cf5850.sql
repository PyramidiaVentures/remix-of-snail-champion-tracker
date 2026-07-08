
-- Shared team access: any authenticated user is a team member of this field study.

CREATE TYPE feed_availability AS ENUM ('year_round','seasonal');
CREATE TYPE feed_status AS ENUM ('pending','active','champion','eliminated');
CREATE TYPE round_status AS ENUM ('active','closed');
CREATE TYPE snail_activity AS ENUM ('active','mixed','mostly_sealed');
CREATE TYPE age_group AS ENUM ('Juveniles','Growers','Adults');

CREATE TABLE public.feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  source text,
  cost_per_kg numeric,
  availability feed_availability NOT NULL DEFAULT 'year_round',
  status feed_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feeds TO authenticated;
GRANT ALL ON public.feeds TO service_role;
ALTER TABLE public.feeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read feeds" ON public.feeds FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write feeds" ON public.feeds FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.pens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  age_group age_group NOT NULL,
  snail_count int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pens TO authenticated;
GRANT ALL ON public.pens TO service_role;
ALTER TABLE public.pens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read pens" ON public.pens FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write pens" ON public.pens FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number int NOT NULL UNIQUE,
  start_date date NOT NULL,
  end_date date,
  status round_status NOT NULL DEFAULT 'active',
  champion_feed_id uuid REFERENCES public.feeds(id),
  feed_ids uuid[] NOT NULL,
  champion_global_value numeric NOT NULL DEFAULT 1.0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rounds TO authenticated;
GRANT ALL ON public.rounds TO service_role;
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read rounds" ON public.rounds FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write rounds" ON public.rounds FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  pen_id uuid NOT NULL REFERENCES public.pens(id),
  feed_id uuid NOT NULL REFERENCES public.feeds(id),
  obs_date date NOT NULL,
  weight_given_g numeric,
  weight_leftover_g numeric,
  notes text,
  photo_am_url text,
  photo_pm_url text,
  is_acclimation boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, pen_id, feed_id, obs_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.observations TO authenticated;
GRANT ALL ON public.observations TO service_role;
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read obs" ON public.observations FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write obs" ON public.observations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.evap_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  feed_id uuid NOT NULL REFERENCES public.feeds(id),
  obs_date date NOT NULL,
  control_given_g numeric,
  control_leftover_g numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(round_id, feed_id, obs_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evap_controls TO authenticated;
GRANT ALL ON public.evap_controls TO service_role;
ALTER TABLE public.evap_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read evap" ON public.evap_controls FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write evap" ON public.evap_controls FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.pen_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pen_id uuid NOT NULL REFERENCES public.pens(id),
  obs_date date NOT NULL,
  temp_c numeric,
  humidity_pct numeric,
  snail_activity snail_activity,
  deaths_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pen_id, obs_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pen_daily TO authenticated;
GRANT ALL ON public.pen_daily TO service_role;
ALTER TABLE public.pen_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read pen_daily" ON public.pen_daily FOR SELECT TO authenticated USING (true);
CREATE POLICY "team write pen_daily" ON public.pen_daily FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_obs_updated BEFORE UPDATE ON public.observations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_evap_updated BEFORE UPDATE ON public.evap_controls FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_pd_updated BEFORE UPDATE ON public.pen_daily FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
