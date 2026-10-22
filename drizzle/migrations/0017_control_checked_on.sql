ALTER TABLE public.moisture_controls ADD COLUMN IF NOT EXISTS checked_on date;
ALTER TABLE public.control_trays ADD COLUMN IF NOT EXISTS checked_on date;
COMMENT ON COLUMN public.moisture_controls.checked_on IS 'Morning the leftover was weighed; spans several nights when the dish was left unchanged over a closed day or missing entry.';
COMMENT ON COLUMN public.control_trays.checked_on IS 'Morning the leftover was weighed; spans several nights when the tray was left unchanged.';