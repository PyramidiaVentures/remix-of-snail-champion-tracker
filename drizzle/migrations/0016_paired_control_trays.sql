CREATE TABLE public.control_trays (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id uuid NOT NULL REFERENCES public.sites(id),
 trial_id uuid NOT NULL REFERENCES public.trials(id),
 feed_id uuid NOT NULL REFERENCES public.feeds(id),
 obs_date date NOT NULL,
 portion_g numeric NOT NULL CHECK (portion_g > 0),
 tray_no integer NOT NULL CHECK (tray_no > 0),
 offered_g numeric NOT NULL CHECK (offered_g > 0),
 remaining_g numeric CHECK (remaining_g >= 0),
 exposure text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(trial_id,feed_id,obs_date,portion_g,tray_no)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.control_trays TO authenticated;
GRANT ALL ON public.control_trays TO service_role;
ALTER TABLE public.control_trays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team read control trays" ON public.control_trays FOR SELECT TO authenticated USING(true);
CREATE POLICY "team write control trays" ON public.control_trays FOR ALL TO authenticated USING(true) WITH CHECK(true);
CREATE TRIGGER control_trays_touch_updated_at BEFORE UPDATE ON public.control_trays FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();