import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { dotenvConfig } from "../deps.ts";

// Charger la configuration
const env = await dotenvConfig({ export: true });

// Configuration de connexion
const db = new Client({
  user: env.DB_USER || "postgres",
  password: env.DB_PASSWORD || "1234",
  database: env.DB_NAME || "postgres", // Connectez-vous directement à skribble
  hostname: env.DB_HOST || "localhost",
  port: parseInt(env.DB_PORT || "5432"),
  tls: { enforce: false }
});

try {
  await db.connect();
  
  // 1. Info de connexion
  const { rows: [dbInfo] } = await db.queryObject(`
    SELECT current_database() as name, 
           pg_size_pretty(pg_database_size(current_database())) as size
  `);
  console.log(`🔌 Connecté à: '${dbInfo.name}' (Taille: ${dbInfo.size})`);

  // 2. Liste des tables
  const { rows: tables } = await db.queryObject(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
  `);
  
  console.log("\n🗂 Tables disponibles:");
  tables.forEach(t => console.log("-", t.table_name));

  // 3. Détail des tables
  for (const table of tables) {
    console.log(`\n📊 Contenu de la table '${table.table_name}':`);
    
    // Structure
    const structure = await db.queryObject(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
    `, [table.table_name]);
    console.log("  Structure:", structure.rows.map(c => `${c.column_name} (${c.data_type})`));

    // 5 premières entrées
    try {
      const content = await db.queryObject(`
        SELECT * FROM ${table.table_name} LIMIT 5
      `);
      console.log("  Exemples:", content.rows);
    } catch {
      console.log("  (Impossible d'afficher le contenu)");
    }
  }

} catch (err) {
  console.error("❌ Erreur:", err.message);
} finally {
  await db.end();
  console.log("\n🔌 Connexion fermée");
  Deno.exit(0);
}