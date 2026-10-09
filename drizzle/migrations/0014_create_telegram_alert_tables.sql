CREATE TABLE public.telegram_chats (
  chat_id BIGINT PRIMARY KEY,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_chats TO service_role;
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.alert_log (
  alert_key TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.alert_log TO service_role;
ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;