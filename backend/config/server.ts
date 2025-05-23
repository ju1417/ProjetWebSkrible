import { Application, Router, oakCors, dotenvConfig, Status } from "../deps.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { hashPassword, verifyPassword } from "../utils/passwordUtils.ts";

// ==================== CONFIGURATION ====================

// Charger les variables d'environnement
const env = await dotenvConfig({ export: true });
const PORT = parseInt(env.PORT || "3000");
const WS_PORT = 3001;
const FRONTEND_URL = env.FRONTEND_URL || "http://localhost:8080";

// Configuration PostgreSQL
export const db = new Client({
  user: env.DB_USER || "postgres",
  password: env.DB_PASSWORD || "1234",
  database: env.DB_NAME || "postgres",
  hostname: env.DB_HOST || "localhost",
  port: parseInt(env.DB_PORT || "5432"),
  applicationName: "skribble-game",
  connection: { attempts: 1 },
  tls: false
});

// ==================== TYPES ====================

interface Player {
  id: string;           // ID temporaire pour WebSocket
  username: string;
  score: number;
  isDrawing: boolean;
  userId?: number;      // ID de la base de données users
}

interface GameRoom {
  players: Map<string, Player>;
  currentWord: string | null;
  currentDrawer: string | null;
  gameState: 'waiting' | 'playing' | 'roundEnd';
  timeLeft: number;
  timerInterval?: number;
  totalRounds: number;
  currentRound: number;
  gameCreator: string | null;
}

// ==================== CONNEXION BASE DE DONNÉES ====================

try {
  await db.connect();
  console.log("✅ Base de données connectée");
} catch (error) {
  console.error("❌ Erreur connexion DB:", error);
}

// ==================== VARIABLES GLOBALES ====================

const gameRoom: GameRoom = {
  players: new Map(),
  currentWord: null,
  currentDrawer: null,
  gameState: 'waiting',
  timeLeft: 60,
  totalRounds: 2,
  currentRound: 0,
  gameCreator: null
};

const connectedClients = new Map<WebSocket, Player>();

var activityLog = [];
const MAX_LOG_ENTRIES = 50;

// ==================== CONFIGURATION EXPRESS ====================

const app = new Application();
const router = new Router();

// Configuration CORS
app.use(oakCors({
  origin: FRONTEND_URL, // Plus sécurisé que "*"
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Username"], // Ajoutez X-Admin-Username ici
  credentials: true
}));

// ==================== ROUTES D'AUTHENTIFICATION ====================

// Inscription
router.post("/api/register", async (ctx) => {
  try {
    const { username, password } = await ctx.request.body.json();
    
    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Nom d'utilisateur et mot de passe requis" };
      return;
    }
    
    // Connexion DB
    if (!db.connected) await db.connect();
    
    // Créer table users si nécessaire
    await db.queryObject(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        isadmin BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Vérifier si l'utilisateur existe
    const userExists = await db.queryObject(
      "SELECT * FROM users WHERE username = $1", [username]
    );
    
    if (userExists.rows.length > 0) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Ce nom d'utilisateur est déjà utilisé" };
      return;
    }
    
    // Hacher le mot de passe et insérer
    const hashedPassword = await hashPassword(password);
    const result = await db.queryObject(
      "INSERT INTO users (username, password, isadmin) VALUES ($1, $2, $3) RETURNING id, username, isadmin",
      [username, hashedPassword, false]
    );
    
    ctx.response.status = 201;
    ctx.response.body = { 
      message: "Utilisateur créé avec succès",
      user: result.rows[0]
    };
    
  } catch (error) {
    console.error("Erreur inscription:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Erreur serveur lors de l'inscription" };
  }
});

// Connexion
router.post("/api/login", async (ctx) => {
  try {
    const { username, password } = await ctx.request.body.json();
    
    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Nom d'utilisateur et mot de passe requis" };
      return;
    }
    
    // Connexion DB
    if (!db.connected) await db.connect();
    
    // Chercher l'utilisateur
    const userResult = await db.queryObject(
      "SELECT id, username, password, isadmin FROM users WHERE username = $1",
      [username]    
    );
    
    if (userResult.rows.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Nom d'utilisateur ou mot de passe incorrect" };
      return;
    }
    
    const user = userResult.rows[0];
    console.log("🔍 Raw user from DB:", user);
    console.log("🔍 user.isadmin:", user.isadmin);
    console.log("🔍 typeof user.isadmin:", typeof user.isadmin);
    
    // Vérifier le mot de passe
    const isPasswordValid = await verifyPassword(password, user.password);
    
    if (!isPasswordValid) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Nom d'utilisateur ou mot de passe incorrect" };
      return;
    }

    // Journaliser la connexion réussie
    logConnection(username);    

    ctx.response.status = 200;
    ctx.response.body = {
      success: true,
      message: "Connexion réussie",
      user: { id: user.id, username: user.username, isadmin : user.isadmin }
    };
    
  } catch (error) {
    console.error("Erreur connexion:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Erreur serveur lors de la connexion" };
  }
});

// Route pour se déconnecter
router.post("/api/logout", async (ctx) => {
    console.log("🚪 Requête de déconnexion reçue");
    
    try {
        // Lire le body de la requête
        const body = await ctx.request.body.json();
        console.log("📥 Body reçu:", body);
        
        const { username } = body;
        console.log("👤 Username à déconnecter:", username);
        
        if (username) {
            // Enregistrer la déconnexion
            logDisconnection(username);
            console.log("✅ Déconnexion enregistrée pour:", username);
        }
        
        // Réponse de succès
        ctx.response.status = 200;
        ctx.response.body = { 
            success: true, 
            message: `Déconnexion de ${username} enregistrée` 
        };
        
    } catch (error) {
        console.error("❌ Erreur logout:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur serveur" };
    }
});

// ===================== JOURNAL D'ACTIVITEES ====================

// Fonction pour journaliser les connexions
function logConnection(username) {
  const activity = {
    message: `${username} s'est connecté`,
    type: "connection",
    timestamp: new Date()
  };
  
  activityLog.unshift(activity);
  
  // Garder seulement les 50 dernières entrées
  if (activityLog.length > 50) {
    activityLog.pop();
  }
  
  console.log(`[ACTIVITY] Connection: ${username} s'est connecté`);
}


// Fonction pour journaliser les déconnexions
function logDisconnection(username) {
    console.log("🔥 === DEBUT logDisconnection ===");
    console.log("👤 Username reçu:", username);
    console.log("📊 Taille du log avant:", activityLog.length);
    
    const activity = {
        message: `${username} s'est déconnecté`,
        type: "disconnection",
        timestamp: new Date().toISOString()
    };
    
    console.log("📝 Activité créée:", activity);
    
    // Ajouter au début du tableau
    activityLog.unshift(activity);
    
    console.log("📊 Taille du log après unshift:", activityLog.length);
    console.log("📊 Première entrée du log:", activityLog[0]);
    
    // Garder seulement les 50 dernières entrées
    if (activityLog.length > 50) {
        activityLog.pop();
        console.log("📊 Log tronqué à 50 entrées");
    }
    
    console.log(`[ACTIVITY] Disconnection: ${username} s'est déconnecté`);
    console.log("🔥 === FIN logDisconnection ===");
}


// ==================== ROUTES DU JEU ====================

// Mot aléatoire
router.get("/api/random-word", async (ctx) => {
  try {
    if (!db.connected) await db.connect();
    
    // Créer table words si nécessaire
    await db.queryObject(`
      CREATE TABLE IF NOT EXISTS words (
        id SERIAL PRIMARY KEY,
        word VARCHAR(50) NOT NULL,
        difficulty INTEGER DEFAULT 1,
        category VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Ajouter des mots par défaut si la table est vide
    const wordCount = await db.queryObject(`SELECT COUNT(*) FROM words`);
    if (parseInt(wordCount.rows[0].count) === 0) {
      await db.queryObject(`
        INSERT INTO words (word, difficulty, category) VALUES
        ('chat', 1, 'animaux'),
        ('chien', 1, 'animaux'),
        ('maison', 1, 'objets'),
        ('voiture', 2, 'objets'),
        ('soleil', 1, 'nature'),
        ('lune', 1, 'nature'),
        ('ordinateur', 2, 'technologie'),
        ('téléphone', 2, 'technologie')
      `);
    }
    
    const result = await db.queryObject(
      "SELECT word, difficulty, category FROM words ORDER BY RANDOM() LIMIT 1"
    );
    
    ctx.response.body = result.rows[0];
    
  } catch (error) {
    console.error("Erreur récupération mot:", error);
    // Fallback en cas d'erreur
    const words = [
      { word: "chat", difficulty: 1, category: "animaux" },
      { word: "maison", difficulty: 1, category: "objets" },
      { word: "voiture", difficulty: 2, category: "objets" }
    ];
    ctx.response.body = words[Math.floor(Math.random() * words.length)];
  }
});

// Fonction pour récupérer l'ID utilisateur à partir du username
async function getUserIdByUsername(username: string): Promise<number | null> {
    try {
        // ✅ UTILISER la connexion DB existante au lieu d'en créer une nouvelle
        // if (!db.connected) await db.connect(); // SUPPRIMER CETTE LIGNE
        
        console.log(`🔍 Recherche de l'utilisateur: ${username}`);
        
        const result = await db.queryObject(
            "SELECT id FROM users WHERE username = $1",
            [username]
        );
        
        if (result.rows.length > 0) {
            console.log(`✅ Utilisateur trouvé: ${username} (ID: ${result.rows[0].id})`);
            return result.rows[0].id;
        }
        
        console.log(`❌ Utilisateur non trouvé: ${username}`);
        return null;
    } catch (error) {
        console.error(`❌ Erreur récupération ID pour ${username}:`, error);
        return null;
    }
}


// Middleware simple pour vérifier les droits admin
async function verifyAdminMiddleware(username: string): Promise<boolean> {
    try {
        if (!db.connected) await db.connect();
        
        const userResult = await db.queryObject(
            "SELECT isadmin FROM users WHERE username = $1",
            [username]
        );
        
        return userResult.rows.length > 0 && userResult.rows[0].isadmin === true;
    } catch (error) {
        console.error("Erreur vérification admin:", error);
        return false;
    }
}
// Stats admin
router.get("/api/admin/stats", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        if (!db.connected) await db.connect();
        
        // Total utilisateurs
        const totalUsersResult = await db.queryObject("SELECT COUNT(*) as count FROM users");
        const totalUsers = Number(totalUsersResult.rows[0].count);
        
        // Total parties
        const totalGamesResult = await db.queryObject("SELECT COUNT(*) as count FROM games");
        const totalGames = Number(totalGamesResult.rows[0].count);
        
        // Parties aujourd'hui
        const gamesTodayResult = await db.queryObject(`
            SELECT COUNT(*) as count 
            FROM games 
            WHERE DATE(created_at) = CURRENT_DATE
        `);
        const gamesToday = Number(gamesTodayResult.rows[0].count);
        
        // Stats en temps réel du jeu actuel
        const activeGames = gameRoom.gameState !== 'waiting' ? 1 : 0;
        const activePlayers = gameRoom.players.size;
        
        const stats = {
            activeGames,
            activePlayers,
            totalUsers,
            gamesToday,
            totalGames,
            averageGameDuration: 8 // Exemple statique pour l'instant
        };
        
        ctx.response.body = { success: true, stats };
        
    } catch (error) {
        console.error("Erreur stats admin:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur serveur" };
    }
});

// Parties actives
router.get("/api/admin/active-games", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        const activeGames = [];
        
        // S'il y a une partie active
        if (gameRoom.players.size > 0) {
            const players = Array.from(gameRoom.players.values());
            const creator = gameRoom.gameCreator ? gameRoom.players.get(gameRoom.gameCreator) : null;
            
            activeGames.push({
                id: 1, // ID temporaire
                players: players.map(p => p.username),
                status: gameRoom.gameState,
                currentRound: gameRoom.currentRound,
                totalRounds: gameRoom.totalRounds,
                creator: creator?.username || 'Inconnu',
                startTime: new Date() // Approximation
            });
        }
        
        ctx.response.body = { success: true, games: activeGames };
        
    } catch (error) {
        console.error("Erreur parties actives:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur serveur" };
    }
});

// Joueurs actifs
router.get("/api/admin/active-players", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        const activePlayers = [];
        
        // Récupérer tous les joueurs connectés
        connectedClients.forEach((player, socket) => {
            activePlayers.push({
                id: player.userId || 0,
                username: player.username,
                currentGame: gameRoom.players.has(player.id) ? 1 : null,
                isPlaying: player.isDrawing || gameRoom.gameState === 'playing',
                connectedTime: new Date(Date.now() - Math.random() * 600000), // Approximation
                socketId: player.id
            });
        });
        
        ctx.response.body = { success: true, players: activePlayers };
        
    } catch (error) {
        console.error("Erreur joueurs actifs:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur serveur" };
    }
});

// Terminer une partie
router.post("/api/admin/games/:gameId/end", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        const gameId = parseInt(ctx.params.gameId);
        
        // Pour l'instant, on peut seulement terminer la partie active (ID = 1)
        if (gameId === 1 && gameRoom.players.size > 0) {
            endGame();
            
            // Notifier tous les joueurs
            broadcastMessage({
                type: 'adminAction',
                action: 'gameEnded',
                message: `Partie terminée par un administrateur`,
                admin: adminUsername
            });
            
            ctx.response.body = { 
                success: true, 
                message: `Partie #${gameId} terminée par l'admin` 
            };
        } else {
            ctx.response.status = 404;
            ctx.response.body = { error: "Partie non trouvée ou déjà terminée" };
        }
        
    } catch (error) {
        console.error("Erreur terminer partie:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur serveur" };
    }
});

// Parties du jour
router.get("/api/admin/today-games", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        if (!db.connected) await db.connect();
        
        // Récupérer toutes les parties du jour
        const todayGamesResult = await db.queryObject(`
            SELECT g.id, g.created_at, g.finished_at, g.total_rounds,
                   uc.username as creator_username,
                   uw.username as winner_username,
                   (SELECT COUNT(*) FROM player_scores WHERE game_id = g.id) as player_count
            FROM games g
            LEFT JOIN users uc ON g.creator_id = uc.id
            LEFT JOIN users uw ON g.winner_id = uw.id
            WHERE DATE(g.created_at) = CURRENT_DATE
            ORDER BY g.created_at DESC
        `);
        
        const games = todayGamesResult.rows.map(game => ({
            id: Number(game.id),
            creator: game.creator_username,
            winner: game.winner_username,
            totalRounds: Number(game.total_rounds),
            playerCount: Number(game.player_count),
            createdAt: game.created_at,
            finishedAt: game.finished_at,
            duration: game.finished_at 
                ? Math.round((new Date(game.finished_at) - new Date(game.created_at)) / 60000)
                : null
        }));
        
        ctx.response.body = { success: true, games };
        
    } catch (error) {
        console.error("Erreur récupération parties du jour:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur serveur" };
    }
});

// Route API pour récupérer le journal d'activités - adaptée pour votre framework
router.get("/api/admin/activity-log", (ctx) => {
  console.log('📜 Journal d\'activités demandé');
  console.log('📊 Taille du journal:', activityLog.length);
  
  // Compter les types d'activités
  const types = {};
  activityLog.forEach(a => {
    types[a.type] = (types[a.type] || 0) + 1;
  });
  console.log('📊 Types d\'activités:', types);
  
  // Vérifier la présence de déconnexions
  const disconnections = activityLog.filter(a => a.type === 'disconnection');
  console.log('🔴 Nombre de déconnexions:', disconnections.length);
  ctx.response.headers.set("Content-Type", "application/json");
  ctx.response.body = activityLog;
});


// ==================== NOUVELLES ROUTES POUR LES STATS ====================

// Route pour récupérer les statistiques d'un utilisateur
router.get("/api/user/:id/stats", async (ctx) => {
    try {
        const userId = parseInt(ctx.params.id);
        
        if (!db.connected) await db.connect();
        
        // Récupérer les stats
        const statsResult = await db.queryObject(`
            SELECT * FROM user_stats WHERE user_id = $1
        `, [userId]);
        
        if (statsResult.rows.length === 0) {
            // Si pas de stats, retourner des valeurs par défaut
            ctx.response.body = {
                games_played: 0,
                games_won: 0,
                best_score: 0,
                avg_score: 0,
                win_rate: 0
            };
        } else {
            const stats = statsResult.rows[0];
            const winRate = stats.games_played > 0 
                ? Math.round((stats.games_won / stats.games_played) * 100) 
                : 0;
            
            // Convertir les BigInt en Number
            ctx.response.body = {
                games_played: Number(stats.games_played),
                games_won: Number(stats.games_won),
                best_score: Number(stats.best_score),
                avg_score: Number(Math.round(stats.avg_score || 0)),
                win_rate: winRate,
                total_score: Number(stats.total_score),
                words_guessed: Number(stats.words_guessed || 0),
                words_drawn: Number(stats.words_drawn || 0)
            };
        }
        
    } catch (error) {
        console.error("Erreur récupération stats:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: error.message };
    }
});

// Route pour récupérer l'historique des parties d'un utilisateur (CORRIGÉE)
router.get("/api/user/:id/history", async (ctx) => {
    try {
        const userId = parseInt(ctx.params.id);
        const limit = parseInt(ctx.request.url.searchParams.get("limit") || "5");
        
        if (!db.connected) await db.connect();
        
        // Récupérer l'historique des parties
        const historyResult = await db.queryObject(`
            SELECT 
                g.id,
                g.created_at,
                g.total_rounds,
                ps.final_score,
                ps.position,
                (SELECT COUNT(*) FROM player_scores WHERE game_id = g.id) as total_players,
                CASE 
                    WHEN g.winner_id = $1 THEN true 
                    ELSE false 
                END as is_winner
            FROM games g
            JOIN player_scores ps ON g.id = ps.game_id
            WHERE ps.user_id = $1
            ORDER BY g.created_at DESC
            LIMIT $2
        `, [userId, limit]);
        
        // Convertir les BigInt en Number et formater les dates
        const history = historyResult.rows.map(row => ({
            id: Number(row.id),
            date: row.created_at,
            score: Number(row.final_score),
            position: Number(row.position),
            totalPlayers: Number(row.total_players),
            isWinner: row.is_winner,
            rounds: Number(row.total_rounds)
        }));
        
        ctx.response.body = { history };
        
    } catch (error) {
        console.error("Erreur récupération historique:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: error.message };
    }
});

// Route pour récupérer les détails d'une partie spécifique (CORRIGÉE)
router.get("/api/game/:id", async (ctx) => {
    try {
        const gameId = parseInt(ctx.params.id);
        
        if (!db.connected) await db.connect();
        
        // Récupérer les infos de la partie
        const gameResult = await db.queryObject(`
            SELECT g.*, u.username as creator_username, w.username as winner_username
            FROM games g
            LEFT JOIN users u ON g.creator_id = u.id
            LEFT JOIN users w ON g.winner_id = w.id
            WHERE g.id = $1
        `, [gameId]);
        
        if (gameResult.rows.length === 0) {
            ctx.response.status = 404;
            ctx.response.body = { error: "Partie non trouvée" };
            return;
        }
        
        // Récupérer tous les joueurs de cette partie
        const playersResult = await db.queryObject(`
            SELECT ps.*, u.username
            FROM player_scores ps
            JOIN users u ON ps.user_id = u.id
            WHERE ps.game_id = $1
            ORDER BY ps.position
        `, [gameId]);
        
        const game = gameResult.rows[0];
        const players = playersResult.rows;

        
        
        // Convertir les BigInt en Number
        ctx.response.body = {
            id: Number(game.id),
            creator: game.creator_username,
            winner: game.winner_username,
            total_rounds: Number(game.total_rounds),
            created_at: game.created_at,
            finished_at: game.finished_at,
            players: players.map(p => ({
                username: p.username,
                score: Number(p.final_score),
                position: Number(p.position),
                words_guessed: Number(p.words_guessed || 0),
                words_drawn: Number(p.words_drawn || 0)
            }))
        };
        
    } catch (error) {
        console.error("Erreur récupération partie:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: error.message };
    }
});

// ==================== GESTION DES WEBSOCKETS ====================

// Fonction pour gérer les joueurs
async function handlePlayerJoin(socket: WebSocket, username: string, isGameCreator: boolean = false, totalRounds?: number) {
    console.log(`🔗 Tentative de connexion: "${username}" (créateur: ${isGameCreator})`);
    
    // Nettoyer d'abord toutes les connexions fermées
    cleanupClosedConnections();
    
    // Vérifier si le joueur existe déjà avec une connexion active
    let existingPlayer = null;
    let hasActiveConnection = false;
    
    // Parcourir tous les joueurs connectés
    connectedClients.forEach((player, sock) => {
        if (player.username === username) {
            if (sock.readyState === WebSocket.OPEN) {
                hasActiveConnection = true;
                existingPlayer = player;
            } else {
                // Connexion fermée, la nettoyer
                console.log(`🧹 Nettoyage connexion fermée pour ${username}`);
                connectedClients.delete(sock);
                gameRoom.players.delete(player.id);
            }
        }
    });
    
    // Si le joueur a une connexion active, refuser la nouvelle connexion
    if (hasActiveConnection && existingPlayer) {
        console.log(`⚠️ Joueur ${username} déjà connecté avec une connexion active`);
        socket.send(JSON.stringify({
            type: 'error',
            message: `Vous êtes déjà connecté dans une autre fenêtre`
        }));
        socket.close();
        return;
    }
    
    // Nettoyer tout résidu du joueur dans gameRoom.players
    const playersToRemove = Array.from(gameRoom.players.values()).filter(p => p.username === username);
    playersToRemove.forEach(player => {
        console.log(`🧹 Suppression résidu joueur ${username} (ID: ${player.id})`);
        gameRoom.players.delete(player.id);
    });
    
    // Récupérer le vrai ID utilisateur depuis la base de données
    let userId;
    try {
        userId = await getUserIdByUsername(username);
    } catch (error) {
        console.error(`❌ Erreur lors de la récupération de l'ID pour ${username}:`, error);
        userId = null;
    }
    
    // Créer le nouveau joueur
    const playerId = crypto.randomUUID();
    const player: Player = {
        id: playerId,
        username: username,
        score: 0,
        isDrawing: false,
        userId: userId
    };
    
    // Ajouter le joueur
    connectedClients.set(socket, player);
    gameRoom.players.set(playerId, player);
    
    console.log(`✅ Joueur connecté: "${username}" (Socket ID: ${playerId})`);
    
    // ✅ CORRECTION PRINCIPALE : Gestion prioritaire du créateur
    if (isGameCreator === true) {
        // Si quelqu'un arrive avec le flag créateur, il devient créateur même si pas premier
        if (gameRoom.gameCreator && gameRoom.gameCreator !== playerId) {
            // Il y a déjà un créateur, on le remplace
            const oldCreator = gameRoom.players.get(gameRoom.gameCreator);
            console.log(`👑 Remplacement du créateur: ${oldCreator?.username} → ${username}`);
        }
        gameRoom.gameCreator = playerId;
        
        // Appliquer les paramètres du créateur
        if (totalRounds && totalRounds > 0) {
            gameRoom.totalRounds = totalRounds;
        }
        console.log(`👑 ${username} est maintenant le créateur (explicite)`);
        
    } else if (!gameRoom.gameCreator) {
        // Seulement si aucun créateur n'est défini
        gameRoom.gameCreator = playerId;
        console.log(`👑 ${username} devient le créateur (premier joueur, pas d'autre créateur)`);
    } else {
        // Ce joueur rejoint une partie existante
        const creator = gameRoom.players.get(gameRoom.gameCreator);
        console.log(`👤 ${username} rejoint la partie de ${creator?.username}`);
    }
    
    // Afficher l'état actuel avec indication du créateur
    console.log(`📊 Joueurs actuels (${gameRoom.players.size}):`);
    gameRoom.players.forEach(p => {
        const dbInfo = p.userId ? `DB ID: ${p.userId}` : 'Temporaire';
        const isCreator = p.id === gameRoom.gameCreator ? ' 👑 CRÉATEUR' : '';
        console.log(`  - ${p.username}${isCreator} (${dbInfo})`);
    });
    
    // Envoyer l'état complet à tous les joueurs
    const gameState = {
        type: 'gameState',
        players: Array.from(gameRoom.players.values()),
        currentWord: null,
        currentDrawer: gameRoom.currentDrawer,
        gameState: gameRoom.gameState,
        timeLeft: gameRoom.timeLeft,
        totalRounds: gameRoom.totalRounds,
        currentRound: gameRoom.currentRound,
        creator: gameRoom.players.get(gameRoom.gameCreator)?.username // ✅ AJOUT: Nom du créateur
    };
    
    // Envoyer à tous les clients connectés
    broadcastMessage(gameState);
    
    // Notifier que le joueur a rejoint
    broadcastMessage({
        type: 'playerJoined',
        player: player
    });
    
    // Démarrer le jeu si assez de joueurs
    checkAndStartGame();
}


// Fonction pour nettoyer les connexions fermées
function cleanupClosedConnections() {
    const toRemove: { socket: WebSocket, player: Player }[] = [];
    
    // Identifier toutes les connexions fermées
    connectedClients.forEach((player, socket) => {
        if (socket.readyState !== WebSocket.OPEN) {
            toRemove.push({ socket, player });
        }
    });
    
    // Supprimer les connexions fermées
    toRemove.forEach(({ socket, player }) => {
        console.log(`🧹 Nettoyage connexion fermée: ${player.username}`);
        connectedClients.delete(socket);
        gameRoom.players.delete(player.id);
    });
    
    // Si le créateur a été supprimé, choisir un nouveau créateur
    if (gameRoom.gameCreator && !gameRoom.players.has(gameRoom.gameCreator)) {
        const remainingPlayers = Array.from(gameRoom.players.keys());
        if (remainingPlayers.length > 0) {
            gameRoom.gameCreator = remainingPlayers[0];
            const newCreator = gameRoom.players.get(gameRoom.gameCreator);
            console.log(`👑 Nouveau créateur: ${newCreator?.username}`);
        } else {
            gameRoom.gameCreator = null;
        }
    }
}

function handlePlayerLeave(socket: WebSocket) {
    const player = connectedClients.get(socket);
    if (!player) return;
    
    console.log(`👋 ${player.username} quitte la partie`);
    
    connectedClients.delete(socket);
    gameRoom.players.delete(player.id);
    
    // Si c'était le créateur, choisir un nouveau créateur
    if (gameRoom.gameCreator === player.id) {
        const remainingPlayers = Array.from(gameRoom.players.keys());
        if (remainingPlayers.length > 0) {
            gameRoom.gameCreator = remainingPlayers[0];
            const newCreator = gameRoom.players.get(gameRoom.gameCreator);
            console.log(`👑 Nouveau créateur: ${newCreator?.username}`);
        } else {
            gameRoom.gameCreator = null;
        }
    }
    
    // Notifier les autres joueurs
    broadcastMessage({ 
        type: 'playerLeft', 
        playerId: player.id,
        username: player.username 
    });
    
    // Mettre à jour la liste des joueurs pour tous
    broadcastMessage({
        type: 'gameState',
        players: Array.from(gameRoom.players.values()),
        currentWord: null,
        currentDrawer: gameRoom.currentDrawer,
        gameState: gameRoom.gameState,
        timeLeft: gameRoom.timeLeft,
        totalRounds: gameRoom.totalRounds,
        currentRound: gameRoom.currentRound
    });
    
    // Si le joueur qui part était en train de dessiner, terminer le round
    if (player.isDrawing) {
        endRound();
    }
    
    // Si pas assez de joueurs, arrêter le jeu
    if (gameRoom.players.size < 2 && gameRoom.gameState === 'playing') {
        gameRoom.gameState = 'waiting';
        broadcastMessage({ 
            type: 'waitingForPlayers',
            message: 'En attente de plus de joueurs...' 
        });
    }
}

function handleChatMessage(socket: WebSocket, content: string) {
  const player = connectedClients.get(socket);
  if (!player) return;
  
  broadcastMessage({
    type: 'chat',
    sender: player.username,
    content: content
  });
}

function handleDrawData(socket: WebSocket, drawData: any) {
  const player = connectedClients.get(socket);
  if (!player || !player.isDrawing) return;
  
  broadcastMessage({ type: 'draw', drawData: drawData }, socket);
}

function handleGuess(socket: WebSocket, guess: string) {
  const player = connectedClients.get(socket);
  if (!player || !gameRoom.currentWord || player.isDrawing) return;
  
  if (guess.toLowerCase() === gameRoom.currentWord.toLowerCase()) {
    player.score += 100;
    
    broadcastMessage({
      type: 'correctGuess',
      winner: player.username,
      word: gameRoom.currentWord,
      scores: Array.from(gameRoom.players.values())
    });
    
    endRound();
  }
}

function handleRestartGame(socket: WebSocket) {
  const player = connectedClients.get(socket);
  if (!player) return;
  
  console.log(`Redémarrage demandé par ${player.username}`);
  
  // Réinitialiser le jeu
  gameRoom.players.forEach(p => {
    p.score = 0;
    p.isDrawing = false;
  });
  
  gameRoom.currentRound = 0;
  gameRoom.gameState = 'waiting';
  
  broadcastMessage({
    type: 'gameRestarting',
    message: 'La partie redémarre...',
    players: Array.from(gameRoom.players.values()),
    closeGameOver: true
  });
  
  setTimeout(() => checkAndStartGame(), 2000);
}

// ==================== LOGIQUE DU JEU ====================

function broadcastMessage(message: any, excludeSocket?: WebSocket) {
    const messageStr = JSON.stringify(message);
    let sentCount = 0;
    
    connectedClients.forEach((player, socket) => {
        if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(messageStr);
                sentCount++;
            } catch (error) {
                console.error(`❌ Erreur envoi message à ${player.username}:`, error);
            }
        }
    });
    
    console.log(`📤 Message envoyé à ${sentCount} joueurs: ${message.type}`);
}

async function startNewRound() {
  if (gameRoom.players.size < 2) {
    gameRoom.gameState = 'waiting';
    gameRoom.currentWord = null;
    gameRoom.currentDrawer = null;
    broadcastMessage({ type: 'waitingForPlayers' });
    return;
  }
  
  if (gameRoom.currentRound > gameRoom.totalRounds) {
    endGame();
    return;
  }
  
  const players = Array.from(gameRoom.players.values());
  
  // Trouver le prochain dessinateur
  let currentIndex = -1;
  if (gameRoom.currentDrawer) {
    currentIndex = players.findIndex(p => p.id === gameRoom.currentDrawer);
  }
  
  const nextIndex = (currentIndex + 1) % players.length;
  const drawer = players[nextIndex];
  
  // CORRECTION: Réinitialiser TOUS les joueurs d'abord
  players.forEach(p => {
    p.isDrawing = false;
  });
  
  // Puis définir le nouveau dessinateur
  drawer.isDrawing = true;
  
  try {
    // Obtenir un mot aléatoire
    const response = await fetch(`http://localhost:${PORT}/api/random-word`);
    const wordData = await response.json();
    
    gameRoom.currentWord = wordData.word;
    gameRoom.currentDrawer = drawer.id;
    gameRoom.gameState = 'playing';
    gameRoom.timeLeft = 60;
    
    console.log(`🎨 ${drawer.username} dessine le mot: ${gameRoom.currentWord}`);
    
    const isLastPlayer = gameRoom.currentRound === gameRoom.totalRounds && 
                        nextIndex === players.length - 1;
    
    // CORRECTION: Envoyer les données mises à jour à tous les clients
    connectedClients.forEach((player, socket) => {
      const isDrawer = player.id === drawer.id;
      socket.send(JSON.stringify({
        type: 'newRound',
        role: isDrawer ? 'drawer' : 'guesser',
        word: isDrawer ? gameRoom.currentWord : undefined,
        wordHint: isDrawer ? undefined : gameRoom.currentWord.replace(/[^ ]/g, '_'),
        timeLeft: gameRoom.timeLeft,
        drawer: drawer.username,
        drawerId: drawer.id, // NOUVEAU: Ajouter l'ID du dessinateur
        currentRound: gameRoom.currentRound,
        totalRounds: gameRoom.totalRounds,
        isLastPlayer,
        players: Array.from(gameRoom.players.values()) // IMPORTANT: Joueurs avec isDrawing mis à jour
      }));
    });
    
    startRoundTimer();
  } catch (error) {
    console.error('Erreur démarrage round:', error);
  }
}

function startRoundTimer() {
  if (gameRoom.timerInterval) {
    clearInterval(gameRoom.timerInterval);
  }
  
  gameRoom.timerInterval = setInterval(() => {
    gameRoom.timeLeft--;
    
    if (gameRoom.timeLeft <= 0) {
      endRound();
    } else {
      broadcastMessage({ type: 'timeUpdate', timeLeft: gameRoom.timeLeft });
    }
  }, 1000);
}

function endRound() {
  if (gameRoom.timerInterval) {
    clearInterval(gameRoom.timerInterval);
  }
  
  gameRoom.gameState = 'roundEnd';
  
  const players = Array.from(gameRoom.players.values());
  const currentIndex = players.findIndex(p => p.id === gameRoom.currentDrawer);
  const isLastPlayerOfRound = currentIndex === players.length - 1;
  const isLastRound = gameRoom.currentRound >= gameRoom.totalRounds;
  
  broadcastMessage({
    type: 'roundEnd',
    word: gameRoom.currentWord,
    scores: Array.from(gameRoom.players.values()),
    isGameOver: isLastPlayerOfRound && isLastRound,
    isLastPlayerOfRound: isLastPlayerOfRound
  });
  
  setTimeout(() => {
    if (gameRoom.players.size < 2) {
      gameRoom.gameState = 'waiting';
      gameRoom.currentWord = null;
      gameRoom.currentDrawer = null;
      broadcastMessage({ type: 'waitingForPlayers' });
      return;
    }
    
    if (isLastPlayerOfRound && isLastRound) {
      endGame();
    } else if (isLastPlayerOfRound) {
      gameRoom.currentRound++;
      startNewRound();
    } else {
      startNewRound();
    }
  }, 5000);
}

function endGame() {
    if (gameRoom.timerInterval) {
        clearInterval(gameRoom.timerInterval);
    }
    
    // Sauvegarder la partie avant de la terminer
    saveGameResult(gameRoom);
    
    gameRoom.gameState = 'waiting';
    gameRoom.currentWord = null;
    gameRoom.currentDrawer = null;
    
    // Envoyer les scores finaux
    broadcastMessage({
        type: 'gameOver',
        finalScores: Array.from(gameRoom.players.values())
    });
    
    // Réinitialiser pour une nouvelle partie
    setTimeout(() => {
        gameRoom.currentRound = 0;
        // Pas besoin de réinitialiser complètement, 
        // les joueurs peuvent rester pour une nouvelle partie
    }, 2000);
}

function checkAndStartGame() {
    console.log(`🔍 Vérification démarrage: ${gameRoom.players.size} joueurs, état: ${gameRoom.gameState}`);
    
    if (gameRoom.players.size >= 2 && gameRoom.gameState === 'waiting') {
        console.log("🚀 Démarrage du jeu...");
        gameRoom.currentRound = 1;
        
        // Notifier tous les joueurs que le jeu commence
        broadcastMessage({
            type: 'gameStarting',
            message: 'Le jeu commence dans 3 secondes...',
            players: Array.from(gameRoom.players.values())
        });
        
        // Démarrer après 3 secondes
        setTimeout(() => {
            console.log("▶️ Premier round");
            startNewRound();
        }, 3000);
    } else if (gameRoom.players.size < 2) {
        console.log("⏳ En attente de joueurs...");
        broadcastMessage({
            type: 'waitingForPlayers',
            message: 'En attente de plus de joueurs...'
        });
    }
}

// ==================== GESTIONNAIRE WEBSOCKET ====================

async function handleWS(req: Request) {
    if (req.headers.get("upgrade") !== "websocket") {
        return new Response("WebSocket required", { status: 400 });
    }
    
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    socket.onopen = () => {
        console.log("Nouvelle connexion WebSocket");
    };
    
    socket.onmessage = async (e) => {
        try {
            const message = JSON.parse(e.data);
            console.log(`📨 Message reçu: ${message.type} de ${message.username || 'inconnu'}`);
            
            switch(message.type) {
                case 'join':
                    await handlePlayerJoin(socket, message.username, message.isGameCreator || false, message.totalRounds);
                    break;
                case 'chat':
                    handleChatMessage(socket, message.content);
                    break;
                case 'draw':
                    handleDrawData(socket, message.drawData);
                    break;
                case 'guess':
                    handleGuess(socket, message.guess);
                    break;
                case 'clearCanvas':
                    broadcastMessage({ type: 'clearCanvas' }, socket);
                    break;
                case 'restartGame':
                    handleRestartGame(socket);
                    break;
                case 'adminConnect':
                    console.log(`🛡️ Admin connecté: ${message.username}`);
                    socket.send(JSON.stringify({
                        type: 'adminConnected',
                        message: 'Connexion admin réussie'
                    }));
                    break;
                case 'kickPlayer':
                    console.log(`👢 Admin kick: ${message.username}`);
                    // Trouver et déconnecter le joueur
                    connectedClients.forEach((player, sock) => {
                        if (player.id === message.socketId) {
                            sock.close();
                            handlePlayerLeave(sock);
                        }
                    });
                    break;
                case 'kickAllPlayers':
                    console.log(`👢 Admin kick ALL players`);
                    connectedClients.forEach((player, sock) => {
                        if (sock !== socket) { // Ne pas déconnecter l'admin
                            sock.close();
                        }
                    });
                    break;
                case 'endAllGames':
                    console.log(`🛑 Admin end ALL games`);
                    if (gameRoom.players.size > 0) {
                        endGame();
                        broadcastMessage({
                            type: 'adminAction',
                            message: 'Toutes les parties ont été terminées par un administrateur'
                        });
                    }
                    break;
                default:
                    console.log(`❓ Type de message non géré: ${message.type}`);
            }
        } catch (err) {
            console.error("❌ Erreur traitement message:", err);
            // Envoyer une erreur au client
            socket.send(JSON.stringify({
                type: 'error',
                message: 'Erreur de traitement du message'
            }));
        }
    };
    
    socket.onclose = (event) => {
        console.log(`🔌 Connexion fermée (code: ${event.code})`);
        if (socket.username) {
            logDisconnection(socket.username);
        }
        handlePlayerLeave(socket);
    };
    
    socket.onerror = (error) => {
        console.error("❌ Erreur WebSocket:", error);
        handlePlayerLeave(socket);
    };
    
    return response;
}

// ==================== MIDDLEWARE ET CONFIGURATION ====================

// Middleware pour routes non trouvées
function notFoundHandler(ctx) {
  ctx.response.status = Status.NotFound;
  ctx.response.body = { error: "Route non trouvée" };
}

// Configuration du serveur
app.use(router.routes());
app.use(router.allowedMethods());
app.use(notFoundHandler);

// ==================== DÉMARRAGE DES SERVEURS ====================

app.addEventListener("listen", () => {
  console.log(`✅ Serveur HTTP démarré sur http://localhost:${PORT}`);
});

console.log(`🔗 Serveur WebSocket démarré sur ws://localhost:${WS_PORT}`);
serve(handleWS, { port: WS_PORT });

await app.listen({ port: PORT });

// ==================== FONCTIONS POUR SAUVEGARDER LES PARTIES ====================

// Fonction pour sauvegarder une partie
async function saveGameResult(gameRoom: GameRoom) {
    try {
        if (!db.connected) await db.connect();
        
        console.log("💾 Sauvegarde de la partie...");
        
        // Récupérer l'ID utilisateur du créateur
        let creatorUserId = null;
        if (gameRoom.gameCreator) {
            const creator = gameRoom.players.get(gameRoom.gameCreator);
            if (creator && creator.userId) {
                creatorUserId = creator.userId;
            }
        }
        
        // 1. Créer l'entrée de la partie
        const gameResult = await db.queryObject(`
            INSERT INTO games (creator_id, total_rounds, finished_at)
            VALUES ($1, $2, NOW())
            RETURNING id
        `, [
            creatorUserId,
            gameRoom.totalRounds
        ]);
        
        const gameId = gameResult.rows[0].id;
        console.log(`✅ Partie créée avec ID: ${gameId}`);
        
        // 2. Trier les joueurs par score
        const players = Array.from(gameRoom.players.values());
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        
        // 3. Déterminer le gagnant
        const winner = sortedPlayers[0];
        if (winner.userId) {
            await db.queryObject(`
                UPDATE games SET winner_id = $1 WHERE id = $2
            `, [winner.userId, gameId]);
        }
        
        // 4. Sauvegarder les scores de chaque joueur
        for (let i = 0; i < sortedPlayers.length; i++) {
            const player = sortedPlayers[i];
            const position = i + 1;
            
            if (player.userId) {
                await db.queryObject(`
                    INSERT INTO player_scores (game_id, user_id, final_score, position)
                    VALUES ($1, $2, $3, $4)
                `, [
                    gameId,
                    player.userId,
                    player.score,
                    position
                ]);
                
                console.log(`✅ Score sauvé: ${player.username} - ${player.score} pts (${position}e)`);
            }
        }
        
        // 5. Mettre à jour les statistiques des joueurs
        await updateUserStats(sortedPlayers);
        
        console.log("🎉 Partie sauvegardée avec succès !");
        
    } catch (error) {
        console.error("❌ Erreur lors de la sauvegarde:", error);
    }
}

// Fonction pour mettre à jour les statistiques utilisateur
async function updateUserStats(sortedPlayers: Player[]) {
    for (const player of sortedPlayers) {
        if (!player.userId) continue;
        
        try {
            const userId = player.userId;
            const isWinner = sortedPlayers[0].userId === player.userId;
            
            // Récupérer les stats actuelles
            const currentStats = await db.queryObject(`
                SELECT * FROM user_stats WHERE user_id = $1
            `, [userId]);
            
            if (currentStats.rows.length === 0) {
                // ✅ CORRECTION: Forcer tous les types pour éviter l'erreur PostgreSQL
                await db.queryObject(`
                    INSERT INTO user_stats (
                        user_id, games_played, games_won, total_score, 
                        best_score, avg_score, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                `, [
                    userId,                             // $1 - integer
                    1,                                 // $2 - integer (games_played)  
                    isWinner ? 1 : 0,                 // $3 - integer (games_won)
                    player.score,                     // $4 - integer (total_score)
                    player.score,                     // $5 - integer (best_score)
                    parseFloat(player.score.toFixed(2)) // $6 - ✅ CORRECTION: Convertir en float
                ]);
                
                console.log(`✅ Nouvelles stats créées pour ${player.username}`);
            } else {
                // Mettre à jour les stats existantes
                const stats = currentStats.rows[0];
                const newGamesPlayed = Number(stats.games_played) + 1;
                const newGamesWon = Number(stats.games_won) + (isWinner ? 1 : 0);
                const newTotalScore = Number(stats.total_score) + player.score;
                const newBestScore = Math.max(Number(stats.best_score), player.score);
                
                // ✅ CORRECTION: Calculer la moyenne et la convertir en float
                const newAvgScore = parseFloat((newTotalScore / newGamesPlayed).toFixed(2));
                
                await db.queryObject(`
                    UPDATE user_stats SET
                        games_played = $1,
                        games_won = $2,
                        total_score = $3,
                        best_score = $4,
                        avg_score = $5,
                        updated_at = NOW()
                    WHERE user_id = $6
                `, [
                    newGamesPlayed,     // $1 - integer
                    newGamesWon,        // $2 - integer  
                    newTotalScore,      // $3 - integer
                    newBestScore,       // $4 - integer
                    newAvgScore,        // $5 - ✅ CORRECTION: float au lieu de ::decimal
                    userId              // $6 - integer
                ]);
                
                console.log(`✅ Stats mises à jour pour ${player.username}`);
            }
            
        } catch (error) {
            console.error(`❌ Erreur mise à jour stats pour ${player.username}:`, error);
        }
    }
}

console.log('📋 Routes enregistrées:');
router.routes().forEach((route, i) => {
  console.log(`Route ${i + 1}: ${route.method} ${route.path}`);
});