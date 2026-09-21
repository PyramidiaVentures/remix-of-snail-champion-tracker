ALTER TABLE public.pens ADD COLUMN weighing_interval_days integer;
COMMENT ON COLUMN public.pens.weighing_interval_days IS 'Per-pen weighing interval in days. NULL means use the trial default.';