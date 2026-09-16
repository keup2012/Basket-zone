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

async function getSetting(key: string): Promise<string> {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return "";
  return data.value || "";
}

async function updateSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() });
  if (error) throw error;
}

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

function clampNumber(value: string, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action || "chat";

    // ---- CHAT (public, uses server-side API key) ----
    if (action === "chat") {
      const userMessage = String(body.message || "").trim();
      const history = Array.isArray(body.history) ? body.history : [];

      if (!userMessage) {
        return new Response(JSON.stringify({ error: "Message vide." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (userMessage.length > 2000) {
        return new Response(JSON.stringify({ error: "Message trop long (maximum 2000 caractères)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const apiKey = await getSetting("chat_api_key");
      const provider = await getSetting("chat_provider");
      const systemPrompt = await getSetting("chat_system_prompt");
      const model = await getSetting("chat_model");
      const maxTokens = clampNumber(await getSetting("chat_max_tokens"), 800, 100, 4000);
    
      if (!apiKey || !provider) {
        return new Response(JSON.stringify({
          error: "Le chatbot n'est pas encore configuré. Un administrateur doit configurer la clé API dans le panneau d'administration.",
        }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let reply: string;

      if (provider === "openai") {
        reply = await callOpenAI(apiKey, systemPrompt, userMessage, history, model, maxTokens);
      } else if (provider === "anthropic") {
        reply = await callAnthropic(apiKey, systemPrompt, userMessage, history, model, maxTokens);
      } else if (provider === "openrouter") {
        reply = await callOpenRouter(apiKey, systemPrompt, userMessage, history, model || body.model || "openrouter/free", maxTokens);
      } else if (provider === "gemini") {
        reply = await callGemini(apiKey, systemPrompt, userMessage, history, model || body.model || "gemini-2.5-flash", maxTokens);
      } else {
        return new Response(JSON.stringify({ error: `Fournisseur "${provider}" non supporté.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({ reply }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- GET CONFIG (admin only) ----
    if (action === "getConfig") {
      const token = req.headers.get("x-admin-session") || body.token;
      const isAdmin = await verifyAdminSession(token);
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Non autorisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const [provider, apiKey, systemPrompt, model, maxTokens] = await Promise.all([
        getSetting("chat_provider"),
        getSetting("chat_api_key"),
        getSetting("chat_system_prompt"),
        getSetting("chat_model"),
        getSetting("chat_max_tokens"),
      ]);
      return new Response(JSON.stringify({
        provider,
        apiKey,
        systemPrompt,
        model,
        maxTokens,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---- UPDATE CONFIG (admin only) ----
    if (action === "updateConfig") {
      const token = req.headers.get("x-admin-session") || body.token;
      const isAdmin = await verifyAdminSession(token);
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Non autorisé." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (body.provider !== undefined) {
        await updateSetting("chat_provider", String(body.provider));
      }
      if (body.apiKey !== undefined) {
        await updateSetting("chat_api_key", String(body.apiKey));
      }
      if (body.model !== undefined) {
        await updateSetting("chat_model", String(body.model || "openrouter/free"));
      }
      if (body.systemPrompt !== undefined) {
        await updateSetting("chat_system_prompt", String(body.systemPrompt));
      }
      if (body.maxTokens !== undefined) {
        await updateSetting("chat_max_tokens", String(body.maxTokens));
      }
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

// ---- AI Provider implementations ----

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  history: { role: string; content: string }[],
  model: string,
  maxTokens: number,
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erreur OpenAI (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse.";
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  history: { role: string; content: string }[],
  model: string,
  maxTokens: number,
): Promise<string> {
  const messages = [
    ...history.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-3-5-sonnet-20241022",
      system: systemPrompt,
      messages,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erreur Anthropic (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  return data.content?.[0]?.text || "Désolé, je n'ai pas pu générer de réponse.";
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  history: { role: string; content: string }[],
  model: string,
  maxTokens: number,
): Promise<string> {
  const contents = [
    ...history.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: String(m.content || "") }],
    })),
    { role: "user", parts: [{ text: userMessage }] },
  ];

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = {
      parts: [{ text: systemPrompt }],
    };
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || "gemini-2.5-flash")}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erreur Gemini (${resp.status}): ${errText}`);
  }

  const data = await resp.json();
  const reply = data.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text || "")
    .join("")
    .trim();

  return reply || "Désolé, je n'ai pas pu générer de réponse.";
}

async function callOpenRouter(
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
  history: { role: string; content: string }[],
  model: string,
  maxTokens: number,
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: userMessage },
  ];
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://basket-zone.fr",
      "X-Title": "Basket Zone",
    },
    body: JSON.stringify({
      model: model || "openrouter/free",
      messages,
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Erreur OpenRouter (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu générer de réponse.";
}
