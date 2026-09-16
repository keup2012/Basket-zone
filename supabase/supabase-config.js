// ============================================================
// BASKET ZONE — Connexion à Supabase
// ============================================================

const SUPABASE_URL = "https://cltirmjkjzsqykxbwnzi.supabase.co";

const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNsdGlybWpranpzcXlreGJ3bnppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzkyMTksImV4cCI6MjEwNTA1NTIxOX0.VnSL2Prt4EKA8c3L-Sd4yCfUu1eU8ns2ys0rSh-WInc";

// ============================================================
// API HELPER
// Tout le backend passe par les Edge Functions Supabase.
// ============================================================

const BasketZoneAPI = {
    async call(functionName, payload = {}, sessionToken = "") {
        const headers = {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
            "apikey": SUPABASE_ANON_KEY
        };

        if (sessionToken) {
            headers["X-Admin-Session"] = sessionToken;
        }

        try {
            const response = await fetch(
                `${SUPABASE_URL}/functions/v1/${functionName}`,
                {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload || {})
                }
            );

            const text = await response.text();

            let data = {};
            try {
                data = text ? JSON.parse(text) : {};
            } catch {
                data = {
                    error: text || `Réponse invalide du serveur (HTTP ${response.status}).`
                };
            }

            if (!response.ok) {
                return {
                    ...data,
                    error: data.error || data.message || `Erreur HTTP ${response.status}.`,
                    status: response.status
                };
            }

            return data;
        } catch (error) {
            return {
                error: `Impossible de contacter Supabase : ${error?.message || String(error)}`,
                status: 0
            };
        }
    },

    // ---- SESSION ADMIN ----
    // Le jeton n'est gardé qu'en mémoire (pas dans sessionStorage) :
    // à chaque chargement/rechargement de la page /admin, il repart
    // à zéro et le mot de passe est redemandé. Il ne sert que pendant
    // la durée où le panneau reste ouvert dans l'onglet.

    _adminToken: "",

    getAdminToken() {
        return this._adminToken;
    },

    setAdminToken(token) {
        if (token) {
            this._adminToken = token;
        }
    },

    clearAdminToken() {
        this._adminToken = "";
    },

    // ---- ADMIN AUTH ----

    async checkStatus() {
        return this.call("admin-auth", {
            action: "status"
        });
    },

    async setupAdmin(username, password) {
        const result = await this.call("admin-auth", {
            action: "setup",
            username,
            password
        });

        if (result.token) {
            this.setAdminToken(result.token);
        }

        return result;
    },

    async login(username, password) {
        const result = await this.call("admin-auth", {
            action: "login",
            username,
            password
        });

        if (result.token) {
            this.setAdminToken(result.token);
        }

        return result;
    },

    async logout() {
        const token = this.getAdminToken();

        await this.call(
            "admin-auth",
            { action: "logout" },
            token
        );

        this.clearAdminToken();
    },

    async verifySession() {
        return this.call(
            "admin-auth",
            { action: "verify" },
            this.getAdminToken()
        );
    },

    async listAdmins() {
        return this.call(
            "admin-auth",
            { action: "listAdmins" },
            this.getAdminToken()
        );
    },

    async addAdmin(username, password) {
        return this.call(
            "admin-auth",
            {
                action: "addAdmin",
                newUsername: username,
                newPassword: password
            },
            this.getAdminToken()
        );
    },

    async changeUsername(newUsername, password) {
        return this.call(
            "admin-auth",
            {
                action: "changeUsername",
                newUsername,
                password
            },
            this.getAdminToken()
        );
    },

    async requestDeleteAdmin(targetId, password) {
        return this.call(
            "admin-auth",
            {
                action: "requestDeleteAdmin",
                targetId,
                password
            },
            this.getAdminToken()
        );
    },

    async listDeletionRequests() {
        return this.call(
            "admin-auth",
            { action: "listDeletionRequests" },
            this.getAdminToken()
        );
    },

    async cancelDeletionRequest(requestId) {
        return this.call(
            "admin-auth",
            {
                action: "cancelDeletionRequest",
                requestId
            },
            this.getAdminToken()
        );
    },

    async respondDeletionRequest(requestId, accept, password) {
        return this.call(
            "admin-auth",
            {
                action: "respondDeletionRequest",
                requestId,
                accept,
                password
            },
            this.getAdminToken()
        );
    },

    async getStats() {
        return this.call(
            "admin-auth",
            { action: "stats" },
            this.getAdminToken()
        );
    },

    async changeMyPassword(currentPassword, newPassword) {
        return this.call(
            "admin-auth",
            {
                action: "changePassword",
                currentPassword,
                newPassword
            },
            this.getAdminToken()
        );
    },

    // ---- MESSAGES ----

    async submitMessage(name, email, subject, message) {
        return this.call("contact", {
            action: "submit",
            name,
            email,
            subject,
            message
        });
    },

    async listMessages() {
        return this.call(
            "contact",
            { action: "list" },
            this.getAdminToken()
        );
    },

    async markMessageRead(messageId) {
        return this.call(
            "contact",
            {
                action: "markRead",
                messageId
            },
            this.getAdminToken()
        );
    },

    async deleteMessage(messageId) {
        return this.call(
            "contact",
            {
                action: "delete",
                messageId
            },
            this.getAdminToken()
        );
    },

    // ---- CHATBOT ----

    async chat(message, history) {
        return this.call("chat", {
            action: "chat",
            message,
            history: history || []
        });
    },

    async getChatConfig() {
        return this.call(
            "chat",
            { action: "getConfig" },
            this.getAdminToken()
        );
    },

    async updateChatConfig(provider, model, apiKey, systemPrompt, maxTokens) {
        return this.call(
            "chat",
            {
                action: "updateConfig",
                provider,
                model,
                apiKey,
                systemPrompt,
                maxTokens
            },
            this.getAdminToken()
        );
    }
};
