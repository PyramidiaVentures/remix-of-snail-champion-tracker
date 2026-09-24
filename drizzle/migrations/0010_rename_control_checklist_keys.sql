UPDATE public.sop_checklists
SET checked_step_keys = array_replace(array_replace(checked_step_keys, 'pm.control_portion', 'pm.control_dish'), 'am.control_leftover', 'am.control_dish')
WHERE checked_step_keys && ARRAY['pm.control_portion', 'am.control_leftover']::text[];

COMMENT ON COLUMN public.sop_checklists.checked_step_keys IS 'Permanent checklist step keys checked for this trial, date, and session; control steps use pm.control_dish and am.control_dish; unknown retired keys remain as history';