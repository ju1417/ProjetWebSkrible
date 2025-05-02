import { Context } from "../deps.ts";
import { hashPassword } from "../utils/passwordUtils.ts";
import { getDB } from "../config/database.ts";

export async function registerUser(ctx: Context) {
  try {
    // 1. Vérifier la présence du corps
    if (!ctx.request.hasBody) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Requête invalide. Aucun corps fourni.",
      };
      return;
    }

    // 2. Récupérer les données (méthode correcte pour Oak v17.1.4)
    const body = ctx.request.body({ type: "json" });
    const userData = await body.value;
    
    console.log("Données reçues:", userData);
    
    // 3. Extraire et valider
    const { username, password } = userData;
    
    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = {
        success: false,
        error: "Tous les champs (username, password) sont requis.",
      };
      return;
    }

    const db = await getDB();
    
    // 4. Vérifier si l'utilisateur existe déjà
    const existingUser = await db.query("SELECT * FROM users WHERE username = ?", [username]);
    if (existingUser.length > 0) {
      ctx.response.status = 409;
      ctx.response.body = {
        success: false,
        error: "Ce nom d'utilisateur est déjà utilisé.",
      };
      return;
    }

    // 5. Hasher le mot de passe
    const hashedPassword = await hashPassword(password);
    
    // 6. Insérer l'utilisateur dans la base de données
    await db.query("INSERT INTO users (username, password) VALUES (?, ?)", [
      username,
      hashedPassword,
    ]);

    // 7. Répondre avec succès
    ctx.response.status = 201;
    ctx.response.body = {
      success: true,
      message: "Utilisateur inscrit avec succès.",
    };
  } catch (error) {
    console.error("Erreur lors de l'inscription :", error);
    
    // 8. Gérer les erreurs spécifiques
    if (error.message?.includes("UNIQUE constraint failed")) {
      ctx.response.status = 409;
      ctx.response.body = {
        success: false,
        error: "Ce nom d'utilisateur est déjà utilisé.",
      };
    } else {
      ctx.response.status = 500;
      ctx.response.body = {
        success: false,
        error: "Erreur interne du serveur.",
      };
    }
  }
}