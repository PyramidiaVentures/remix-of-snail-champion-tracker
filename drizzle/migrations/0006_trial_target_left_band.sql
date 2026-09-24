ALTER TABLE public.trials ADD COLUMN target_left_min_pct numeric NOT NULL DEFAULT 5;
ALTER TABLE public.trials ADD COLUMN target_left_max_pct numeric NOT NULL DEFAULT 10;