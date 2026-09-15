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

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24; // 24 heures

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
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
    keyMaterial,
    256,
  );

  const hashArray = new Uint8Array(bits);

  const saltHex = Array.from(salt)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split(":");

  if (parts.length !== 2) return false;

  const [saltHex, hashHex] = parts;

  if (!saltHex || !hashHex) return false;

  const saltParts = saltHex.match(/.{2}/g);

  if (!saltParts) return false;

  const salt = new Uint8Array(
    saltParts.map((h) => Number.parseInt(h, 16)),
  );

  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
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
    keyMaterial,
    256,
  );

  const computed = Array.from(new Uint8Array(bits))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return computed === hashHex;
}

function generateToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID().replace(/-/g, "")}`;
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
    throw new Error(`Session creation failed: ${error.message}`);
  }

  return token;
}

async function verifySession(
  token: string,
): Promise<{ admin_id: string; username: string } | null> {
  if (!token) return null;

  const { data, error } = await supabase
    .from("admin_sessions")
    .select("admin_id, expires_at, admins!inner(username)")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;

  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase
      .from("admin_sessions")
      .delete()
      .eq("token", token);

    return null;
  }

  const adminData = data.admins as unknown as {
    username: string;
  };

  return {
    admin_id: data.admin_id,
    username: adminData.username,
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

    // ---- STATUS ----
    if (action === "status") {
      const { count, error } = await supabase
        .from("admins")
        .select("*", {
          count: "exact",
          head: true,
        });

      if (error) throw error;

      return jsonResponse({
        hasAdmins: (count ?? 0) > 0,
        adminCount: count ?? 0,
      });
    }

    // ---- SETUP PREMIER ADMIN ----
    if (action === "setup") {
      const { count, error: countError } = await supabase
        .from("admins")
        .select("*", {
          count: "exact",
          head: true,
        });

      if (countError) throw countError;

      if ((count ?? 0) > 0) {
        return jsonResponse(
          {
            error:
              "Un administrateur existe déjà. La création publique est désactivée.",
          },
          403,
        );
      }

      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (username.length < 3) {
        return jsonResponse(
          {
            error:
              "Le nom d'utilisateur doit faire au moins 3 caractères.",
          },
          400,
        );
      }

      if (password.length < 6) {
        return jsonResponse(
          {
            error:
              "Le mot de passe doit faire au moins 6 caractères.",
          },
          400,
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
            {
              error:
                "Ce nom d'utilisateur existe déjà.",
            },
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

    // ---- LOGIN ----
    if (action === "login") {
      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (!username || !password) {
        return jsonResponse(
          {
            error:
              "Nom d'utilisateur et mot de passe requis.",
          },
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

    // ---- LOGOUT ----
    if (action === "logout") {
      const token =
        req.headers.get("x-admin-session") ||
        String(body.token || "");

      if (token) {
        await supabase
          .from("admin_sessions")
          .delete()
          .eq("token", token);
      }

      return jsonResponse({ success: true });
    }

    // ---- VERIFY SESSION ----
    if (action === "verify") {
      const token =
        req.headers.get("x-admin-session") ||
        String(body.token || "");

      const session = await verifySession(token);

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

    // ---- ADD ADMIN ----
    if (action === "addAdmin") {
      const token =
        req.headers.get("x-admin-session") ||
        String(body.token || "");

      const session = await verifySession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const username = String(
        body.newUsername || "",
      ).trim();

      const password = String(
        body.newPassword || "",
      );

      if (username.length < 3) {
        return jsonResponse(
          {
            error:
              "Le nom d'utilisateur doit faire au moins 3 caractères.",
          },
          400,
        );
      }

      if (password.length < 6) {
        return jsonResponse(
          {
            error:
              "Le mot de passe doit faire au moins 6 caractères.",
          },
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
            {
              error:
                "Ce nom d'utilisateur existe déjà.",
            },
            409,
          );
        }

        throw error;
      }

      return jsonResponse({
        success: true,
      });
    }

    // ---- LIST ADMINS ----
    if (action === "listAdmins") {
      const token =
        req.headers.get("x-admin-session") ||
        String(body.token || "");

      const session = await verifySession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const { data, error } = await supabase
        .from("admins")
        .select("id, username, created_at")
        .order("created_at", {
          ascending: true,
        });

      if (error) throw error;

      return jsonResponse({
        admins: data || [],
      });
    }

    // ---- DELETE ADMIN ----
    if (action === "deleteAdmin") {
      const token =
        req.headers.get("x-admin-session") ||
        String(body.token || "");

      const session = await verifySession(token);

      if (!session) {
        return jsonResponse(
          { error: "Non autorisé." },
          401,
        );
      }

      const targetId = String(
        body.adminId || "",
      );

      if (!targetId) {
        return jsonResponse(
          {
            error:
              "ID administrateur manquant.",
          },
          400,
        );
      }

      if (targetId === session.admin_id) {
        return jsonResponse(
          {
            error:
              "Vous ne pouvez pas supprimer votre propre compte.",
          },
          400,
        );
      }

      const { count, error: countError } = await supabase
        .from("admins")
        .select("*", {
          count: "exact",
          head: true,
        });

      if (countError) throw countError;

      if ((count ?? 0) <= 1) {
        return jsonResponse(
          {
            error:
              "Impossible de supprimer le dernier administrateur.",
          },
          400,
        );
      }

      const { error } = await supabase
        .from("admins")
        .delete()
        .eq("id", targetId);

      if (error) throw error;

      return jsonResponse({
        success: true,
      });
    }

    return jsonResponse(
      { error: "Action inconnue." },
      400,
    );
  } catch (error) {
    console.error("admin-auth error:", error);

    return jsonResponse(
      {
        error:
          errorMessage(error) ||
          "Erreur interne du serveur.",
      },
      500,
    );
  }
});
