import { Context } from "../deps.ts";
import { db } from "../config/server.ts";
import { hashPassword, verifyPassword } from "../utils/passwordUtils.ts";

// Version ultra-simplifiée pour tester rapidement
export async function registerUser(ctx: Context) {
  try {
    // 1. Récupération des données
    const { username, password } = await ctx.request.body().value;

    // 2. Vérification rapide
    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Username et password requis" };
      return;
    }

    // 3. Hash et insertion
    const hashedPassword = await hashPassword(password);
    await db.queryObject(
      "INSERT INTO users (username, password) VALUES ($1, $2)",
      [username, hashedPassword]
    );

    ctx.response.status = 201;
    ctx.response.body = { message: "Utilisateur créé" };

  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Erreur serveur" };
    console.error("Erreur register:", error);
  }
}

export async function loginUser(ctx: Context) {
  try {
    const { username, password } = await ctx.request.body().value;

    // 1. Récupération utilisateur
    const { rows: [user] } = await db.queryObject(
      "SELECT password FROM users WHERE username = $1", 
      [username]
    );

    // 2. Vérification basique
    if (!user || !(await verifyPassword(password, user.password))) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Identifiants invalides" };
      return;
    }

    // 3. Réponse succès (sans JWT pour commencer)
    ctx.response.body = { message: "Connexion réussie" };

  } catch (error) {
    ctx.response.status = 500;
    ctx.response.body = { error: "Erreur serveur" };
  }
}