import { Context, verifyJWT, Status, dotenvConfig } from "../deps.ts";

// Charger les variables d'environnement
const env = await dotenvConfig({ export: true });
const JWT_SECRET = env.JWT_SECRET || "default_secret_change_this";

// Interface pour les données utilisateur du JWT
interface JwtPayload {
  id: number;
  username: string;
  email: string;
  role: string;
  exp: number;
}

// Middleware pour vérifier le token JWT
export async function authenticateToken(ctx: Context, next: () => Promise<unknown>) {
  try {
    // Récupérer le token du cookie ou de l'en-tête Authorization
    const authHeader = ctx.request.headers.get("Authorization");
    const cookies = await ctx.cookies.get("jwt");
    const token = cookies || (authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : undefined);

    if (!token) {
      ctx.response.status = Status.Unauthorized;
      ctx.response.body = { error: "Accès refusé. Aucun token fourni." };
      return;
    }

    try {
      // Vérifier le token
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(JWT_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
      );
      
      const payload = await verifyJWT({ jwt: token, key });
      
      // Ajouter les données utilisateur au contexte
      ctx.state.user = payload;
      
      await next();
    } catch (error) {
      ctx.response.status = Status.Forbidden;
      ctx.response.body = { error: "Token invalide ou expiré." };
    }
  } catch (error) {
    console.error("Erreur dans le middleware d'authentification:", error);
    ctx.response.status = Status.InternalServerError;
    ctx.response.body = { error: "Erreur serveur lors de l'authentification." };
  }
}

// Middleware pour vérifier le rôle d'administrateur
export async function isAdmin(ctx: Context, next: () => Promise<unknown>) {
  if (!ctx.state.user) {
    ctx.response.status = Status.Unauthorized;
    ctx.response.body = { error: "Utilisateur non authentifié." };
    return;
  }

  if (ctx.state.user.role !== "admin") {
    ctx.response.status = Status.Forbidden;
    ctx.response.body = { error: "Accès refusé. Droits d'administrateur requis." };
    return;
  }

  await next();
}