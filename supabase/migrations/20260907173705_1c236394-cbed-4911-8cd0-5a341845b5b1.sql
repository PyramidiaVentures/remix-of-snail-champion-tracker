DELETE FROM public.session_photos WHERE pen_id IS NULL;

DROP TABLE IF EXISTS public.evap_controls;

ALTER TABLE public.observations DROP COLUMN IF EXISTS weight_leftover_g;
ALTER TABLE public.observations DROP COLUMN IF EXISTS weight_given_g;
ALTER TABLE public.observations DROP COLUMN IF EXISTS round_id;
ALTER TABLE public.observations ALTER COLUMN trial_id SET NOT NULL;

DROP INDEX IF EXISTS public.session_photos_round_date_control_uidx;
DROP INDEX IF EXISTS public.session_photos_control_uidx;
DROP INDEX IF EXISTS public.session_photos_round_control_uidx;
ALTER TABLE public.session_photos DROP COLUMN IF EXISTS round_id;
ALTER TABLE public.session_photos ALTER COLUMN pen_id SET NOT NULL;
ALTER TABLE public.session_photos ALTER COLUMN trial_id SET NOT NULL;

ALTER TABLE public.biomass_events DROP COLUMN IF EXISTS tare_g;
ALTER TABLE public.biomass_events DROP COLUMN IF EXISTS gross_g;

DROP TABLE IF EXISTS public.rounds;

ALTER TABLE public.feeds DROP COLUMN IF EXISTS status;
DROP TYPE IF EXISTS public.feed_status;