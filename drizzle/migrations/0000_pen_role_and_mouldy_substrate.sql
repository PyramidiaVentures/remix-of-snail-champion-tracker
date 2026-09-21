CREATE TYPE public.pen_role AS ENUM ('trial', 'breeder');

ALTER TABLE public.pens ADD COLUMN role public.pen_role NOT NULL DEFAULT 'trial';
UPDATE public.pens SET role = 'trial' WHERE role IS NULL;

ALTER TYPE public.substrate_condition ADD VALUE IF NOT EXISTS 'mouldy';

-- Breeder pens are fed without an assigned trial feed, so a feeding record may
-- have no feed. The natural-key index must still treat those rows as one row
-- per pen and date, hence NULLS NOT DISTINCT.
ALTER TABLE public.observations ALTER COLUMN feed_id DROP NOT NULL;
DROP INDEX IF EXISTS public.observations_trial_pen_feed_date_uniq;
CREATE UNIQUE INDEX observations_trial_pen_feed_date_uniq
  ON public.observations (trial_id, pen_id, feed_id, obs_date) NULLS NOT DISTINCT;