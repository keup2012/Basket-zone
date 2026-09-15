-- ============================================================
-- BASKET ZONE — BASE SUPABASE
-- À exécuter dans Supabase > SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES public.admins(id) ON DELETE CASCADE,
    token text UNIQUE NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text NOT NULL,
    subject text NOT NULL,
    content text NOT NULL,
    ip text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.settings (key, value)
VALUES
    (
        'chat_provider',
        ''
    ),
    (
        'chat_api_key',
        ''
    ),
    (
        'chat_system_prompt',
        'Tu es Basket-Zone AI, un assistant expert en basketball, intégré au site Basket Zone. Réponds toujours en français, de façon claire et passionnée.'
    )
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_messages_ip_created
    ON public.messages (ip, created_at);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_token
    ON public.admin_sessions (token);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires
    ON public.admin_sessions (expires_at);
