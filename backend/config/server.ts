import { Application, Router, oakCors, dotenvConfig, Status } from "../deps.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { hashPassword, verifyPassword } from "../utils/passwordUtils.ts";

// Configuration
const env = await dotenvConfig({ export: true });

const PORT = parseInt(env.PORT || "3000");
const WS_PORT = parseInt(env.WS_PORT || "3001");
const FRONTEND_URL = env.FRONTEND_URL || "http://localhost:8080";
const HTTPS_PORT = parseInt(env.HTTPS_PORT || "3443");
const USE_HTTPS = true;

let tlsOptions = null;

if (USE_HTTPS) {
    try {
        const certPath = "/home/julien/Bureau/IG3/Projet_Web/certs/cert.pem";
        const keyPath = "/home/julien/Bureau/IG3/Projet_Web/certs/key.pem";

        tlsOptions = {
            cert: await Deno.readTextFile(certPath),
            key: await Deno.readTextFile(keyPath),
        };

        console.log("🔒 Certificats HTTPS chargés");
    } catch (error) {
        console.error("❌ Erreur chargement certificats HTTPS:", error);
        console.log("💡 Créez les certificats avec :");
        console.log("   mkdir ../certs && cd ../certs");
        console.log("   openssl req -x509 -newkey rsa:2048 -nodes -sha256 -subj '/CN=localhost' -keyout key.pem -out cert.pem -days 365");
        tlsOptions = null;
    }
}

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

// Types
interface Player {
    id: string;
    username: string;
    score: number;
    isDrawing: boolean;
    userId?: number;
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

// Connexion base de données
try {
    await db.connect();
    console.log("✅ Base de données connectée");
} catch (error) {
    console.error("❌ Erreur connexion DB:", error);
}

// Variables globales
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
let activityLog: any[] = [];
const MAX_LOG_ENTRIES = 50;

// Configuration Express
const app = new Application();
const router = new Router();

app.use(oakCors({
    origin: [
        FRONTEND_URL,
        "https://localhost:8443"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Admin-Username"],
    credentials: true
}));

// Routes d'authentification
router.post("/api/register", async (ctx) => {
    try {
        const { username, password } = await ctx.request.body.json();
        
        if (!username || !password) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Nom d'utilisateur et mot de passe requis" };
            return;
        }
        
        if (!db.connected) await db.connect();
        
        await db.queryObject(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                password VARCHAR(100) NOT NULL,
                isadmin BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        const userExists = await db.queryObject(
            "SELECT * FROM users WHERE username = $1", [username]
        );
        
        if (userExists.rows.length > 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Ce nom d'utilisateur est déjà utilisé" };
            return;
        }
        
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

router.post("/api/login", async (ctx) => {
    try {
        const { username, password } = await ctx.request.body.json();
        
        if (!username || !password) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Nom d'utilisateur et mot de passe requis" };
            return;
        }
        
        if (!db.connected) await db.connect();
        
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
        const isPasswordValid = await verifyPassword(password, user.password);
        
        if (!isPasswordValid) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Nom d'utilisateur ou mot de passe incorrect" };
            return;
        }

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

router.post("/api/logout", async (ctx) => {
    try {
        const body = await ctx.request.body.json();
        const { username } = body;
        
        if (username) {
            logDisconnection(username);
        }
        
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

// Journal d'activités
function logConnection(username: string) {
    const activity = {
        message: `${username} s'est connecté`,
        type: "connection",
        timestamp: new Date()
    };
    
    activityLog.unshift(activity);
    
    if (activityLog.length > MAX_LOG_ENTRIES) {
        activityLog.pop();
    }
}

function logDisconnection(username: string) {
    const activity = {
        message: `${username} s'est déconnecté`,
        type: "disconnection",
        timestamp: new Date().toISOString()
    };
    
    activityLog.unshift(activity);
    
    if (activityLog.length > MAX_LOG_ENTRIES) {
        activityLog.pop();
    }
}

// Routes du jeu
router.get("/api/random-word", async (ctx) => {
    try {
        if (!db.connected) await db.connect();
        
        await db.queryObject(`
            CREATE TABLE IF NOT EXISTS words (
                id SERIAL PRIMARY KEY,
                word VARCHAR(50) NOT NULL,
                difficulty INTEGER DEFAULT 1,
                category VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
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
        const words = [
            { word: "chat", difficulty: 1, category: "animaux" },
            { word: "maison", difficulty: 1, category: "objets" },
            { word: "voiture", difficulty: 2, category: "objets" }
        ];
        ctx.response.body = words[Math.floor(Math.random() * words.length)];
    }
});

async function getUserIdByUsername(username: string): Promise<number | null> {
    try {
        const result = await db.queryObject(
            "SELECT id FROM users WHERE username = $1",
            [username]
        );
        
        return result.rows.length > 0 ? result.rows[0].id : null;
    } catch (error) {
        console.error(`❌ Erreur récupération ID pour ${username}:`, error);
        return null;
    }
}

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

// Routes admin
router.get("/api/admin/stats", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        if (!db.connected) await db.connect();
        
        const totalUsersResult = await db.queryObject("SELECT COUNT(*) as count FROM users");
        const totalUsers = Number(totalUsersResult.rows[0].count);
        
        const totalGamesResult = await db.queryObject("SELECT COUNT(*) as count FROM games");
        const totalGames = Number(totalGamesResult.rows[0].count);
        
        const gamesTodayResult = await db.queryObject(`
            SELECT COUNT(*) as count 
            FROM games 
            WHERE DATE(created_at) = CURRENT_DATE
        `);
        const gamesToday = Number(gamesTodayResult.rows[0].count);
        
        const activeGames = gameRoom.gameState !== 'waiting' ? 1 : 0;
        const activePlayers = gameRoom.players.size;
        
        const stats = {
            activeGames,
            activePlayers,
            totalUsers,
            gamesToday,
            totalGames,
            averageGameDuration: 8
        };
        
        ctx.response.body = { success: true, stats };
        
    } catch (error) {
        console.error("Erreur stats admin:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur serveur" };
    }
});

router.get("/api/admin/active-games", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        const activeGames = [];
        
        if (gameRoom.players.size > 0) {
            const players = Array.from(gameRoom.players.values());
            const creator = gameRoom.gameCreator ? gameRoom.players.get(gameRoom.gameCreator) : null;
            
            activeGames.push({
                id: 1,
                players: players.map(p => p.username),
                status: gameRoom.gameState,
                currentRound: gameRoom.currentRound,
                totalRounds: gameRoom.totalRounds,
                creator: creator?.username || 'Inconnu',
                startTime: new Date()
            });
        }
        
        ctx.response.body = { success: true, games: activeGames };
        
    } catch (error) {
        console.error("Erreur parties actives:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur serveur" };
    }
});

router.get("/api/admin/active-players", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        const activePlayers: any[] = [];
        
        connectedClients.forEach((player, socket) => {
            activePlayers.push({
                id: player.userId || 0,
                username: player.username,
                currentGame: gameRoom.players.has(player.id) ? 1 : null,
                isPlaying: player.isDrawing || gameRoom.gameState === 'playing',
                connectedTime: new Date(Date.now() - Math.random() * 600000),
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

router.post("/api/admin/games/:gameId/end", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        const gameId = parseInt(ctx.params.gameId);
        
        if (gameId === 1 && gameRoom.players.size > 0) {
            endGame();
            
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

router.get("/api/admin/today-games", async (ctx) => {
    try {
        const adminUsername = ctx.request.headers.get('X-Admin-Username');
        
        if (!adminUsername || !(await verifyAdminMiddleware(adminUsername))) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Droits administrateur requis" };
            return;
        }
        
        if (!db.connected) await db.connect();
        
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

router.get("/api/admin/activity-log", (ctx) => {
    ctx.response.headers.set("Content-Type", "application/json");
    ctx.response.body = activityLog;
});

// Routes utilisateur
router.get("/api/user/:id/stats", async (ctx) => {
    try {
        const userId = parseInt(ctx.params.id);
        
        if (!db.connected) await db.connect();
        
        const statsResult = await db.queryObject(`
            SELECT * FROM user_stats WHERE user_id = $1
        `, [userId]);
        
        if (statsResult.rows.length === 0) {
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

router.get("/api/user/:id/history", async (ctx) => {
    try {
        const userId = parseInt(ctx.params.id);
        const limit = parseInt(ctx.request.url.searchParams.get("limit") || "5");
        
        if (!db.connected) await db.connect();
        
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

router.get("/api/game/:id", async (ctx) => {
    try {
        const gameId = parseInt(ctx.params.id);
        
        if (!db.connected) await db.connect();
        
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
        
        const playersResult = await db.queryObject(`
            SELECT ps.*, u.username
            FROM player_scores ps
            JOIN users u ON ps.user_id = u.id
            WHERE ps.game_id = $1
            ORDER BY ps.position
        `, [gameId]);
        
        const game = gameResult.rows[0];
        const players = playersResult.rows;
        
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

// Gestion WebSocket
async function handlePlayerJoin(socket: WebSocket, username: string, isGameCreator: boolean = false, totalRounds?: number) {
    cleanupClosedConnections();
    
    let existingPlayer = null;
    let hasActiveConnection = false;
    
    connectedClients.forEach((player, sock) => {
        if (player.username === username) {
            if (sock.readyState === WebSocket.OPEN) {
                hasActiveConnection = true;
                existingPlayer = player;
            } else {
                connectedClients.delete(sock);
                gameRoom.players.delete(player.id);
            }
        }
    });
    
    if (hasActiveConnection && existingPlayer) {
        socket.send(JSON.stringify({
            type: 'error',
            message: `Vous êtes déjà connecté dans une autre fenêtre`
        }));
        socket.close();
        return;
    }
    
    const playersToRemove = Array.from(gameRoom.players.values()).filter(p => p.username === username);
    playersToRemove.forEach(player => {
        gameRoom.players.delete(player.id);
    });
    
    let userId;
    try {
        userId = await getUserIdByUsername(username);
    } catch (error) {
        console.error(`❌ Erreur lors de la récupération de l'ID pour ${username}:`, error);
        userId = null;
    }
    
    const playerId = crypto.randomUUID();
    const player: Player = {
        id: playerId,
        username: username,
        score: 0,
        isDrawing: false,
        userId: userId
    };
    
    connectedClients.set(socket, player);
    gameRoom.players.set(playerId, player);
    
    if (isGameCreator === true) {
        if (gameRoom.gameCreator && gameRoom.gameCreator !== playerId) {
            const oldCreator = gameRoom.players.get(gameRoom.gameCreator);
        }
        gameRoom.gameCreator = playerId;
        
        if (totalRounds && totalRounds > 0) {
            gameRoom.totalRounds = totalRounds;
        }
    } else if (!gameRoom.gameCreator) {
        gameRoom.gameCreator = playerId;
    }
    
    const gameState = {
        type: 'gameState',
        players: Array.from(gameRoom.players.values()),
        currentWord: null,
        currentDrawer: gameRoom.currentDrawer,
        gameState: gameRoom.gameState,
        timeLeft: gameRoom.timeLeft,
        totalRounds: gameRoom.totalRounds,
        currentRound: gameRoom.currentRound,
        creator: gameRoom.players.get(gameRoom.gameCreator)?.username
    };
    
    broadcastMessage(gameState);
    broadcastMessage({
        type: 'playerJoined',
        player: player
    });
    
    checkAndStartGame();
}

function cleanupClosedConnections() {
    const toRemove: { socket: WebSocket, player: Player }[] = [];
    
    connectedClients.forEach((player, socket) => {
        if (socket.readyState !== WebSocket.OPEN) {
            toRemove.push({ socket, player });
        }
    });
    
    toRemove.forEach(({ socket, player }) => {
        connectedClients.delete(socket);
        gameRoom.players.delete(player.id);
    });
    
    if (gameRoom.gameCreator && !gameRoom.players.has(gameRoom.gameCreator)) {
        const remainingPlayers = Array.from(gameRoom.players.keys());
        if (remainingPlayers.length > 0) {
            gameRoom.gameCreator = remainingPlayers[0];
        } else {
            gameRoom.gameCreator = null;
        }
    }
}

function handlePlayerLeave(socket: WebSocket) {
    const player = connectedClients.get(socket);
    if (!player) return;
    
    connectedClients.delete(socket);
    gameRoom.players.delete(player.id);
    
    if (gameRoom.gameCreator === player.id) {
        const remainingPlayers = Array.from(gameRoom.players.keys());
        if (remainingPlayers.length > 0) {
            gameRoom.gameCreator = remainingPlayers[0];
        } else {
            gameRoom.gameCreator = null;
        }
    }
    
    broadcastMessage({ 
        type: 'playerLeft', 
        playerId: player.id,
        username: player.username 
    });
    
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
    
    if (player.isDrawing) {
        endRound();
    }
    
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

// Logique du jeu
function broadcastMessage(message: any, excludeSocket?: WebSocket) {
    const messageStr = JSON.stringify(message);
    
    connectedClients.forEach((player, socket) => {
        if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
            try {
                socket.send(messageStr);
            } catch (error) {
                console.error(`❌ Erreur envoi message à ${player.username}:`, error);
            }
        }
    });
}

// Fonction pour récupérer un mot aléatoire directement (sans HTTP)
async function getRandomWordDirect() {
    try {
        if (!db.connected) await db.connect();
        
        await db.queryObject(`
            CREATE TABLE IF NOT EXISTS words (
                id SERIAL PRIMARY KEY,
                word VARCHAR(50) NOT NULL,
                difficulty INTEGER DEFAULT 1,
                category VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
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
        
        return result.rows[0];
        
    } catch (error) {
        console.error("Erreur récupération mot:", error);
        const words = [
            { word: "chat", difficulty: 1, category: "animaux" },
            { word: "maison", difficulty: 1, category: "objets" },
            { word: "voiture", difficulty: 2, category: "objets" }
        ];
        return words[Math.floor(Math.random() * words.length)];
    }
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
    
    let currentIndex = -1;
    if (gameRoom.currentDrawer) {
        currentIndex = players.findIndex(p => p.id === gameRoom.currentDrawer);
    }
    
    const nextIndex = (currentIndex + 1) % players.length;
    const drawer = players[nextIndex];
    
    players.forEach(p => {
        p.isDrawing = false;
    });
    
    drawer.isDrawing = true;
    
    try {
        // CORRECTION: Appeler directement la fonction au lieu de faire un fetch
        const wordData = await getRandomWordDirect();
        
        gameRoom.currentWord = wordData.word;
        gameRoom.currentDrawer = drawer.id;
        gameRoom.gameState = 'playing';
        gameRoom.timeLeft = 60;
        
        const isLastPlayer = gameRoom.currentRound === gameRoom.totalRounds && 
                            nextIndex === players.length - 1;
        
        connectedClients.forEach((player, socket) => {
            const isDrawer = player.id === drawer.id;
            socket.send(JSON.stringify({
                type: 'newRound',
                role: isDrawer ? 'drawer' : 'guesser',
                word: isDrawer ? gameRoom.currentWord : undefined,
                wordHint: isDrawer ? undefined : gameRoom.currentWord.replace(/[^ ]/g, '_'),
                timeLeft: gameRoom.timeLeft,
                drawer: drawer.username,
                drawerId: drawer.id,
                currentRound: gameRoom.currentRound,
                totalRounds: gameRoom.totalRounds,
                isLastPlayer,
                players: Array.from(gameRoom.players.values())
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
    
    saveGameResult(gameRoom);
    
    gameRoom.gameState = 'waiting';
    gameRoom.currentWord = null;
    gameRoom.currentDrawer = null;
    
    broadcastMessage({
        type: 'gameOver',
        finalScores: Array.from(gameRoom.players.values())
    });
    
    setTimeout(() => {
        gameRoom.currentRound = 0;
    }, 2000);
}

function checkAndStartGame() {
    if (gameRoom.players.size >= 2 && gameRoom.gameState === 'waiting') {
        gameRoom.currentRound = 1;
        
        broadcastMessage({
            type: 'gameStarting',
            message: 'Le jeu commence dans 3 secondes...',
            players: Array.from(gameRoom.players.values())
        });
        
        setTimeout(() => {
            startNewRound();
        }, 3000);
    } else if (gameRoom.players.size < 2) {
        broadcastMessage({
            type: 'waitingForPlayers',
            message: 'En attente de plus de joueurs...'
        });
    }
}

// Gestionnaire WebSocket
async function handleWS(req: Request) {
    if (req.headers.get("upgrade") !== "websocket") {
        return new Response("WebSocket required", { status: 400 });
    }
    
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    socket.onmessage = async (e) => {
        try {
            const message = JSON.parse(e.data);
            
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
                    socket.send(JSON.stringify({
                        type: 'adminConnected',
                        message: 'Connexion admin réussie'
                    }));
                    break;
                case 'kickPlayer':
                    connectedClients.forEach((player, sock) => {
                        if (player.id === message.socketId) {
                            sock.close();
                            handlePlayerLeave(sock);
                        }
                    });
                    break;
                case 'kickAllPlayers':
                    connectedClients.forEach((player, sock) => {
                        if (sock !== socket) {
                            sock.close();
                        }
                    });
                    break;
                    
                case 'undoCanvas':
                    console.log('↩️ Commande undoCanvas reçue du dessinateur');
                    broadcastMessage({ 
                        type: 'undoCanvas', 
                        imageData: message.imageData 
                    }, socket);
                    break;
                case 'endAllGames':
                    if (gameRoom.players.size > 0) {
                        endGame();
                        broadcastMessage({
                            type: 'adminAction',
                            message: 'Toutes les parties ont été terminées par un administrateur'
                        });
                    }
                    break;
            }
        } catch (err) {
            console.error("❌ Erreur traitement message:", err);
            socket.send(JSON.stringify({
                type: 'error',
                message: 'Erreur de traitement du message'
            }));
        }
    };
    
    socket.onclose = (event) => {
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

// Configuration du serveur
function notFoundHandler(ctx: any) {
    ctx.response.status = Status.NotFound;
    ctx.response.body = { error: "Route non trouvée" };
}

app.use(router.routes());
app.use(router.allowedMethods());
app.use(notFoundHandler);

// Sauvegarde des parties
async function saveGameResult(gameRoom: GameRoom) {
    try {
        if (!db.connected) await db.connect();
        
        let creatorUserId = null;
        if (gameRoom.gameCreator) {
            const creator = gameRoom.players.get(gameRoom.gameCreator);
            if (creator && creator.userId) {
                creatorUserId = creator.userId;
            }
        }
        
        const gameResult = await db.queryObject(`
            INSERT INTO games (creator_id, total_rounds, finished_at)
            VALUES ($1, $2, NOW())
            RETURNING id
        `, [
            creatorUserId,
            gameRoom.totalRounds
        ]);
        
        const gameId = gameResult.rows[0].id;
        
        const players = Array.from(gameRoom.players.values());
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
        
        const winner = sortedPlayers[0];
        if (winner.userId) {
            await db.queryObject(`
                UPDATE games SET winner_id = $1 WHERE id = $2
            `, [winner.userId, gameId]);
        }
        
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
            }
        }
        
        await updateUserStats(sortedPlayers);
        
    } catch (error) {
        console.error("❌ Erreur lors de la sauvegarde:", error);
    }
}

async function updateUserStats(sortedPlayers: Player[]) {
    for (const player of sortedPlayers) {
        if (!player.userId) continue;
        
        try {
            const userId = player.userId;
            const isWinner = sortedPlayers[0].userId === player.userId;
            
            const currentStats = await db.queryObject(`
                SELECT * FROM user_stats WHERE user_id = $1
            `, [userId]);
            
            if (currentStats.rows.length === 0) {
                await db.queryObject(`
                    INSERT INTO user_stats (
                        user_id, games_played, games_won, total_score, 
                        best_score, avg_score, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
                `, [
                    userId,
                    1,
                    isWinner ? 1 : 0,
                    player.score,
                    player.score,
                    parseFloat(player.score.toFixed(2))
                ]);
            } else {
                const stats = currentStats.rows[0];
                const newGamesPlayed = Number(stats.games_played) + 1;
                const newGamesWon = Number(stats.games_won) + (isWinner ? 1 : 0);
                const newTotalScore = Number(stats.total_score) + player.score;
                const newBestScore = Math.max(Number(stats.best_score), player.score);
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
                    newGamesPlayed,
                    newGamesWon,
                    newTotalScore,
                    newBestScore,
                    newAvgScore,
                    userId
                ]);
            }
            
        } catch (error) {
            console.error(`❌ Erreur mise à jour stats pour ${player.username}:`, error);
        }
    }
}

// Démarrage des serveurs
console.log("🚀 Démarrage des serveurs...");

serve(handleWS, { port: WS_PORT });

if (USE_HTTPS && tlsOptions) {
    app.addEventListener("listen", () => {
        console.log(`✅ Serveur HTTPS backend démarré sur https://localhost:${HTTPS_PORT}`);
    });

    await app.listen({ 
        port: HTTPS_PORT, 
        cert: tlsOptions.cert,
        key: tlsOptions.key 
    });
} else {
    app.addEventListener("listen", () => {
        console.log(`✅ Serveur HTTP backend démarré sur http://localhost:${PORT}`);
    });

    await app.listen({ port: PORT });
}