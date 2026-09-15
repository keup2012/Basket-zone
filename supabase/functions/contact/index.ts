import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Admin-Session",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function getClientIP(req: Request): string {
  const headers = [
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
    "x-client-ip",
  ];
  for (const h of headers) {
    const value = req.headers.get(h);
    if (value) return value.split(",")[0].trim();
  }
  return "unknown";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action || "submit";

    // ---- SUBMIT MESSAGE ----
    if (action === "submit") {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim();
      const subject = String(body.subject || "").trim();
      const content = String(body.message || body.content || "").trim();

      if (!name || !email || !subject || !content) {
        return new Response(JSON.stringify({ error: "Tous les champs sont obligatoires." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (content.length > 5000) {
        return new Response(JSON.stringify({ error: "Le message est trop long (maximum 5000 caractères)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const ip = getClientIP(req);

      // Rate limiting: count messages from this IP in the last 10 minutes
      const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
      const { count, error: countError } = await supabase
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("ip", ip)
        .gte("created_at", since);
      if (countError) throw countError;
      if ((count ?? 0) >= RATE_LIMIT_MAX) {
        return new Response(JSON.stringify({
          error: "Trop de messages envoyés. Veuillez réessayer dans quelques minutes.",
        }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { error } = await supabase.from("messages").insert({
        name,
        email,
        subject,
        content,
        ip,
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- LIST MESSAGES (admin only) ----
    if (action === "list") {
      const token = req.headers.get("x-admin-session") || body.token;
      const session = await verifyAdminSession(token);
      if (!session) {
        return new Response(JSON.stringify({ error: "Non autorisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data, error } = await supabase
        .from("messages")
        .select("id, name, email, subject, content, ip, is_read, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return new Response(JSON.stringify({ messages: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- MARK MESSAGE AS READ (admin only) ----
    if (action === "markRead") {
      const token = req.headers.get("x-admin-session") || body.token;
      const session = await verifyAdminSession(token);
      if (!session) {
        return new Response(JSON.stringify({ error: "Non autorisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const messageId = String(body.messageId || "");
      if (!messageId) {
        return new Response(JSON.stringify({ error: "ID manquant." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabase
        .from("messages")
        .update({ is_read: true })
        .eq("id", messageId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- DELETE MESSAGE (admin only) ----
    if (action === "delete") {
      const token = req.headers.get("x-admin-session") || body.token;
      const session = await verifyAdminSession(token);
      if (!session) {
        return new Response(JSON.stringify({ error: "Non autorisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const messageId = String(body.messageId || "");
      if (!messageId) {
        return new Response(JSON.stringify({ error: "ID manquant." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { error } = await supabase
        .from("messages")
        .delete()
        .eq("id", messageId);
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

async function verifyAdminSession(token: string): Promise<boolean> {
  if (!token) return false;
  const { data, error } = await supabase
    .from("admin_sessions")
    .select("expires_at")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return false;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await supabase.from("admin_sessions").delete().eq("token", token);
    return false;
  }
  return true;
}
