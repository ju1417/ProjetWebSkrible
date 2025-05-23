import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { dotenvConfig } from "../deps.ts";

// Charger la configuration
const env = await dotenvConfig({ export: true });

// Configuration ciblant EXPLICITEMENT la base 'postgres'
const db = new Client({
  user: env.DB_USER || "postgres",
  password: env.DB_PASSWORD || "1234",
  database: "postgres", // Base principale à utiliser
  hostname: env.DB_HOST || "localhost",
  port: parseInt(env.DB_PORT || "5432"),
  tls: { enforce: false }
});

async function inspectPostgresDatabase() {
  try {
    await db.connect();
    
    // 1. Vérification CRUCIALE de la base connectée
    const { rows: [dbInfo] } = await db.queryObject(`
      SELECT 
        current_database() as name,
        current_user as user,
        inet_server_addr() as server
    `);
    
    console.log(`\n🔍 Connecté au serveur '${dbInfo.server}'`);
    console.log(`📂 Base active: '${dbInfo.name}'`);
    console.log(`👤 Utilisateur: '${dbInfo.user}'`);

    // 2. Vérification des tables spécifiques à votre application
    const { rows: tables } = await db.queryObject(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name IN ('words', 'users', 'games')
    `);

    if (tables.length === 0) {
      console.log("\n⚠️ Aucune table d'application trouvée dans 'postgres'");
      console.log("   Vérifiez que vous utilisez bien la bonne base de données");
      return false;
    }

    console.log("\n🗂 Tables de l'application trouvées:");
    tables.forEach(t => console.log(`- ${t.table_name}`));

    // 3. Inspection détaillée
    for (const table of tables) {
      console.log(`\n📊 Contenu de '${table.table_name}':`);
      
      // Structure
      const { rows: columns } = await db.queryObject(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table.table_name]);
      console.log("  Structure:", columns);

      // Données (limitée à 3 entrées)
      const { rows: data } = await db.queryObject(`
        SELECT * FROM ${table.table_name} LIMIT 3
      `);
      console.log("  Exemples:", data);
    }

    return true;

  } catch (err) {
    console.error("\n❌ Erreur grave:", err.message);
    return false;
  } finally {
    await db.end();
  }
}

// Exécution
console.log("\nDébut de l'inspection de la base 'postgres'...");
const success = await inspectPostgresDatabase();
console.log(`\n${success ? "✅ Vérification réussie" : "❌ Problème détecté"}`);
Deno.exit(success ? 0 : 1);