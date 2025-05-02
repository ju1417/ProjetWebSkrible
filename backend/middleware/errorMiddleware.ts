import { Context, isHttpError, Status } from "../deps.ts";

// Middleware pour logger et gérer les erreurs
export async function errorHandler(ctx: Context, next: () => Promise<unknown>) {
  try {
    await next();
  } catch (err) {
    console.error("Une erreur s'est produite:", err);

    // Gérer les erreurs HTTP
    if (isHttpError(err)) {
      ctx.response.status = err.status;
      const message = err.message || `Erreur HTTP ${err.status}`;
      ctx.response.body = { error: message };
      return;
    }

    // Gérer les autres types d'erreurs
    ctx.response.status = Status.InternalServerError;
    ctx.response.body = { 
      error: "Une erreur interne est survenue sur le serveur.",
      // En développement, on peut inclure plus de détails
      ...(Deno.env.get("MODE") === "development" ? { details: err.message } : {})
    };
  }
}

// Middleware pour gérer les routes non trouvées
export function notFoundHandler(ctx: Context) {
  ctx.response.status = Status.NotFound;
  ctx.response.body = { error: "Route non trouvée." };
}