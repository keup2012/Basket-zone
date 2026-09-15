// ============================================================
// BASKET ZONE — Connexion à Supabase
// ============================================================
// À REMPLIR UNE SEULE FOIS avec les identifiants de ton projet
// Supabase (Project Settings > API dans ton dashboard Supabase).
//
// ⚠️ IMPORTANT sur la sécurité :
// - SUPABASE_URL et SUPABASE_ANON_KEY ci-dessous ne sont PAS des
//   secrets. Ils sont FAITS pour être visibles dans le code du
//   site (n'importe qui peut les voir dans le navigateur, c'est
//   normal et sans danger).
// - La vraie clé secrète s'appelle "service_role". Elle ne doit
//   JAMAIS apparaître dans un fichier du site. Elle vit
//   uniquement dans la configuration des Edge Functions, côté
//   serveur Supabase.
// ============================================================

const SUPABASE_URL = "https://cltirmjkjzsqykxbwnzi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsdGlybWpranpzcXlreGJ3bnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzkyMTksImV4cCI6MjEwNTA1NTIxOX0.VnSL2Prt4EKA8c3L-Sd4yCfUu1eU8ns2ys0rSh-WInc";

// Petit outil pour appeler nos futures Edge Functions
// (création/connexion admin, envoi de message, chatbot...)
const BasketZoneAPI = {
    async call(functionName, payload, sessionToken) {
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY
        };

        // Si l'admin est connecté, on ajoute son jeton de session
        if (sessionToken) {
            headers["X-Admin-Session"] = sessionToken;
        }

        const response = await fetch(
            `${SUPABASE_URL}/functions/v1/${functionName}`,
            {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload || {})
            }
        );

        return response.json();
    }
};
