ALTER TABLE public.feeds DROP COLUMN IF EXISTS source;
ALTER TABLE public.feeds DROP COLUMN IF EXISTS availability;
ALTER TABLE public.feeds DROP COLUMN IF EXISTS feed_type;
DROP TYPE IF EXISTS public.feed_availability;
DROP TYPE IF EXISTS public.feed_type;