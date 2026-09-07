ALTER TABLE public.observations ALTER COLUMN round_id DROP NOT NULL;
ALTER TABLE public.session_photos ALTER COLUMN round_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS observations_trial_pen_feed_date_uniq
  ON public.observations (trial_id, pen_id, feed_id, obs_date)
  WHERE trial_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS session_photos_trial_pen_date_uniq
  ON public.session_photos (trial_id, pen_id, obs_date)
  WHERE trial_id IS NOT NULL AND pen_id IS NOT NULL;