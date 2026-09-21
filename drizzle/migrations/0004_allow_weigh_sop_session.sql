ALTER TABLE public.sop_checklists DROP CONSTRAINT sop_checklists_session_check;
ALTER TABLE public.sop_checklists ADD CONSTRAINT sop_checklists_session_check CHECK (session IN ('pm','am','weigh'));