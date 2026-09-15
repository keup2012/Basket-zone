-- ============================================================
-- BASKET ZONE — Schéma de base de données Supabase
-- ============================================================
-- À exécuter UNE SEULE FOIS dans : Supabase > SQL Editor > New query
-- (copier-coller tout ce fichier, puis cliquer "Run")
-- ============================================================


-- ------------------------------------------------------------
-- 1. Comptes administrateurs
-- ------------------------------------------------------------
-- Pas d'email, jamais. Juste un nom d'utilisateur + un mot de
-- passe hashé (le hash sera calculé côté Edge Function, jamais
-- côté navigateur).
create table admins (
    id uuid primary key default gen_random_uuid(),
    username text unique not null,
    password_hash text not null,
    created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 2. Sessions administrateur
-- ------------------------------------------------------------
-- Remplace le système de cookie classique. Quand un admin se
-- connecte, on lui donne un "jeton" (token) aléatoire qu'il
-- garde dans son navigateur et qu'il renvoie pour prouver qui
-- il est. Le jeton expire tout seul après un certain temps.
create table admin_sessions (
    id uuid primary key default gen_random_uuid(),
    admin_id uuid not null references admins(id) on delete cascade,
    token text unique not null,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 3. Messages du formulaire de contact
-- ------------------------------------------------------------
create table messages (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null,
    subject text not null,
    content text not null,
    ip text,                              -- utilisé pour la limite anti-spam
    is_read boolean not null default false,
    created_at timestamptz not null default now()
);


-- ------------------------------------------------------------
-- 4. Réglages du site (dont la config du chatbot IA)
-- ------------------------------------------------------------
-- Une table simple "clé / valeur" pilotable depuis l'admin.
create table settings (
    key text primary key,
    value text,
    updated_at timestamptz not null default now()
);

-- Valeurs de départ pour le chatbot (vides, à remplir depuis l'admin plus tard)
insert into settings (key, value) values
    ('chat_provider', ''),
    ('chat_api_key', ''),
    ('chat_system_prompt', 'Tu es Basket-Zone AI, un assistant expert en basketball, intégré au site Basket Zone. Réponds toujours en français, de façon claire et passionnée.');


-- ------------------------------------------------------------
-- 5. Verrouillage de sécurité
-- ------------------------------------------------------------
-- On active la sécurité "ligne par ligne" (RLS) sur TOUTES les
-- tables et on ne crée AUCUNE règle d'autorisation. Résultat :
-- personne ne peut lire ni écrire ces tables directement depuis
-- le navigateur, même avec la clé publique du site.
--
-- Toutes les opérations (créer un admin, se connecter, envoyer
-- un message, parler au chatbot...) passeront par des Edge
-- Functions qu'on codera aux prochaines étapes. Elles seules
-- utilisent une clé secrète ("service_role") qui contourne ce
-- verrou — et cette clé ne sera JAMAIS écrite dans un fichier
-- du site, uniquement dans la configuration privée de Supabase.

alter table admins enable row level security;
alter table admin_sessions enable row level security;
alter table messages enable row level security;
alter table settings enable row level security;
