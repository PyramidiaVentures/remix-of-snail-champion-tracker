ALTER TABLE public.welfare_checks
  ADD COLUMN temp_min_c numeric,
  ADD COLUMN temp_max_c numeric,
  ADD COLUMN humidity_min_pct numeric,
  ADD COLUMN humidity_max_pct numeric;

UPDATE public.welfare_checks
SET
  temp_min_c = temp_c,
  temp_max_c = temp_c,
  humidity_min_pct = humidity_pct,
  humidity_max_pct = humidity_pct
WHERE temp_c IS NOT NULL OR humidity_pct IS NOT NULL;

COMMENT ON COLUMN public.welfare_checks.temp_c IS 'DEPRECATED: retained for compatibility; use temp_min_c and temp_max_c for new readings';
COMMENT ON COLUMN public.welfare_checks.humidity_pct IS 'DEPRECATED: retained for compatibility; use humidity_min_pct and humidity_max_pct for new readings';