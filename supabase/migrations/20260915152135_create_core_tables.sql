/*
# Basket Zone — Core tables (admins, messages, settings)

1. New Tables
- `admins`: admin accounts (username + password_hash). No email — auth is handled via edge functions.
  - id (uuid, pk), username (text, unique), password_hash (text), created_at (timestamptz)
- `admin_sessions`: session tokens for logged-in admins (replaces cookie-based auth).
  - id (uuid, pk), admin_id (uuid, fk -> admins), token (text, unique), expires_at (timestamptz), created_at (timestamptz)
- `messages`: contact form submissions with IP for rate-limiting.
  - id (uuid, pk), name (text), email (text), subject (text), content (text), ip (text), is_read (boolean), created_at (timestamptz)
- `settings`: key/value store for chatbot config (provider, api_key, system_prompt).
  - key (text, pk), value (text), updated_at (timestamptz)

2. Security
- RLS enabled on ALL tables. No policies created — all access is denied by default.
- Only edge functions using the service_role key can read/write these tables.
- The browser (anon key) can NEVER directly access any of these tables.

3. Notes
- Admin auth is handled entirely via edge functions (create first admin, login, verify session).
- Password hashing uses Web Crypto API (PBKDF2) inside the edge function.
- Session tokens are random UUIDs stored in admin_sessions with an expiry.
- Contact form rate limiting is done by IP inside the contact edge function.
- Chatbot API key is stored in settings table, readable only via service_role.
*/

CREATE TABLE IF NOT EXISTS admins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    username text UNIQUE NOT NULL,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
    token text UNIQUE NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    email text NOT NULL,
    subject text NOT NULL,
    content text NOT NULL,
    ip text,
    is_read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
    key text PRIMARY KEY,
    value text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
    ('chat_provider', ''),
    ('chat_api_key', ''),
    ('chat_system_prompt', 'Tu es Basket-Zone AI, un assistant expert en basketball, intégré au site Basket Zone. Réponds toujours en français, de façon claire et passionnée.')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Index for rate-limiting queries
CREATE INDEX IF NOT EXISTS idx_messages_ip_created ON messages (ip, created_at);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions (token);
