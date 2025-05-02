// Dépendances du serveur Oak
export {
    Application,
    Router,
    Context,
    isHttpError,
    Status,
   } from "https://deno.land/x/oak@v17.1.4/mod.ts";
   
   // CORS middleware
   export { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
   
   // SQLite pour la base de données
   export { DB } from "https://deno.land/x/sqlite@v3.7.0/mod.ts";
   
   // Bcrypt pour le hachage des mots de passe
   export * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
   
   // JWT pour l'authentification
   export {
    create as createJWT,
    verify as verifyJWT,
    decode as decodeJWT,
    getNumericDate,
   } from "https://deno.land/x/djwt@v2.9.1/mod.ts";
   
   // Configuration des variables d'environnement
   export { load as dotenvConfig } from "https://deno.land/std@0.206.0/dotenv/mod.ts";
   
   // Utilitaires pour le système de fichiers
   export {
    ensureDir,
    exists,
   } from "https://deno.land/std@0.206.0/fs/mod.ts";
   
   // Utilitaires pour les chemins de fichiers
   export * as path from "https://deno.land/std@0.206.0/path/mod.ts";
   
   // Crypto pour générer des secrets
   export * as crypto from "https://deno.land/std@0.206.0/crypto/mod.ts";
   
   // Logger
   export * as log from "https://deno.land/std@0.206.0/log/mod.ts";
   
   // WebSocket pour la communication en temps réel
   export { serve as WebSocketServer } from "https://deno.land/std@0.206.0/http/server.ts";
   
   // Nous utiliserons directement Deno.upgradeWebSocket dans server.ts