import { Application, Router, oakCors, dotenvConfig, isHttpError, Status } from "../deps.ts";
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import { hashPassword, verifyPassword } from "../utils/passwordUtils.ts";

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
});

// Types pour le jeu
interface Player {
  id: string;
  username: string;
  score: number;
  isDrawing: boolean;
}

interface GameRoom {
  // Propriétés pour le jeu
  players: Map<string, Player>;
  currentWord: string | null;
  currentDrawer: string | null;
  gameState: 'waiting' | 'playing' | 'roundEnd';
  timeLeft: number;
  timerInterval?: number;
  // Propriétés pour les rounds
  totalRounds: number;
  currentRound: number;
  gameCreator: string | null;
}

// Variables globales pour le jeu
const gameRoom: GameRoom = {
  players: new Map(),
  currentWord: null,
  currentDrawer: null,
  gameState: 'waiting',
  timeLeft: 60,
  totalRounds: 2, // Valeur par défaut
  currentRound: 0,
  gameCreator: null
};

const connectedClients = new Map<WebSocket, Player>();

// Créer l'application Oak
const app = new Application();
const router = new Router();

// Configuration CORS optimale
app.use(oakCors({
  origin: FRONTEND_URL,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// Middleware pour gérer les erreurs
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Erreur:", err);
    ctx.response.status = err.status || 500;
    ctx.response.body = {
      error: isHttpError(err) ? err.message : "Erreur serveur",
      ...(Deno.env.get("DEV") && { details: err.stack })
    };
  }
});

// Middleware pour gérer les routes non trouvées
function notFoundHandler(ctx) {
  ctx.response.status = Status.NotFound;
  ctx.response.body = { error: "Route non trouvée." };
}

// Route de test - VERSION SANS DB
router.get("/api/test", (ctx) => {
  ctx.response.body = {
    message: "API fonctionne SANS base de données!",
    time: new Date().toISOString()
  };
});

// Route de word aléatoire
router.get("/api/random-word", async (ctx) => {
  try {
    // Se connecter à la base de données si ce n'est pas déjà fait
    if (!db.connected) {
      await db.connect();
    }

    // Exécuter la requête SQL corrigée
    const result = await db.queryObject(
      "SELECT word, difficulty, category FROM words ORDER BY RANDOM() LIMIT 1"
    );

    // Vérifier et retourner le résultat
    if (result.rows.length > 0) {
      ctx.response.body = result.rows[0];
    } else {
      // Fallback sur des données en dur si la DB est vide
      const words = [
        { word: "chat", difficulty: 1, category: "animaux" },
        { word: "maison", difficulty: 1, category: "objets" },
        { word: "voiture", difficulty: 2, category: "objets" },
        { word: "soleil", difficulty: 1, category: "nature" }
      ];
      const randomWord = words[Math.floor(Math.random() * words.length)];
      ctx.response.body = randomWord;
    }

  } catch (error) {
    console.error("Erreur DB:", error);
    // Fallback sur des données en dur en cas d'erreur
    const words = [
      { word: "chat", difficulty: 1, category: "animaux" },
      { word: "maison", difficulty: 1, category: "objets" },
      { word: "voiture", difficulty: 2, category: "objets" }
    ];
    const randomWord = words[Math.floor(Math.random() * words.length)];
    ctx.response.body = randomWord;
  }
});

// WebSocket amélioré pour le jeu multijoueur
async function handleWS(req: Request) {
  if (req.headers.get("upgrade") !== "websocket") {
    return new Response("WebSocket required", { status: 400 });
  }
  
  const { socket, response } = Deno.upgradeWebSocket(req);
  
  socket.onopen = () => {
    console.log("Nouvelle connexion WebSocket établie");
  };
  
  socket.onmessage = async (e) => {
    try {
      const message = JSON.parse(e.data);
      
      switch(message.type) {
        case 'join':
          handlePlayerJoin(
            socket, 
            message.username, 
            message.isGameCreator || false, 
            message.totalRounds
          );
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
        
        case 'gameRestarting':
          addChatMessage('Système', message.message, true);
          // Mettre à jour l'interface utilisateur pour la nouvelle partie
          clearCanvas();
          updatePlayersList(message.players);
          break;
        case 'RestartGame':
          handleRestartGame(socket);
          break;

      }
    } catch (err) {
      console.error("Erreur traitement message:", err);
    }
  };
  
  socket.onclose = () => {
    handlePlayerLeave(socket);
  };
  
  socket.onerror = (error) => {
    console.error("Erreur WebSocket:", error);
  };
  
  return response;
}

function handlePlayerLeave(socket: WebSocket) {
  const player = connectedClients.get(socket);
  if (!player) return;
  
  // Supprimer le joueur des clients connectés
  connectedClients.delete(socket);
  
  // Supprimer le joueur de la salle de jeu
  gameRoom.players.delete(player.id);
  
  // Notifier les autres joueurs
  broadcastMessage({
    type: 'playerLeft',
    playerId: player.id
  });
  
  // Si le joueur était le dessinateur, terminer le round
  if (player.isDrawing) {
    endRound();
  }
  
  console.log(`Joueur déconnecté: ${player.username}`);
}

function handlePlayerJoin(socket: WebSocket, username: string, isGameCreator: boolean = false, totalRounds?: number) {
  const playerId = crypto.randomUUID();
  const player: Player = {
    id: playerId,
    username: username,
    score: 0,
    isDrawing: false
  };
  
  connectedClients.set(socket, player);
  gameRoom.players.set(playerId, player);
  
  // Si c'est le premier joueur, il devient le créateur du jeu
  if (gameRoom.players.size === 1 || isGameCreator) {
    gameRoom.gameCreator = playerId;
    
    // Si le créateur spécifie un nombre de rounds, l'utiliser
    if (totalRounds && totalRounds > 0) {
      gameRoom.totalRounds = totalRounds;
    }
  }
  
  // Envoyer l'état actuel au nouveau joueur avec les infos de rounds
  socket.send(JSON.stringify({
    type: 'gameState',
    players: Array.from(gameRoom.players.values()),
    currentWord: player.isDrawing ? gameRoom.currentWord : null,
    currentDrawer: gameRoom.currentDrawer,
    gameState: gameRoom.gameState,
    timeLeft: gameRoom.timeLeft,
    // Nouvelles informations
    totalRounds: gameRoom.totalRounds,
    currentRound: gameRoom.currentRound
  }));
  
  // Notifier les autres joueurs
  broadcastMessage({
    type: 'playerJoined',
    player: player
  }, socket);
  
  // Démarrer le jeu si assez de joueurs
  checkAndStartGame();
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
  
  broadcastMessage({
    type: 'draw',
    drawData: drawData
  }, socket);
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
    
    // Terminer le round
    endRound();
  }
}

function broadcastMessage(message: any, excludeSocket?: WebSocket) {
  const messageStr = JSON.stringify(message);
  connectedClients.forEach((player, socket) => {
    if (socket !== excludeSocket && socket.readyState === WebSocket.OPEN) {
      socket.send(messageStr);
    }
  });
}

function endGame() {
  if (gameRoom.timerInterval) {
    clearInterval(gameRoom.timerInterval);
  }
  
  gameRoom.gameState = 'waiting';
  gameRoom.currentWord = null;
  gameRoom.currentDrawer = null;
  
  // Envoyer les scores finaux
  broadcastMessage({
    type: 'gameOver',
    finalScores: Array.from(gameRoom.players.values())
  });
  
  // Réinitialiser le jeu après un délai
  setTimeout(() => {
    gameRoom.currentRound = 0;
    
    // Si le créateur est toujours là, le jeu peut redémarrer automatiquement avec le nombre de rounds défini
    if (gameRoom.players.size >= 2 && 
        gameRoom.gameCreator && 
        gameRoom.players.has(gameRoom.gameCreator)) {
      startNewRound();
    }
  }, 10000); // 10 secondes avant de potentiellement recommencer
}

async function startNewRound() {
  // Vérifier qu'il y a au moins 2 joueurs
  if (gameRoom.players.size < 2) {
    gameRoom.gameState = 'waiting';
    gameRoom.currentWord = null;
    gameRoom.currentDrawer = null;
    broadcastMessage({
      type: 'waitingForPlayers'
    });
    return;
  }
  
  // Vérifier si nous avons atteint le nombre maximal de rounds
  if (gameRoom.currentRound > gameRoom.totalRounds) {
    // Fin du jeu
    endGame();
    return;
  }
  
  // Choisir un joueur au hasard pour dessiner
  const players = Array.from(gameRoom.players.values());
  
  // Trouver l'index du dessinateur actuel
  let currentIndex = -1;
  if (gameRoom.currentDrawer) {
    currentIndex = players.findIndex(p => p.id === gameRoom.currentDrawer);
  }
  
  // Passer au joueur suivant
  const nextIndex = (currentIndex + 1) % players.length;
  const drawer = players[nextIndex];
  
  // Réinitialiser l'état des joueurs
  players.forEach(p => p.isDrawing = false);
  drawer.isDrawing = true;
  
  // Obtenir un mot aléatoire
  try {
    const response = await fetch('http://localhost:3000/api/random-word');
    const wordData = await response.json();
    
    gameRoom.currentWord = wordData.word;
    gameRoom.currentDrawer = drawer.id;
    gameRoom.gameState = 'playing';
    gameRoom.timeLeft = 60;
    
    // Vérifier si c'est le dernier joueur du dernier round
    const isLastPlayer = gameRoom.currentRound === gameRoom.totalRounds && 
                        nextIndex === players.length - 1;
    
    // Envoyer l'état du jeu à tous les joueurs
    connectedClients.forEach((player, socket) => {
      if (player.id === drawer.id) {
        // Le dessinateur voit le mot
        socket.send(JSON.stringify({
          type: 'newRound',
          role: 'drawer',
          word: gameRoom.currentWord,
          timeLeft: gameRoom.timeLeft,
          // Informations de round
          currentRound: gameRoom.currentRound,
          totalRounds: gameRoom.totalRounds,
          isLastPlayer,
          players: Array.from(gameRoom.players.values()) // Ajouter la liste des joueurs
        }));
      } else {
        // Les autres voient des tirets
        socket.send(JSON.stringify({
          type: 'newRound',
          role: 'guesser',
          wordHint: gameRoom.currentWord.replace(/[^ ]/g, '_'),
          timeLeft: gameRoom.timeLeft,
          drawer: drawer.username,
          // Informations de round
          currentRound: gameRoom.currentRound,
          totalRounds: gameRoom.totalRounds,
          isLastPlayer,
          players: Array.from(gameRoom.players.values()) // Ajouter la liste des joueurs
        }));
      }
    });
    
    // Démarrer le timer
    startRoundTimer();
  } catch (error) {
    console.error('Erreur lors du démarrage du round:', error);
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
      broadcastMessage({
        type: 'timeUpdate',
        timeLeft: gameRoom.timeLeft
      });
    }
  }, 1000);
}

function endRound() {
  if (gameRoom.timerInterval) {
    clearInterval(gameRoom.timerInterval);
  }
  
  gameRoom.gameState = 'roundEnd';
  
  // Vérifier si tous les joueurs ont eu leur tour dans ce round
  const players = Array.from(gameRoom.players.values());
  const currentIndex = players.findIndex(p => p.id === gameRoom.currentDrawer);
  const isLastPlayerOfRound = currentIndex === players.length - 1;
  const isLastRound = gameRoom.currentRound >= gameRoom.totalRounds;
  
  // Informer les joueurs de la fin du round
  broadcastMessage({
    type: 'roundEnd',
    word: gameRoom.currentWord,
    scores: Array.from(gameRoom.players.values()),
    isGameOver: isLastPlayerOfRound && isLastRound,
    isLastPlayerOfRound: isLastPlayerOfRound
  });
  
  // Démarrer un nouveau round après 5 secondes
  setTimeout(() => {
    // S'assurer qu'il y a au moins 2 joueurs
    if (gameRoom.players.size < 2) {
      gameRoom.gameState = 'waiting';
      gameRoom.currentWord = null;
      gameRoom.currentDrawer = null;
      broadcastMessage({
        type: 'waitingForPlayers'
      });
      return;
    }
    
    if (isLastPlayerOfRound && isLastRound) {
      // Si c'est la fin du jeu, terminer le jeu
      endGame();
    } else if (isLastPlayerOfRound) {
      // Si c'est le dernier joueur du round, incrémenter le compteur de rounds
      gameRoom.currentRound++;
      startNewRound();
    } else {
      // Sinon, passer au joueur suivant dans le même round
      startNewRound();
    }
  }, 5000);
}

function checkAndStartGame() {
  if (gameRoom.players.size >= 2 && gameRoom.gameState === 'waiting') {
    // Réinitialiser le compteur de rounds au début du jeu
    gameRoom.currentRound = 1; 
    
    // Informer les joueurs que le jeu va commencer
    broadcastMessage({
      type: 'gameStarting',
      message: 'Le jeu commence dans 3 secondes...',
      players: Array.from(gameRoom.players.values())
    });
    
    setTimeout(() => {
      startNewRound();
    }, 3000);
  }
}

// Configurer le serveur
app.use(router.routes());
app.use(router.allowedMethods());
app.use(notFoundHandler);

// Démarrer les serveurs
app.addEventListener("listen", () => {
  console.log(`Serveur HTTP démarré sur http://localhost:${PORT}`);
});

// Lancer le serveur WebSocket séparément
console.log(`Démarrage du serveur WebSocket sur ws://localhost:${WS_PORT}`);
serve(handleWS, { port: WS_PORT });

// Lancer le serveur HTTP
await app.listen({ port: PORT });


// Fonction pour gérer le redémarrage du jeu
function handleRestartGame(socket: WebSocket) {
    const player = connectedClients.get(socket);
    if (!player) return;
    
    console.log(`Demande de redémarrage reçue de ${player.username}`);
    
    // Réinitialiser les scores des joueurs
    gameRoom.players.forEach(p => {
        p.score = 0;
        p.isDrawing = false;
    });
    
    // Réinitialiser le compteur de rounds
    gameRoom.currentRound = 0;
    gameRoom.gameState = 'waiting';
    
    // Informer tous les joueurs du redémarrage
    broadcastMessage({
        type: 'gameRestarting',
        message: 'La partie redémarre...',
        players: Array.from(gameRoom.players.values())
    });
    
    // Démarrer un nouveau jeu
    setTimeout(() => {
        checkAndStartGame();
    }, 2000);
}