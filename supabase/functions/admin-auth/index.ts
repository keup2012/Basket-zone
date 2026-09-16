import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Apikey, X-Client-Info, X-Admin-Session",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Variables Supabase manquantes.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getToken(req: Request, body: Record<string, unknown>): string {
  return (
    req.headers.get("x-admin-session") ||
    String(body.token || "")
  );
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );

  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const hashHex = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [saltHex, expectedHash] = storedHash.split(":");

  if (!saltHex || !expectedHash) {
    return false;
  }

  const saltBytes = saltHex.match(/.{2}/g);

  if (!saltBytes) {
    return false;
  }

  const salt = new Uint8Array(
    saltBytes.map((value) => parseInt(value, 16)),
  );

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256,
  );

  const computedHash = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computedHash === expectedHash;
}

function generateToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
}

async function createSession(adminId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_MS,
  ).toISOString();

  const { error } = await supabase
    .from("admin_sessions")
    .insert({
      admin_id: adminId,
      token,
      expires_at: expiresAt,
    });

  if (error) {
    throw new Error(`Création de session impossible : ${error.message}`);
  }

  return token;
}

async function getSession(token: string) {
  if (!token) return null;

  const { data, error } = await supabase
    .from("admin_sessions")
    .select("admin_id, expires_at, admins!inner(username)")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase
      .from("admin_sessions")
      .delete()
      .eq("token", token);

    return null;
  }

  const admin = data.admins as unknown as { username: string };

  return {
    admin_id: data.admin_id,
    username: admin.username,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Méthode non autorisée." },
      405,
    );
  }

  try {
    let body: Record<string, unknown>;

    try {
      body = await req.json();
    } catch {
      return jsonResponse(
        { error: "JSON invalide." },
        400,
      );
    }

    const action = String(body.action || "");

    // STATUS
    if (action === "status") {
      const { count, error } = await supabase
        .from("admins")
        .select("id", {
          count: "exact",
          head: true,
        });

      if (error) throw error;

      return jsonResponse({
        hasAdmins: (count ?? 0) > 0,
        adminCount: count ?? 0,
      });
    }

    // SETUP — premier administrateur uniquement
    if (action === "setup") {
      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (username.length < 3) {
        return jsonResponse(
          { error: "Le nom d'utilisateur doit faire au moins 3 caractères." },
          400,
        );
      }

      if (password.length < 6) {
        return jsonResponse(
          { error: "Le mot de passe doit faire au moins 6 caractères." },
          400,
        );
      }

      const { count, error: countError } = await supabase
        .from("admins")
        .select("id", {
          count: "exact",
          head: true,
        });

      if (countError) throw countError;

      if ((count ?? 0) > 0) {
        return jsonResponse(
          { error: "Un administrateur existe déjà." },
          403,
        );
      }

      const passwordHash = await hashPassword(password);

      const { data, error } = await supabase
        .from("admins")
        .insert({
          username,
          password_hash: passwordHash,
        })
        .select("id, username")
        .single();

      if (error) {
        if (error.code === "23505") {
          return jsonResponse(
            { error: "Ce nom d'utilisateur existe déjà." },
            409,
          );
        }
        throw error;
      }

      const token = await createSession(data.id);

      return jsonResponse({
        success: true,
        token,
        username: data.username,
      });
    }

    // LOGIN
    if (action === "login") {
      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (!username || !password) {
        return jsonResponse(
          { error: "Nom d'utilisateur et mot de passe requis." },
          400,
        );
      }

      const { data, error } = await supabase
        .from("admins")
        .select("id, username, password_hash")
        .eq("username", username)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        return jsonResponse(
          { error: "Identifiants incorrects." },
          401,
        );
      }

      const valid = await verifyPassword(
        password,
        data.password_hash,
      );

      if (!valid) {
        return jsonResponse(
          { error: "Identifiants incorrects." },
          401,
        );
      }

      const token = await createSession(data.id);

      return jsonResponse({
        success: true,
        token,
        username: data.username,
      });
    }

    // LOGOUT
    if (action === "logout") {
      const token = getToken(req, body);

      if (token) {
        await supabase
          .from("admin_sessions")
          .delete()
          .eq("token", token);
      }

      return jsonResponse({ success: true });
    }

    // VERIFY
    if (action === "verify") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { valid: false },
          401,
        );
      }

      return jsonResponse({
        valid: true,
        username: session.username,
      });
    }

    // LIST ADMINS
    if (action === "listAdmins") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const { data, error } = await supabase
        .from("admins")
        .select("id, username, created_at")
        .order("created_at", { ascending: true });

      if (error) throw error;

      return jsonResponse({
        admins: data || [],
      });
    }

    // STATS — compteurs pour le tableau de bord
    if (action === "stats") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const [adminsCount, messagesCount, unreadCount] = await Promise.all([
        supabase.from("admins").select("id", { count: "exact", head: true }),
        supabase.from("messages").select("id", { count: "exact", head: true }),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("is_read", false),
      ]);

      if (adminsCount.error) throw adminsCount.error;
      if (messagesCount.error) throw messagesCount.error;
      if (unreadCount.error) throw unreadCount.error;

      return jsonResponse({
        adminCount: adminsCount.count ?? 0,
        totalMessages: messagesCount.count ?? 0,
        unreadMessages: unreadCount.count ?? 0,
      });
    }

    // CHANGE PASSWORD — l'admin connecté change son propre mot de passe
    if (action === "changePassword") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const currentPassword = String(body.currentPassword || "");
      const newPassword = String(body.newPassword || "");

      if (newPassword.length < 6) {
        return jsonResponse(
          { error: "Le nouveau mot de passe doit faire au moins 6 caractères." },
          400,
        );
      }

      const { data: admin, error: fetchError } = await supabase
        .from("admins")
        .select("password_hash")
        .eq("id", session.admin_id)
        .single();

      if (fetchError) throw fetchError;

      const valid = await verifyPassword(currentPassword, admin.password_hash);

      if (!valid) {
        return jsonResponse(
          { error: "Mot de passe actuel incorrect." },
          401,
        );
      }

      const newHash = await hashPassword(newPassword);

      const { error: updateError } = await supabase
        .from("admins")
        .update({ password_hash: newHash })
        .eq("id", session.admin_id);

      if (updateError) throw updateError;

      return jsonResponse({ success: true });
    }

    // CHANGE USERNAME — l'admin connecté change son propre nom d'utilisateur
    if (action === "changeUsername") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const newUsername = String(body.newUsername || "").trim();
      const password = String(body.password || "");

      if (newUsername.length < 3) {
        return jsonResponse(
          { error: "Le nom d'utilisateur doit faire au moins 3 caractères." },
          400,
        );
      }

      const { data: me, error: meError } = await supabase
        .from("admins")
        .select("password_hash")
        .eq("id", session.admin_id)
        .single();

      if (meError) throw meError;

      const valid = await verifyPassword(password, me.password_hash);

      if (!valid) {
        return jsonResponse(
          { error: "Mot de passe incorrect." },
          401,
        );
      }

      const { error: updateError } = await supabase
        .from("admins")
        .update({ username: newUsername })
        .eq("id", session.admin_id);

      if (updateError) {
        if (updateError.code === "23505") {
          return jsonResponse(
            { error: "Ce nom d'utilisateur est déjà pris." },
            409,
          );
        }
        throw updateError;
      }

      return jsonResponse({ success: true, username: newUsername });
    }

    // REQUEST DELETE ADMIN — demande de suppression envoyée à un autre admin
    // (aucune suppression n'a lieu ici : ça crée juste la demande)
    if (action === "requestDeleteAdmin") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const targetId = String(body.targetId || "");
      const password = String(body.password || "");

      if (!targetId) {
        return jsonResponse(
          { error: "Administrateur cible manquant." },
          400,
        );
      }

      if (targetId === session.admin_id) {
        return jsonResponse(
          { error: "Impossible de demander sa propre suppression ici." },
          400,
        );
      }

      // Le demandeur doit confirmer son identité avec son propre mot de passe
      const { data: requester, error: requesterError } = await supabase
        .from("admins")
        .select("password_hash")
        .eq("id", session.admin_id)
        .single();

      if (requesterError) throw requesterError;

      const valid = await verifyPassword(password, requester.password_hash);

      if (!valid) {
        return jsonResponse(
          { error: "Mot de passe incorrect." },
          401,
        );
      }

      const { data: target, error: targetError } = await supabase
        .from("admins")
        .select("id")
        .eq("id", targetId)
        .maybeSingle();

      if (targetError) throw targetError;

      if (!target) {
        return jsonResponse(
          { error: "Administrateur introuvable." },
          404,
        );
      }

      const { data: existing, error: existingError } = await supabase
        .from("admin_deletion_requests")
        .select("id")
        .eq("requester_id", session.admin_id)
        .eq("target_id", targetId)
        .eq("status", "pending")
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing) {
        return jsonResponse(
          { error: "Une demande est déjà en attente pour cet administrateur." },
          409,
        );
      }

      const { error: insertError } = await supabase
        .from("admin_deletion_requests")
        .insert({
          requester_id: session.admin_id,
          target_id: targetId,
        });

      if (insertError) throw insertError;

      return jsonResponse({ success: true });
    }

    // LIST DELETION REQUESTS — celles que j'ai envoyées + celles que j'ai reçues
    if (action === "listDeletionRequests") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const { data: requests, error: requestsError } = await supabase
        .from("admin_deletion_requests")
        .select("id, created_at, requester_id, target_id")
        .eq("status", "pending")
        .or(`requester_id.eq.${session.admin_id},target_id.eq.${session.admin_id}`)
        .order("created_at", { ascending: true });

      if (requestsError) throw requestsError;

      const { data: allAdmins, error: adminsError } = await supabase
        .from("admins")
        .select("id, username");

      if (adminsError) throw adminsError;

      const nameById: Record<string, string> = {};
      for (const a of allAdmins || []) {
        nameById[a.id] = a.username;
      }

      const sent = [];
      const received = [];

      for (const r of requests || []) {
        const row = {
          id: r.id,
          createdAt: r.created_at,
          requesterUsername: nameById[r.requester_id] || "?",
          targetUsername: nameById[r.target_id] || "?",
        };

        if (r.requester_id === session.admin_id) {
          sent.push(row);
        } else {
          received.push(row);
        }
      }

      return jsonResponse({ sent, received });
    }

    // CANCEL DELETION REQUEST — le demandeur retire sa propre demande
    if (action === "cancelDeletionRequest") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const requestId = String(body.requestId || "");

      const { data: reqRow, error: reqError } = await supabase
        .from("admin_deletion_requests")
        .select("id, requester_id, status")
        .eq("id", requestId)
        .maybeSingle();

      if (reqError) throw reqError;

      if (!reqRow || reqRow.requester_id !== session.admin_id || reqRow.status !== "pending") {
        return jsonResponse(
          { error: "Demande introuvable." },
          404,
        );
      }

      const { error: deleteReqError } = await supabase
        .from("admin_deletion_requests")
        .delete()
        .eq("id", requestId);

      if (deleteReqError) throw deleteReqError;

      return jsonResponse({ success: true });
    }

    // RESPOND TO DELETION REQUEST — seule la cible peut répondre.
    // Accepter = elle consent à sa PROPRE suppression et doit taper
    // son propre mot de passe pour le confirmer.
    if (action === "respondDeletionRequest") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const requestId = String(body.requestId || "");
      const accept = Boolean(body.accept);
      const password = String(body.password || "");

      const { data: reqRow, error: reqError } = await supabase
        .from("admin_deletion_requests")
        .select("id, requester_id, target_id, status")
        .eq("id", requestId)
        .maybeSingle();

      if (reqError) throw reqError;

      if (!reqRow || reqRow.status !== "pending") {
        return jsonResponse(
          { error: "Cette demande n'existe plus." },
          404,
        );
      }

      if (reqRow.target_id !== session.admin_id) {
        return jsonResponse(
          { error: "Seul l'administrateur visé peut répondre à cette demande." },
          403,
        );
      }

      if (!accept) {
        const { error: rejectError } = await supabase
          .from("admin_deletion_requests")
          .update({ status: "rejected" })
          .eq("id", requestId);

        if (rejectError) throw rejectError;

        return jsonResponse({ success: true, deleted: false });
      }

      // Acceptation : la cible confirme sa propre suppression avec son mot de passe
      const { data: me, error: meError } = await supabase
        .from("admins")
        .select("password_hash")
        .eq("id", session.admin_id)
        .single();

      if (meError) throw meError;

      const valid = await verifyPassword(password, me.password_hash);

      if (!valid) {
        return jsonResponse(
          { error: "Mot de passe incorrect." },
          401,
        );
      }

      const { count, error: countError } = await supabase
        .from("admins")
        .select("id", { count: "exact", head: true });

      if (countError) throw countError;

      if ((count ?? 0) <= 1) {
        return jsonResponse(
          { error: "Impossible de supprimer le dernier administrateur." },
          400,
        );
      }

      // La suppression de l'admin entraîne, en cascade (défini dans le
      // schéma SQL), la suppression de ses sessions et de toutes les
      // demandes de suppression le concernant — aucun nettoyage manuel
      // supplémentaire n'est nécessaire ici.
      const { error: deleteError } = await supabase
        .from("admins")
        .delete()
        .eq("id", session.admin_id);

      if (deleteError) throw deleteError;

      return jsonResponse({ success: true, deleted: true });
    }

    // ADD ADMIN
    if (action === "addAdmin") {
      const token = getToken(req, body);
      const session = await getSession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const username = String(body.newUsername || "").trim();
      const password = String(body.newPassword || "");

      if (username.length < 3) {
        return jsonResponse(
          { error: "Le nom d'utilisateur doit faire au moins 3 caractères." },
          400,
        );
      }

      if (password.length < 6) {
        return jsonResponse(
          { error: "Le mot de passe doit faire au moins 6 caractères." },
          400,
        );
      }

      const passwordHash = await hashPassword(password);

      const { error } = await supabase
        .from("admins")
        .insert({
          username,
          password_hash: passwordHash,
        });

      if (error) {
        if (error.code === "23505") {
          return jsonResponse(
            { error: "Ce nom d'utilisateur existe déjà." },
            409,
          );
        }
        throw error;
      }

      return jsonResponse({ success: true });
    }

    return jsonResponse(
      { error: "Action inconnue." },
      400,
    );
  } catch (error) {
    console.error("admin-auth:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      500,
    );
  }
});
