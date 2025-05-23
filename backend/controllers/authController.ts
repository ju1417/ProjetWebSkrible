import { Context } from "../deps.ts";
import { db } from "../config/server.ts";
import { hashPassword, verifyPassword } from "../utils/passwordUtils.ts";



export async function loginUser(ctx: Context) {
  try {
    const { username, password } = await ctx.request.body().value;
    
    // Pour debug : toujours retourner isAdmin = true pour 'admin'
    if (username === 'admin') {
      ctx.response.body = { 
        success: true,
        message: "Connexion réussie",
        user: { 
          id: 11, 
          username: 'admin',
          isAdmin: true  // ✅ FORCÉ pour test
        }
      };
      return;
    }
    
    // Reste du code...
  } catch (error) {
    console.error("Erreur login:", error);
  }
}