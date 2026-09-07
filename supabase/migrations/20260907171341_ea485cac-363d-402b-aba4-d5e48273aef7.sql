ALTER TABLE public.feeds ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.feeds ALTER COLUMN status TYPE text USING status::text;
UPDATE public.feeds SET status = 'active' WHERE status IN ('pending', 'champion', 'eliminated');
DROP TYPE public.feed_status;
CREATE TYPE public.feed_status AS ENUM ('active', 'inactive');
ALTER TABLE public.feeds ALTER COLUMN status TYPE public.feed_status USING status::public.feed_status;
ALTER TABLE public.feeds ALTER COLUMN status SET DEFAULT 'active'::public.feed_status;
ALTER TABLE public.feeds ALTER COLUMN status SET NOT NULL;