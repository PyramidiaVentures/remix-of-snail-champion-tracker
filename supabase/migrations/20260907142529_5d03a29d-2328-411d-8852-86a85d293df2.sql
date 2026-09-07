DROP INDEX IF EXISTS public.observations_trial_pen_feed_date_uniq;
CREATE UNIQUE INDEX observations_trial_pen_feed_date_uniq ON public.observations (trial_id, pen_id, feed_id, obs_date);