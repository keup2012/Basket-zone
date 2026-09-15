import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SESSION_DURATION_MS = 1000 * 60 * 60 * 24; // 24 hours

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
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const hashArray = new Uint8Array(bits);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(hashArray).map(b => b.toString(16).padStart(2, "0")).join("");
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  const computed = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return computed === hashHex;
}

function generateToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

async function createSession(adminId: string): Promise<string> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const { error } = await supabase.from("admin_sessions").insert({
    admin_id: adminId,
    token,
    expires_at: expiresAt,
  });
  if (error) throw new Error("Session creation failed");
  return token;
}

async function verifySession(token: string): Promise<{ admin_id: string; username: string } | null> {
  if (!token) return null;
  const { data, error } = await supabase
    .from("admin_sessions")
    .select("admin_id, expires_at, admins!inner(username)")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("admin_sessions").delete().eq("token", token);
    return null;
  }
  const adminData = data.admins as unknown as { username: string };
  return { admin_id: data.admin_id, username: adminData.username };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    // ---- CHECK STATUS (how many admins exist?) ----
    if (action === "status") {
      const { count, error } = await supabase
        .from("admins")
        .select("*", { count: "exact", head: true });
      if (error) throw error;
      return new Response(JSON.stringify({
        hasAdmins: (count ?? 0) > 0,
        adminCount: count ?? 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- CREATE FIRST ADMIN (only allowed when zero admins exist) ----
    if (action === "setup") {
      const { count } = await supabase
        .from("admins")
        .select("*", { count: "exact", head: true });
      if ((count ?? 0) > 0) {
        return new Response(JSON.stringify({ error: "Un administrateur existe déjà. La création publique est désactivée." }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (username.length < 3) {
        return new Response(JSON.stringify({ error: "Le nom d'utilisateur doit faire au moins 3 caractères." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: "Le mot de passe doit faire au moins 6 caractères." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const passwordHash = await hashPassword(password);
      const { data, error } = await supabase
        .from("admins")
        .insert({ username, password_hash: passwordHash })
        .select("id, username")
        .single();
      if (error) {
        if (error.code === "23505") {
          return new Response(JSON.stringify({ error: "Ce nom d'utilisateur existe déjà." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw error;
      }
      const token = await createSession(data.id);
      return new Response(JSON.stringify({
        success: true,
        token,
        username: data.username,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- LOGIN ----
    if (action === "login") {
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!username || !password) {
        return new Response(JSON.stringify({ error: "Nom d'utilisateur et mot de passe requis." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data, error } = await supabase
        .from("admins")
        .select("id, username, password_hash")
        .eq("username", username)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return new Response(JSON.stringify({ error: "Identifiants incorrects." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const valid = await verifyPassword(password, data.password_hash);
      if (!valid) {
        return new Response(JSON.stringify({ error: "Identifiants incorrects." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const token = await createSession(data.id);
      return new Response(JSON.stringify({
        success: true,
        token,
        username: data.username,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- LOGOUT ----
    if (action === "logout") {
      const token = req.headers.get("x-admin-session") || body.token;
      if (token) {
        await supabase.from("admin_sessions").delete().eq("token", token);
      }
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- VERIFY SESSION (check if token is still valid) ----
    if (action === "verify") {
      const token = req.headers.get("x-admin-session") || body.token;
      const session = await verifySession(token || "");
      if (!session) {
        return new Response(JSON.stringify({ valid: false }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ valid: true, username: session.username }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- ADD ADMIN (only authenticated admins can add new admins) ----
    if (action === "addAdmin") {
      const token = req.headers.get("x-admin-session") || body.token;
      const session = await verifySession(token || "");
      if (!session) {
        return new Response(JSON.stringify({ error: "Non autorisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const username = String(body.newUsername || "").trim();
      const password = String(body.newPassword || "");
      if (username.length < 3) {
        return new Response(JSON.stringify({ error: "Le nom d'utilisateur doit faire au moins 3 caractères." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (password.length < 6) {
        return new Response(JSON.stringify({ error: "Le mot de passe doit faire au moins 6 caractères." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const passwordHash = await hashPassword(password);
      const { error } = await supabase
        .from("admins")
        .insert({ username, password_hash: passwordHash });
      if (error) {
        if (error.code === "23505") {
          return new Response(JSON.stringify({ error: "Ce nom d'utilisateur existe déjà." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        throw error;
      }
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- LIST ADMINS (authenticated only) ----
    if (action === "listAdmins") {
      const token = req.headers.get("x-admin-session") || body.token;
      const session = await verifySession(token || "");
      if (!session) {
        return new Response(JSON.stringify({ error: "Non autorisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data, error } = await supabase
        .from("admins")
        .select("id, username, created_at")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return new Response(JSON.stringify({ admins: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- DELETE ADMIN (authenticated, cannot delete self, cannot delete last admin) ----
    if (action === "deleteAdmin") {
      const token = req.headers.get("x-admin-session") || body.token;
      const session = await verifySession(token || "");
      if (!session) {
        return new Response(JSON.stringify({ error: "Non autorisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const targetId = String(body.adminId || "");
      if (!targetId) {
        return new Response(JSON.stringify({ error: "ID administrateur manquant." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (targetId === session.admin_id) {
        return new Response(JSON.stringify({ error: "Vous ne pouvez pas supprimer votre propre compte." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { count } = await supabase
        .from("admins")
        .select("*", { count: "exact", head: true });
      if ((count ?? 0) <= 1) {
        return new Response(JSON.stringify({ error: "Impossible de supprimer le dernier administrateur." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabase.from("admins").delete().eq("id", targetId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Action inconnue." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
