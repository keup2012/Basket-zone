-- Configuration initiale du chatbot Basket Zone
-- À exécuter une seule fois dans Supabase > SQL Editor.

insert into public.settings (key, value)
values
  ('chat_provider', 'gemini'),
  ('chat_model', 'gemini-2.5-flash'),
  ('chat_api_key', ''),
  ('chat_system_prompt', 'Tu es l’assistant officiel de Basket Zone. Réponds en français. Aide sur le basket, les compétitions, les joueurs, les règles et l’utilisation du site. Si la question n’a aucun rapport avec le basket ou Basket Zone, indique poliment que tu es spécialisé dans ce domaine.'),
  ('chat_max_tokens', '800')
on conflict (key) do nothing;
