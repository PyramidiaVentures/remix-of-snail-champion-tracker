CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sites TO authenticated;
GRANT ALL ON public.sites TO service_role;

ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team read sites"
ON public.sites
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "team write sites"
ON public.sites
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

INSERT INTO public.sites (id, name)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'Nairobi'),
  ('00000000-0000-4000-8000-000000000002', 'Roo');

ALTER TABLE public.pens ADD COLUMN site_id uuid;
ALTER TABLE public.trials ADD COLUMN site_id uuid;
ALTER TABLE public.feeds ADD COLUMN site_id uuid;

UPDATE public.pens
SET site_id = '00000000-0000-4000-8000-000000000001'
WHERE site_id IS NULL;

UPDATE public.trials
SET site_id = '00000000-0000-4000-8000-000000000001'
WHERE site_id IS NULL;

UPDATE public.feeds
SET site_id = '00000000-0000-4000-8000-000000000001'
WHERE site_id IS NULL;

ALTER TABLE public.pens
  ALTER COLUMN site_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
  ALTER COLUMN site_id SET NOT NULL,
  ADD CONSTRAINT pens_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);

ALTER TABLE public.trials
  ALTER COLUMN site_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
  ALTER COLUMN site_id SET NOT NULL,
  ADD CONSTRAINT trials_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);

ALTER TABLE public.feeds
  ALTER COLUMN site_id SET DEFAULT '00000000-0000-4000-8000-000000000001',
  ALTER COLUMN site_id SET NOT NULL,
  ADD CONSTRAINT feeds_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id);

ALTER TABLE public.pens
  ADD CONSTRAINT pens_site_id_label_key UNIQUE (site_id, label);

DROP INDEX IF EXISTS public.trials_single_active;

CREATE UNIQUE INDEX trials_one_active_per_site
ON public.trials (site_id)
WHERE status = 'active';

CREATE TABLE public.user_site_preferences (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_site_id uuid NOT NULL REFERENCES public.sites(id),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_site_preferences TO authenticated;
GRANT ALL ON public.user_site_preferences TO service_role;

ALTER TABLE public.user_site_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own site preference"
ON public.user_site_preferences
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "users insert own site preference"
ON public.user_site_preferences
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own site preference"
ON public.user_site_preferences
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own site preference"
ON public.user_site_preferences
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER user_site_preferences_touch_updated_at
BEFORE UPDATE ON public.user_site_preferences
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();