import { DB, path, ensureDir, exists, dotenvConfig } from "../deps.ts";

// Charger les variables d'environnement
const env = await dotenvConfig({ export: true });

// Chemin vers la base de données
const dbPath = env.DB_PATH || "./db/skribble.db";

// Fonction pour initialiser la base de données
export async function initDatabase(): Promise<DB> {
  try {
    // S'assurer que le répertoire existe
    const dir = path.dirname(dbPath);
    await ensureDir(dir);

    // Créer une instance de la base de données
    const db = new DB(dbPath);
    console.log("Connexion à la base de données SQLite établie.");

    // Activer les clés étrangères
    db.query("PRAGMA foreign_keys = ON;");

    return db;
  } catch (error) {
    console.error("Erreur lors de la connexion à la base de données:", error);
    throw error;
  }
}

// Fonction pour exécuter les migrations
export async function runMigrations(db: DB): Promise<void> {
  try {
    // Création de la table utilisateurs
    db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Création de la table mots
    db.query(`
      CREATE TABLE IF NOT EXISTS words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL UNIQUE,
        difficulty INTEGER NOT NULL DEFAULT 1,
        category TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Création de la table parties
    db.query(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'waiting',
        max_players INTEGER NOT NULL DEFAULT 8,
        current_round INTEGER DEFAULT 0,
        total_rounds INTEGER NOT NULL DEFAULT 3,
        created_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Création de la table manches
    db.query(`
      CREATE TABLE IF NOT EXISTS rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        drawer_id INTEGER,
        word_id INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        start_time TIMESTAMP,
        end_time TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
        FOREIGN KEY (drawer_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE SET NULL
      )
    `);

    // Création de la table dessins
    db.query(`
      CREATE TABLE IF NOT EXISTS drawings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL,
        drawing_data TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
      )
    `);

    // Ajouter quelques mots pour les tests
    const words = [
      { word: "chat", difficulty: 1, category: "animaux" },
      { word: "chien", difficulty: 1, category: "animaux" },
      { word: "maison", difficulty: 1, category: "objets" },
      { word: "voiture", difficulty: 1, category: "objets" },
      { word: "ordinateur", difficulty: 2, category: "technologie" },
      { word: "téléphone", difficulty: 2, category: "technologie" },
      { word: "montagne", difficulty: 2, category: "nature" },
      { word: "plage", difficulty: 2, category: "nature" },
      { word: "hélicoptère", difficulty: 3, category: "véhicules" },
      { word: "sous-marin", difficulty: 3, category: "véhicules" },
    ];

    for (const word of words) {
      try {
        db.query(
          "INSERT OR IGNORE INTO words (word, difficulty, category) VALUES (?, ?, ?)",
          [word.word, word.difficulty, word.category]
        );
      } catch (error) {
        // Ignorer les erreurs de clé dupliquée
        if (!error.message.includes("UNIQUE constraint failed")) {
          throw error;
        }
      }
    }

    console.log("Migrations de la base de données exécutées avec succès");
  } catch (error) {
    console.error("Erreur lors de l'exécution des migrations:", error);
    throw error;
  }
}

// Instance singleton de la base de données
let dbInstance: DB | null = null;

// Fonction pour obtenir l'instance de la base de données
export async function getDB(): Promise<DB> {
  if (!dbInstance) {
    dbInstance = await initDatabase();
    await runMigrations(dbInstance);
  }
  return dbInstance;
}