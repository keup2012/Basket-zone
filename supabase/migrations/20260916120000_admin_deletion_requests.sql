-- ============================================================
-- BASKET ZONE — Demandes de suppression d'administrateur
-- ============================================================
-- Un admin ne peut plus être supprimé unilatéralement par un
-- autre. Il faut qu'un admin envoie une demande ("requester"
-- veut supprimer "target"), et que la cible ("target") accepte
-- elle-même sa propre suppression en confirmant avec son mot
-- de passe. Toute la logique de vérification vit dans l'Edge
-- Function admin-auth ; cette table ne fait que stocker l'état.
-- ============================================================

create table if not exists admin_deletion_requests (
    id uuid primary key default gen_random_uuid(),
    requester_id uuid not null references admins(id) on delete cascade,
    target_id uuid not null references admins(id) on delete cascade,
    status text not null default 'pending'
        check (status in ('pending', 'accepted', 'rejected')),
    created_at timestamptz not null default now()
);

-- Empêche d'avoir deux demandes en attente identiques (même
-- demandeur, même cible) en même temps.
create unique index if not exists uniq_pending_admin_deletion
    on admin_deletion_requests (requester_id, target_id)
    where status = 'pending';

-- Verrouillage : comme les autres tables, aucun accès direct
-- depuis le navigateur, tout passe par l'Edge Function admin-auth
-- (clé service_role).
alter table admin_deletion_requests enable row level security;
