ALTER TABLE public.sop_checklists
  ADD COLUMN checked_step_keys text[] NOT NULL DEFAULT '{}';

WITH step_versions(session, date_from, date_to, position, step_key) AS (
  VALUES
    ('pm', DATE '0001-01-01', DATE '2026-09-24', 1, 'pm.collect_fresh'),
    ('pm', DATE '0001-01-01', DATE '2026-09-24', 2, 'pm.check_discard'),
    ('pm', DATE '0001-01-01', DATE '2026-09-24', 3, 'pm.weigh_portion'),
    ('pm', DATE '0001-01-01', DATE '2026-09-24', 4, 'pm.record_dish_action'),
    ('pm', DATE '0001-01-01', DATE '2026-09-24', 5, 'pm.place_feed'),
    ('pm', DATE '0001-01-01', DATE '2026-09-24', 6, 'pm.calcium_water'),
    ('pm', DATE '0001-01-01', DATE '2026-09-24', 7, 'pm.photo'),
    ('am', DATE '0001-01-01', DATE '2026-09-24', 1, 'am.photo'),
    ('am', DATE '0001-01-01', DATE '2026-09-24', 2, 'am.visual_refusal'),
    ('am', DATE '0001-01-01', DATE '2026-09-24', 3, 'am.activity_health'),
    ('am', DATE '0001-01-01', DATE '2026-09-24', 4, 'am.environment'),
    ('am', DATE '0001-01-01', DATE '2026-09-24', 5, 'am.population'),
    ('am', DATE '0001-01-01', DATE '2026-09-24', 6, 'am.discard_spoiled'),
    ('pm', DATE '2026-09-24', DATE '9999-12-31', 1, 'pm.collect_fresh'),
    ('pm', DATE '2026-09-24', DATE '9999-12-31', 2, 'pm.weigh_portion'),
    ('pm', DATE '2026-09-24', DATE '9999-12-31', 3, 'pm.place_feed'),
    ('pm', DATE '2026-09-24', DATE '9999-12-31', 4, 'pm.control_portion'),
    ('pm', DATE '2026-09-24', DATE '9999-12-31', 5, 'pm.calcium_water'),
    ('pm', DATE '2026-09-24', DATE '9999-12-31', 6, 'pm.photo'),
    ('am', DATE '2026-09-24', DATE '9999-12-31', 1, 'am.photo'),
    ('am', DATE '2026-09-24', DATE '9999-12-31', 2, 'am.weigh_leftover'),
    ('am', DATE '2026-09-24', DATE '9999-12-31', 3, 'am.control_leftover'),
    ('am', DATE '2026-09-24', DATE '9999-12-31', 4, 'am.activity_health_environment'),
    ('am', DATE '2026-09-24', DATE '9999-12-31', 5, 'am.population'),
    ('weigh', DATE '0001-01-01', DATE '9999-12-31', 1, 'weigh.zero_container'),
    ('weigh', DATE '0001-01-01', DATE '9999-12-31', 2, 'weigh.count_live'),
    ('weigh', DATE '0001-01-01', DATE '9999-12-31', 3, 'weigh.weigh_biomass'),
    ('weigh', DATE '0001-01-01', DATE '9999-12-31', 4, 'weigh.photo_scale'),
    ('weigh', DATE '0001-01-01', DATE '9999-12-31', 5, 'weigh.return_and_confirm'),
    ('weigh', DATE '0001-01-01', DATE '9999-12-31', 6, 'weigh.log_mortality')
), mapped AS (
  SELECT checklist.id, array_agg(version.step_key ORDER BY version.position) AS keys
  FROM public.sop_checklists AS checklist
  JOIN step_versions AS version
    ON version.session = checklist.session
   AND checklist.obs_date >= version.date_from
   AND checklist.obs_date < version.date_to
   AND COALESCE(checklist.steps[version.position], false)
  GROUP BY checklist.id
)
UPDATE public.sop_checklists AS checklist
SET checked_step_keys = mapped.keys
FROM mapped
WHERE checklist.id = mapped.id;

COMMENT ON COLUMN public.sop_checklists.steps IS 'DEPRECATED: positional checklist ticks retained for history; use checked_step_keys';
COMMENT ON COLUMN public.sop_checklists.checked_step_keys IS 'Permanent checklist step keys checked for this trial, date, and session; unknown retired keys remain as history';