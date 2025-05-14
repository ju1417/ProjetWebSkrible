// Variables globales
let canvas, ctx;
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentTool = 'pen';
let startX = 0;
let startY = 0;
let savedData = null;
let history = [];
const MAX_HISTORY = 50;

// Variables pour le système de jeu
let currentWord = null;
let currentDrawer = null;
let gameState = 'waiting'; // 'waiting', 'drawing', 'guessing'
let players = [
    { username: 'Vous', score: 0, isDrawing: false },
    { username: 'Bot1', score: 0, isDrawing: false },
    { username: 'Bot2', score: 0, isDrawing: false }
];
let currentPlayerIndex = 0;
let roundTime = 30; // Durée de chaque tour en secondes
let timerInterval = null;
let timeLeft = roundTime;

// Variables pour la connexion WebSocket
let ws = null;
let myUsername = '';
let isDrawer = false;

// Variable pour éviter les reconnexions multiples
let isConnecting = false;
let reconnectionTimeoutId = null;

// Ajouter aux variables globales existantes
let totalRounds = 3; // Valeur par défaut
let currentRound = 0;
let isGameCreator = false; // Pour identifier le premier joueur qui crée la partie

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initialisation de la page...');
    
    // Vérifier si l'utilisateur est connecté
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        alert('Vous devez être connecté pour jouer');
        window.location.href = 'index.html';
        return;
    }
    
    // Récupérer le nom d'utilisateur depuis localStorage
    const userData = JSON.parse(currentUser);
    myUsername = userData.username;
    console.log('👤 Joueur connecté:', myUsername);
    
    // ✅ SOLUTION : Utiliser une clé spécifique à l'utilisateur
    const storageKey = `gameSettings_${myUsername}`;
    console.log('🔍 Recherche paramètres avec clé:', storageKey);
    
    // Vérifier TOUTES les clés pour débogage
    console.log('📱 SessionStorage - Toutes les clés:', Object.keys(sessionStorage));
    
    // Récupérer les paramètres spécifiques à cet utilisateur
    const gameSettingsRaw = sessionStorage.getItem(storageKey);
    console.log('📱 SessionStorage pour', myUsername, ':', gameSettingsRaw);
    
    // Parser les paramètres
    const gameSettings = JSON.parse(gameSettingsRaw || '{}');
    console.log('🎮 Paramètres reçus:', gameSettings);
    
    // VÉRIFICATION DE SÉCURITÉ : Les paramètres appartiennent-ils au bon utilisateur ?
    if (gameSettings.username && gameSettings.username !== myUsername) {
        console.error('🚨 ERREUR: Paramètres pour', gameSettings.username, 'mais connecté comme', myUsername);
        // Utiliser des valeurs par défaut sécurisées
        isGameCreator = false;
        totalRounds = 3;
    } else {
        // Configurer selon les paramètres
        if (gameSettings.isGameCreator === true) {
            isGameCreator = true;
            totalRounds = gameSettings.totalRounds || 3;
            console.log(`👑 ${myUsername} va créer une nouvelle partie avec ${totalRounds} rounds`);
        } else {
            isGameCreator = false;
            totalRounds = 3;
            console.log(`👤 ${myUsername} va rejoindre une partie existante`);
        }
    }
    
    // ✅ Nettoyer les paramètres APRÈS utilisation (avec la bonne clé)
    sessionStorage.removeItem(storageKey);
    console.log('🧹 Paramètres nettoyés pour', myUsername);
    
    // Afficher l'état final
    console.log(`🎯 État final - ${myUsername}: créateur=${isGameCreator}, rounds=${totalRounds}`);
    
    // ... reste de l'initialisation ...
    initCanvas();
    setupEventListeners();
    connectWebSocket();
});


// Fonction de connexion WebSocket
function connectWebSocket() {
    // Éviter les connexions multiples simultanées
    if (isConnecting) {
        console.log('⚠️ Connexion déjà en cours');
        return;
    }
    
    // Si une connexion existe et est ouverte, ne pas reconnecter
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('⚠️ Connexion déjà établie');
        return;
    }
    
    // Fermer proprement l'ancienne connexion si elle existe
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        console.log('🔌 Fermeture ancienne connexion...');
        ws.onclose = null; // Empêcher la reconnexion automatique
        ws.close();
    }
    
    isConnecting = true;
    
    // Nettoyer les timeouts de reconnexion précédents
    if (reconnectionTimeoutId) {
        clearTimeout(reconnectionTimeoutId);
        reconnectionTimeoutId = null;
    }
    
    console.log('🔌 Tentative de connexion WebSocket...');
    ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
        console.log('✅ Connecté au serveur WebSocket');
        isConnecting = false;
        
        // Envoyer un message pour rejoindre le jeu
        const joinMessage = {
            type: 'join',
            username: myUsername,
            isGameCreator: isGameCreator,
            totalRounds: isGameCreator ? totalRounds : undefined
        };
        
        console.log('📤 Envoi message join:', joinMessage);
        ws.send(JSON.stringify(joinMessage));
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleServerMessage(message);
        } catch (error) {
            console.error('❌ Erreur parsing message:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('❌ Erreur WebSocket:', error);
        isConnecting = false;
    };
    
    ws.onclose = (event) => {
        console.log('🔌 Connexion WebSocket fermée', event.code, event.reason);
        isConnecting = false;
        
        // Ne reconnecter que si la fermeture n'était pas intentionnelle
        // et qu'on n'a pas d'erreur de connexion multiple
        if (event.code !== 1000 && event.code !== 1001 && event.code !== 1006) {
            console.log('🔄 Tentative de reconnexion dans 3 secondes...');
            addChatMessage('Système', 'Connexion perdue. Tentative de reconnexion...', true);
            
            reconnectionTimeoutId = setTimeout(() => {
                // Vérifier qu'on n'est pas déjà en train de se reconnecter
                if (!isConnecting && (!ws || ws.readyState === WebSocket.CLOSED)) {
                    connectWebSocket();
                }
            }, 3000);
        } else if (event.code === 1006) {
            // Code 1006 = connexion fermée de manière inattendue
            console.log('⚠️ Connexion fermée de manière inattendue');
            addChatMessage('Système', 'Connexion perdue. Veuillez recharger la page.', true);
        }
    };
}

// Gestionnaire des messages du serveur
function handleServerMessage(message) {
    console.log('📨 Message reçu du serveur:', message);
    
    switch(message.type) {
        case 'gameState':
            updateGameState(message);
            
            // ✅ NOUVEAU: Afficher qui est le créateur
            if (message.creator) {
                console.log(`👑 Créateur de la partie: ${message.creator}`);
                // Afficher un message uniquement lors de la première connexion
                if (!document.querySelector('.creator-message')) {
                    const creatorMsg = document.createElement('div');
                    creatorMsg.className = 'creator-message';
                    addChatMessage('Système', `Partie créée par ${message.creator}`, true);
                }
            }
            break;
            
        case 'playerJoined':
            console.log('👥 Nouveau joueur:', message.player);
            // Note: updateGameState gèrera la mise à jour de la liste
            break;
            
        case 'playerLeft':
            console.log('👋 Joueur parti:', message.username);
            // Note: updateGameState gèrera la mise à jour de la liste
            break;
            
        case 'chat':
            addChatMessage(message.sender, message.content);
            break;
            
        case 'draw':
            handleRemoteDrawing(message.drawData);
            break;
            
        case 'newRound':
            startNewRound(message);
            break;
            
        case 'correctGuess':
            handleCorrectGuess(message);
            break;
            
        case 'timeUpdate':
            updateTimer(message.timeLeft);
            break;
            
        case 'roundEnd':
            handleRoundEnd(message);
            break;
            
        case 'gameOver':
            showGameOver(message.finalScores);
            break;
            
        case 'gameStarting':
            addChatMessage('Système', message.message, true);
            if (message.players) {
                updatePlayersList(message.players);
            }
            break;
            
        case 'waitingForPlayers':
            addChatMessage('Système', message.message || 'En attente de joueurs...', true);
            break;
            
        case 'gameRestarting':
            addChatMessage('Système', message.message, true);
            
            // Supprimer la popup de fin de jeu si elle existe
            if (message.closeGameOver) {
                const existingGameOver = document.querySelector('.game-over-announcement');
                if (existingGameOver) {
                    existingGameOver.remove();
                }
            }
            
            // Mettre à jour l'interface utilisateur pour la nouvelle partie
            clearCanvas();
            updatePlayersList(message.players);
            break;
            
        case 'error':
            console.error('❌ Erreur du serveur:', message.message);
            
            // ✅ AMÉLIORATION: Meilleure gestion des erreurs de connexion multiple
            if (message.message.includes('déjà connecté')) {
                console.log('🔄 Connexion multiple détectée, nettoyage...');
                
                // Fermer cette connexion
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.close(1000, 'Connexion multiple');
                }
                
                // Attendre un peu avant de potentiellement reconnecter
                setTimeout(() => {
                    console.log('🔄 Tentative de reconnexion après nettoyage...');
                    if (!ws || ws.readyState === WebSocket.CLOSED) {
                        connectWebSocket();
                    }
                }, 2000);
                
                return; // Important: ne pas afficher l'alerte
            } else {
                alert(message.message);
            }
            break;
            
        default:
            console.log('❓ Type de message non géré:', message.type);
    }
}

// Initialisation du canvas
function initCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    // Adapter la taille du canvas
    resizeCanvas();
    
    // Fond blanc
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Sauvegarder l'état initial
    saveToHistory();
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
    // Canvas events
    canvas.addEventListener('mousedown', startAction);
    canvas.addEventListener('mousemove', performAction);
    canvas.addEventListener('mouseup', endAction);
    canvas.addEventListener('mouseout', endAction);
    
    // Afficher la taille du pinceau
    document.getElementById('brush-size').addEventListener('input', function(e) {
        document.getElementById('brush-size-display').textContent = e.target.value;
    });
    
    // Input message
    document.getElementById('message-input').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

// Changer d'outil
function setTool(tool) {
    currentTool = tool;
    
    // Mettre à jour l'interface
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`${tool}-tool`).classList.add('active');
    
    // Changer le curseur
    switch(tool) {
        case 'eraser':
            canvas.style.cursor = 'cell';
            break;
        case 'pen':
            canvas.style.cursor = 'crosshair';
            break;
        default:
            canvas.style.cursor = 'default';
    }
}

// Fonctions de dessin
function startAction(e) {
    if (!isDrawer) return;
    
    isDrawing = true;
    [startX, startY] = [e.offsetX, e.offsetY];
    [lastX, lastY] = [e.offsetX, e.offsetY];
    
    if (currentTool === 'rectangle' || currentTool === 'circle' || currentTool === 'line') {
        savedData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }
    
    // Envoyer l'action de dessin
    sendDrawData({
        type: 'start',
        x: e.offsetX,
        y: e.offsetY,
        tool: currentTool,
        color: document.getElementById('color-picker').value,
        size: document.getElementById('brush-size').value
    });
}
function performAction(e) {
    if (!isDrawing || !isDrawer) return;
    
    const color = document.getElementById('color-picker').value;
    const size = document.getElementById('brush-size').value;
    
    // Envoyer les données AVANT de dessiner pour éviter les pointillés
    if (currentTool === 'pen' || currentTool === 'eraser') {
        sendDrawData({
            type: 'draw',
            fromX: lastX,
            fromY: lastY,
            toX: e.offsetX,
            toY: e.offsetY,
            tool: currentTool,
            color: color,
            size: size
        });
    }
    
    switch(currentTool) {
        case 'pen':
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(e.offsetX, e.offsetY);
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.stroke();
            [lastX, lastY] = [e.offsetX, e.offsetY];
            break;
            
        case 'eraser':
            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(e.offsetX, e.offsetY);
            ctx.strokeStyle = 'white';
            ctx.lineWidth = size * 2;
            ctx.lineCap = 'round';
            ctx.stroke();
            [lastX, lastY] = [e.offsetX, e.offsetY];
            break;
            
        case 'rectangle':
            // Restaurer le canvas sauvegardé
            ctx.putImageData(savedData, 0, 0);
            // Dessiner le nouveau rectangle
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.strokeRect(startX, startY, e.offsetX - startX, e.offsetY - startY);
            break;
            
        case 'circle':
            // Restaurer le canvas sauvegardé
            ctx.putImageData(savedData, 0, 0);
            // Calculer le rayon
            const radius = Math.sqrt(Math.pow(e.offsetX - startX, 2) + Math.pow(e.offsetY - startY, 2));
            // Dessiner le cercle
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.stroke();
            break;
            
        case 'line':
            // Restaurer le canvas sauvegardé
            ctx.putImageData(savedData, 0, 0);
            // Dessiner la ligne
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(e.offsetX, e.offsetY);
            ctx.strokeStyle = color;
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.stroke();
            break;
    }
    sendDrawData({
        type: 'draw',
        fromX: lastX,
        fromY: lastY,
        toX: e.offsetX,
        toY: e.offsetY,
        tool: currentTool,
        color: document.getElementById('color-picker').value,
        size: document.getElementById('brush-size').value
    });
    
    [lastX, lastY] = [e.offsetX, e.offsetY];
}

function endAction() {
    if (isDrawing && isDrawer) {
        isDrawing = false;
        saveToHistory();
        
        // Envoyer la fin de l'action
        sendDrawData({
            type: 'end'
        });
    }
}   

// Fonction pour envoyer les données de dessin
function sendDrawData(drawData) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'draw',
            drawData: drawData
        }));
    }
}

// Fonction pour gérer le dessin distant
function handleRemoteDrawing(drawData) {
    switch(drawData.type) {
        case 'start':
            // Préparer pour dessiner
            lastX = drawData.x;
            lastY = drawData.y;
            break;
        case 'draw':
            // Dessiner sur le canvas
            if (drawData.tool === 'eraser') {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = drawData.size * 2;
            } else {
                ctx.strokeStyle = drawData.color;
                ctx.lineWidth = drawData.size;
            }
            
            ctx.beginPath();
            ctx.moveTo(drawData.fromX, drawData.fromY);
            ctx.lineTo(drawData.toX, drawData.toY);
            ctx.lineCap = 'round';
            ctx.stroke();
            break;
        case 'end':
            // Fin du dessin
            break;
    }
}

// Fonction pour mettre à jour le timer
function updateTimer(timeLeft) {
    const timerElement = document.getElementById('timer');
    if (timerElement) {
        timerElement.textContent = timeLeft;
        
        // Animation d'urgence quand il reste peu de temps
        if (timeLeft <= 10) {
            timerElement.classList.add('timer-warning');
        } else {
            timerElement.classList.remove('timer-warning');
        }
    }
}

// Sauvegarder dans l'historique
function saveToHistory() {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    history.push(imageData);
    
    // Limiter la taille de l'historique
    if (history.length > MAX_HISTORY) {
        history.shift();
    }
}

// Annuler la dernière action
function undoLastAction() {
    if (history.length > 1) {
        history.pop(); // Enlever l'état actuel
        const previousState = history[history.length - 1];
        ctx.putImageData(previousState, 0, 0);
    }
}

// Effacer le canvas
function clearCanvas() {
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    saveToHistory();
}

function displayWordForDrawer(word) {
    document.getElementById('word-hint').textContent = `Dessinez : ${word}`;
}

function displayWordHint(word) {
    // Afficher des tirets pour chaque lettre
    const hint = word.split('').map(char => char === ' ' ? ' ' : '_').join(' ');
    document.getElementById('word-hint').textContent = hint;
}

function enableDrawing(enabled) {
    if (enabled) {
        canvas.style.pointerEvents = 'auto';
        canvas.style.opacity = '1';
    } else {
        canvas.style.pointerEvents = 'none';
        canvas.style.opacity = '0.8';
    }
}

// Fonction pour gérer une bonne réponse
function handleCorrectGuess(data) {
    // Animation du message
    const systemMessage = document.createElement('div');
    systemMessage.className = 'new-message correct-answer-flash';
    systemMessage.innerHTML = `<strong>Système:</strong> ${data.winner} a trouvé le mot : ${data.word}!`;
    
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.appendChild(systemMessage);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Animation des scores
    if (data.scores) {
        updatePlayersList(data.scores);
        
        // Trouver le joueur gagnant et animer son score
        const playerElements = document.querySelectorAll('.player-item');
        playerElements.forEach(element => {
            if (element.querySelector('strong').textContent === data.winner) {
                showScoreAnimation(element, 100);
            }
        });
    }
}

// Fonction pour gérer la fin d'un round
function handleRoundEnd(data) {
    console.log("Fin du round reçue:", data);
    
    showRoundAnnouncement(`Le mot était : ${data.word}`);
    
    setTimeout(() => {
        addChatMessage('Système', `Round terminé ! Le mot était : ${data.word}`, true);
        
        if (data.scores) {
            updatePlayersList(data.scores);
        }
        
        // Vérifier si c'est la fin du jeu
        if (data.isGameOver) {
            console.log("Jeu terminé, affichage des scores finaux");
            showGameOver(data.scores || data.finalScores);
        }
    }, 1000);
}

// Fonctions du chat
function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message && ws && ws.readyState === WebSocket.OPEN) {
        // Envoyer au serveur
        ws.send(JSON.stringify({
            type: 'chat',
            content: message
        }));
        
        // Si on devine, envoyer aussi comme guess
        if (!isDrawer) {
            ws.send(JSON.stringify({
                type: 'guess',
                guess: message
            }));
        }
        
        input.value = '';
    }
}

// Fonction pour mettre à jour l'état du jeu
function updateGameState(state) {
    console.log("📊 Mise à jour de l'état du jeu:", state);
    
    // Mettre à jour la liste des joueurs - IMPORTANT!
    if (state.players && Array.isArray(state.players)) {
        console.log("🔄 Mise à jour forcée de la liste des joueurs:", state.players);
        
        // Mettre à jour notre variable locale
        players = state.players;
        
        // Force la mise à jour de l'affichage
        updatePlayersList(state.players);
    }
    
    // Mettre à jour le timer
    if (state.timeLeft !== undefined) {
        updateTimer(state.timeLeft);
    }
    
    // Mettre à jour les informations de round
    if (state.currentRound !== undefined && state.totalRounds !== undefined) {
        const roundInfo = document.getElementById('round-info');
        if (roundInfo) {
            roundInfo.textContent = `Round ${state.currentRound}/${state.totalRounds}`;
        }
    }
    
    // Mettre à jour l'état du jeu
    if (state.gameState) {
        gameState = state.gameState;
        console.log(`🎮 État du jeu: ${gameState}`);
    }
}

// Fonction pour démarrer un nouveau round
function startNewRound(data) {
    console.log('🎮 Nouveau round:', data);
    
    clearCanvas();
    
    // Mettre à jour l'indicateur de round
    currentRound = data.currentRound || currentRound;
    totalRounds = data.totalRounds || totalRounds;
    
    // Afficher l'information sur les rounds
    document.getElementById('round-info').textContent = `Round ${currentRound}/${totalRounds}`;
    
    // CORRECTION: Mettre à jour la liste des joueurs avec les nouvelles données
    if (data.players) {
        console.log('🔄 Mise à jour joueurs depuis newRound:', data.players);
        players = data.players; // Mettre à jour la variable locale
        updatePlayersList(data.players); // Mettre à jour l'affichage
    }
    
    if (data.role === 'drawer') {
        isDrawer = true;
        enableDrawing(true);
        displayWordForDrawer(data.word);
        showRoundAnnouncement(`C'est votre tour de dessiner ! (Round ${currentRound}/${totalRounds})`);
        
        setTimeout(() => {
            addChatMessage('Système', `Dessinez : ${data.word}`);
        }, 3000);
    } else {
        isDrawer = false;
        enableDrawing(false);
        displayWordHint(data.wordHint);
        showRoundAnnouncement(`${data.drawer} dessine ! (Round ${currentRound}/${totalRounds})`);
        
        setTimeout(() => {
            addChatMessage('Système', `${data.drawer} est en train de dessiner...`);
        }, 3000);
    }
    
    // Vérifier si c'est le dernier round
    if (currentRound === totalRounds && data.isLastPlayer) {
        addChatMessage('Système', 'Dernier round de la partie !');
    }
}

// Fonction pour ajouter un chat
function addChatMessage(username, message, isSystem = false) {
    const chatMessages = document.getElementById('chat-messages');
    if (!chatMessages) {
        console.error('❌ Element chat-messages introuvable');
        return;
    }
    
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    
    if (isSystem) {
        messageElement.classList.add('system-message');
        messageElement.style.fontStyle = 'italic';
        messageElement.style.color = '#666';
    }
    
    messageElement.innerHTML = `<strong>${username}:</strong> ${message}`;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Fonctions pour les joueurs
function updatePlayersList(serverPlayers = null) {
    const playersContainer = document.getElementById('players-container');
    
    if (!playersContainer) {
        console.error('❌ Element players-container introuvable');
        return;
    }
    
    // Vider le container
    playersContainer.innerHTML = '';
    
    // Utiliser les joueurs du serveur si disponibles, sinon utiliser la variable locale
    const playersToDisplay = serverPlayers || players;
    
    console.log('🎨 Affichage de la liste des joueurs:', playersToDisplay);
    
    // Vérifier que nous avons des joueurs à afficher
    if (!playersToDisplay || !Array.isArray(playersToDisplay) || playersToDisplay.length === 0) {
        console.log('⚠️ Aucun joueur à afficher');
        playersContainer.innerHTML = '<div class="no-players">Aucun joueur connecté</div>';
        return;
    }
    
    // Afficher chaque joueur
    playersToDisplay.forEach((player, index) => {
        // CORRECTION: Log détaillé pour déboguer
        console.log(`  Joueur ${index}: ${player.username}, isDrawing: ${player.isDrawing}`);
        
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.style.marginBottom = '10px';
        playerElement.style.padding = '10px';
        playerElement.style.border = '1px solid #ccc';
        playerElement.style.borderRadius = '5px';
        playerElement.style.backgroundColor = player.isDrawing ? '#e8f5e9' : '#f5f5f5';
        
        // CORRECTION: Vérifier explicitement la valeur de isDrawing
        const drawingIndicator = player.isDrawing === true ? 
            '<span style="color: green; margin-left: 10px;">🎨 Dessine</span>' : '';
        
        playerElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="flex-grow: 1;">${player.username}</strong>
                <span style="margin-left: 10px;">${player.score || 0} pts</span>
                ${drawingIndicator}
            </div>
        `;
        
        playersContainer.appendChild(playerElement);
    });
    
    console.log(`📊 ${playersToDisplay.length} joueurs affichés`);
}

// Simuler le dessin d'un bot
function simulateBotDrawing() {
    // Simulation simple : dessiner quelques lignes aléatoires
    setTimeout(() => {
        ctx.beginPath();
        ctx.moveTo(100, 100);
        ctx.lineTo(200, 200);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.stroke();
    }, 2000);
    
    setTimeout(() => {
        ctx.beginPath();
        ctx.arc(300, 200, 50, 0, 2 * Math.PI);
        ctx.stroke();
    }, 4000);
}

// Fonction pour adapter le canvas
function resizeCanvas() {
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    
    // Ajuster la taille du canvas en maintenant le ratio
    const maxWidth = Math.min(rect.width - 20, 800);
    const height = maxWidth * 2/3; // Ratio 3:2
    
    // Sauvegarder le contenu actuel
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(canvas, 0, 0);
    
    // Redimensionner
    canvas.width = maxWidth;
    canvas.height = height;
    
    // Restaurer le contenu
    ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, canvas.width, canvas.height);
}


// Ajoute un écouteur pour redimensionner
window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimeout);
    window.resizeTimeout = setTimeout(resizeCanvas, 250);
}); 

// Animation quand quelqu'un trouve le mot
function showScoreAnimation(playerElement, points) {
    const scorePopup = document.createElement('div');
    scorePopup.className = 'score-popup';
    scorePopup.textContent = `+${points}`;
    
    // Positionner l'animation près du joueur
    const rect = playerElement.getBoundingClientRect();
    scorePopup.style.left = rect.left + rect.width / 2 + 'px';
    scorePopup.style.top = rect.top + 'px';
    
    document.body.appendChild(scorePopup);
    
    // Supprimer après l'animation
    setTimeout(() => {
        scorePopup.remove();
    }, 1500);
}

// Animation pour le changement de round
function showRoundAnnouncement(text) {
    const announcement = document.createElement('div');
    announcement.className = 'round-announcement';
    announcement.textContent = text;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
        announcement.remove();
    }, 3000);
}

// Fonction pour afficher la fin du jeu avec gestion des égalités

function showGameOver(finalScores) {
    console.log("Affichage de la fin de partie avec scores:", finalScores);
    
    // Supprimer toute annonce précédente si elle existe
    const existingAnnouncement = document.querySelector('.game-over-announcement');
    if (existingAnnouncement) {
        existingAnnouncement.remove();
    }
    
    // Trier les scores par ordre décroissant avec gestion des égalités
    const sortedScores = [...finalScores].sort((a, b) => {
        // D'abord trier par score
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        // En cas d'égalité, trier par ordre alphabétique des noms
        return a.username.localeCompare(b.username);
    });
    
    // Déterminer les rangs avec gestion des égalités
    let currentRank = 1;
    let previousScore = -1;
    let rankedPlayers = sortedScores.map((player, index) => {
        if (player.score !== previousScore) {
            currentRank = index + 1;
        }
        previousScore = player.score;
        return { ...player, rank: currentRank };
    });
    
    // Le gagnant est le joueur de rang 1
    const winners = rankedPlayers.filter(player => player.rank === 1);
    const isMultipleWinners = winners.length > 1;
    
    // Créer l'élément d'annonce
    const gameOverAnnouncement = document.createElement('div');
    gameOverAnnouncement.className = 'game-over-announcement';
    gameOverAnnouncement.style.position = 'fixed';
    gameOverAnnouncement.style.top = '50%';
    gameOverAnnouncement.style.left = '50%';
    gameOverAnnouncement.style.transform = 'translate(-50%, -50%)';
    gameOverAnnouncement.style.backgroundColor = 'white';
    gameOverAnnouncement.style.padding = '30px';
    gameOverAnnouncement.style.borderRadius = '10px';
    gameOverAnnouncement.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
    gameOverAnnouncement.style.zIndex = '1000';
    gameOverAnnouncement.style.textAlign = 'center';
    gameOverAnnouncement.style.maxWidth = '500px';
    
    // Adapter le message selon qu'il y a un ou plusieurs gagnants
    let winnerMessage;
    if (isMultipleWinners) {
        const winnerNames = winners.map(w => w.username).join(' et ');
        winnerMessage = `<h3>🎉 Égalité ! ${winnerNames} gagnent avec ${winners[0].score} points!</h3>`;
    } else {
        winnerMessage = `<h3>🎉 ${winners[0].username} gagne avec ${winners[0].score} points!</h3>`;
    }
    
    // Contenu avec les DEUX boutons côte à côte
    gameOverAnnouncement.innerHTML = `
        <h2>🏆 Fin de la partie !</h2>
        ${winnerMessage}
        <div class="final-scores" style="margin: 20px 0;">
            <h4>📊 Scores finaux :</h4>
            <ul style="list-style: none; padding: 0; margin: 10px 0;">
                ${rankedPlayers.map(player => 
                    `<li style="padding: 5px 0; ${player.rank === 1 ? 'font-weight: bold; color: #28a745;' : ''}"">
                        ${player.rank}. ${player.username}: ${player.score} points
                        ${player.rank === 1 ? ' 🏆' : ''}
                    </li>`
                ).join('')}
            </ul>
        </div>
        <div class="game-over-buttons" style="display: flex; gap: 15px; justify-content: center; margin-top: 25px;">
            <button id="new-game-btn" style="
                padding: 15px 25px; 
                background-color: #28a745; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-size: 16px; 
                font-weight: bold;
                transition: background-color 0.3s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            " onmouseover="this.style.backgroundColor='#218838'" onmouseout="this.style.backgroundColor='#28a745'">
                🎮 Nouvelle Partie
            </button>
            <button id="dashboard-btn" style="
                padding: 15px 25px; 
                background-color: #007bff; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-size: 16px; 
                font-weight: bold;
                transition: background-color 0.3s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            " onmouseover="this.style.backgroundColor='#0056b3'" onmouseout="this.style.backgroundColor='#007bff'">
                🏠 Retour au Dashboard
            </button>
        </div>
        <div style="margin-top: 15px; color: #666; font-size: 14px;">
            💡 Astuce : Vous pouvez aussi appuyer sur <kbd>Échap</kbd> pour retourner au dashboard
        </div>
    `;
    
    // Ajouter l'annonce au DOM
    document.body.appendChild(gameOverAnnouncement);
    
    // Gestionnaire pour le bouton "Nouvelle Partie"
    document.getElementById('new-game-btn').addEventListener('click', function() {
        console.log("🎮 Bouton Nouvelle Partie cliqué");
        
        // Envoyer un message au serveur pour relancer la partie
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'restartGame'
            }));
            console.log("📤 Message restartGame envoyé au serveur");
        } else {
            console.error("❌ WebSocket non connecté, impossible d'envoyer la demande de redémarrage");
            alert("Erreur de connexion. Impossible de redémarrer la partie.");
        }
        
        // Supprimer l'annonce
        gameOverAnnouncement.remove();
    });
    
    // Gestionnaire pour le bouton "Retour au Dashboard"
    document.getElementById('dashboard-btn').addEventListener('click', function() {
        console.log("🏠 Bouton Retour au Dashboard cliqué");
        
        // Fermer la connexion WebSocket proprement
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'Retour volontaire au dashboard');
            console.log("🔌 Connexion WebSocket fermée");
        }
        
        // Supprimer l'annonce
        gameOverAnnouncement.remove();
        
        // Rediriger vers le dashboard
        window.location.href = 'dashboard.html';
    });
}

// BONUS: Fonction pour retourner au dashboard (améliorée)
function returnToDashboard() {
    // Afficher une confirmation plus élégante
    const gameOverAnnouncement = document.querySelector('.game-over-announcement');
    
    // Si on est en fin de partie, pas besoin de confirmation
    if (gameOverAnnouncement) {
        // Fermer la connexion et rediriger directement
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'Retour volontaire au dashboard');
        }
        window.location.href = 'dashboard.html';
        return;
    }
    
    // Sinon, demander confirmation
    const confirmation = confirm('Voulez-vous vraiment quitter la partie et retourner au dashboard ?');
    if (confirmation) {
        // Fermer la connexion WebSocket proprement
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'Retour volontaire au dashboard');
            console.log("🔌 Connexion fermée - retour au dashboard");
        }
        
        // Rediriger vers le dashboard
        window.location.href = 'dashboard.html';
    }
}

// Le raccourci clavier reste inchangé
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        returnToDashboard();
    }
});

function endGame() {
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

// Fonction pour ajouter un joueur
function addPlayer(player) {
    console.log(`👤 Nouveau joueur à ajouter:`, player);
    
    // Vérifier d'abord si le joueur existe déjà pour éviter les doublons
    const existingPlayerIndex = players.findIndex(p => p.username === player.username);
    
    if (existingPlayerIndex === -1) {
        // Si le joueur n'existe pas, l'ajouter à notre tableau
        players.push(player);
        console.log(`✅ Joueur ajouté: ${player.username}`);
    } else {
        // Si le joueur existe déjà, mettre à jour ses informations
        players[existingPlayerIndex] = player;
        console.log(`🔄 Joueur mis à jour: ${player.username}`);
    }
    
    // Afficher la liste complète des joueurs
    console.log(`📋 Liste complète des joueurs (${players.length}):`);
    players.forEach((p, index) => {
        console.log(`  ${index}: ${p.username} (${p.score} pts)`);
    });
    
    // Mettre à jour l'affichage des joueurs
    updatePlayersList();
    
    // Afficher un message dans le chat
    addChatMessage('Système', `${player.username} a rejoint la partie.`);
}

// Fonction pour supprimer un joueur
function removePlayer(playerId) {
    // Trouver l'index du joueur à supprimer
    const playerIndex = players.findIndex(p => p.id === playerId);
    
    if (playerIndex !== -1) {
        // Récupérer le nom du joueur avant de le supprimer
        const playerName = players[playerIndex].username;
        
        // Supprimer le joueur du tableau
        players.splice(playerIndex, 1);
        
        // Mettre à jour l'affichage
        updatePlayersList();
        
        // Afficher un message dans le chat
        addChatMessage('Système', `${playerName} a quitté la partie.`);
    }
}

// Fonction pour afficher la fin du jeu
function showGameOver(finalScores) {
    console.log("Affichage de la fin de partie avec scores:", finalScores);
    
    // Supprimer toute annonce précédente si elle existe
    const existingAnnouncement = document.querySelector('.game-over-announcement');
    if (existingAnnouncement) {
        existingAnnouncement.remove();
    }
    
    // Trier les scores par ordre décroissant avec gestion des égalités
    const sortedScores = [...finalScores].sort((a, b) => {
        // D'abord trier par score
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        // En cas d'égalité, trier par ordre alphabétique des noms
        return a.username.localeCompare(b.username);
    });
    
    // Déterminer les rangs avec gestion des égalités
    let currentRank = 1;
    let previousScore = -1;
    let rankedPlayers = sortedScores.map((player, index) => {
        if (player.score !== previousScore) {
            currentRank = index + 1;
        }
        previousScore = player.score;
        return { ...player, rank: currentRank };
    });
    
    // Le gagnant est le joueur de rang 1
    const winners = rankedPlayers.filter(player => player.rank === 1);
    const isMultipleWinners = winners.length > 1;
    
    // Créer l'élément d'annonce
    const gameOverAnnouncement = document.createElement('div');
    gameOverAnnouncement.className = 'game-over-announcement';
    gameOverAnnouncement.style.position = 'fixed';
    gameOverAnnouncement.style.top = '50%';
    gameOverAnnouncement.style.left = '50%';
    gameOverAnnouncement.style.transform = 'translate(-50%, -50%)';
    gameOverAnnouncement.style.backgroundColor = 'white';
    gameOverAnnouncement.style.padding = '30px';
    gameOverAnnouncement.style.borderRadius = '10px';
    gameOverAnnouncement.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
    gameOverAnnouncement.style.zIndex = '1000';
    gameOverAnnouncement.style.textAlign = 'center';
    gameOverAnnouncement.style.maxWidth = '500px';
    
    // Adapter le message selon qu'il y a un ou plusieurs gagnants
    let winnerMessage;
    if (isMultipleWinners) {
        const winnerNames = winners.map(w => w.username).join(' et ');
        winnerMessage = `<h3>🎉 Égalité ! ${winnerNames} gagnent avec ${winners[0].score} points!</h3>`;
    } else {
        winnerMessage = `<h3>🎉 ${winners[0].username} gagne avec ${winners[0].score} points!</h3>`;
    }
    
    // ✅ CONTENU AVEC LES DEUX BOUTONS
    gameOverAnnouncement.innerHTML = `
        <h2>🏆 Fin de la partie !</h2>
        ${winnerMessage}
        <div class="final-scores" style="margin: 20px 0;">
            <h4>📊 Scores finaux :</h4>
            <ul style="list-style: none; padding: 0; margin: 10px 0;">
                ${rankedPlayers.map(player => 
                    `<li style="padding: 5px 0; ${player.rank === 1 ? 'font-weight: bold; color: #28a745;' : ''}"">
                        ${player.rank}. ${player.username}: ${player.score} points
                        ${player.rank === 1 ? ' 🏆' : ''}
                    </li>`
                ).join('')}
            </ul>
        </div>
        <div class="game-over-buttons" style="display: flex; gap: 15px; justify-content: center; margin-top: 25px;">
            <button id="new-game-btn" style="
                padding: 15px 25px; 
                background-color: #28a745; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-size: 16px; 
                font-weight: bold;
                transition: background-color 0.3s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            " onmouseover="this.style.backgroundColor='#218838'" onmouseout="this.style.backgroundColor='#28a745'">
                🎮 Nouvelle Partie
            </button>
            <button id="dashboard-btn" style="
                padding: 15px 25px; 
                background-color: #007bff; 
                color: white; 
                border: none; 
                border-radius: 8px; 
                cursor: pointer; 
                font-size: 16px; 
                font-weight: bold;
                transition: background-color 0.3s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            " onmouseover="this.style.backgroundColor='#0056b3'" onmouseout="this.style.backgroundColor='#007bff'">
                🏠 Retour au Dashboard
            </button>
        </div>
        <div style="margin-top: 15px; color: #666; font-size: 14px;">
            💡 Astuce : Vous pouvez aussi appuyer sur <kbd>Échap</kbd> pour retourner au dashboard
        </div>
    `;
    
    // Ajouter l'annonce au DOM
    document.body.appendChild(gameOverAnnouncement);
    
    // ✅ GESTIONNAIRE POUR "NOUVELLE PARTIE"
    document.getElementById('new-game-btn').addEventListener('click', function() {
        console.log("🎮 Bouton Nouvelle Partie cliqué");
        
        // Envoyer un message au serveur pour relancer la partie
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'restartGame'
            }));
            console.log("📤 Message restartGame envoyé au serveur");
        } else {
            console.error("❌ WebSocket non connecté, impossible d'envoyer la demande de redémarrage");
            alert("Erreur de connexion. Impossible de redémarrer la partie.");
        }
        
        // Supprimer l'annonce
        gameOverAnnouncement.remove();
    });
    
    // ✅ GESTIONNAIRE POUR "RETOUR AU DASHBOARD" 
    document.getElementById('dashboard-btn').addEventListener('click', function() {
        console.log("🏠 Bouton Retour au Dashboard cliqué");
        
        // Fermer la connexion WebSocket proprement
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, 'Retour volontaire au dashboard');
            console.log("🔌 Connexion WebSocket fermée");
        }
        
        // Supprimer l'annonce
        gameOverAnnouncement.remove();
        
        // Rediriger vers le dashboard
        window.location.href = 'dashboard.html';
    });
}

// Fonction pour retourner au dashboard
function returnToDashboard() {
    if (confirm('Voulez-vous vraiment quitter la partie et retourner au dashboard ?')) {
        // Fermer la connexion WebSocket proprement
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close();
        }
        
        // Rediriger vers le dashboard
        window.location.href = 'dashboard.html';
    }
}

// Fonction pour gérer la déconnexion
function closeConnection(reason = 'Fermeture manuelle') {
    console.log(`🔌 Fermeture connexion: ${reason}`);
    
    // Arrêter les tentatives de reconnexion
    if (reconnectionTimeoutId) {
        clearTimeout(reconnectionTimeoutId);
        reconnectionTimeoutId = null;
    }
    
    // Fermer la connexion
    if (ws && ws.readyState !== WebSocket.CLOSED) {
        ws.onclose = null; // Empêcher la reconnexion automatique
        ws.close(1000, reason);
    }
    
    ws = null;
    isConnecting = false;
}

// Raccourci clavier pour retourner au dashboard (Échap)
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        returnToDashboard();
    }
});

// Fermer proprement la connexion quand on quitte la page
window.addEventListener('beforeunload', function(e) {
    closeConnection('Page fermée');
});

// Gérer la perte de focus/visibilité de la page
document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
        console.log('📱 Page cachée');
    } else {
        console.log('📱 Page visible');
        // Vérifier l'état de la connexion quand on revient sur la page
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log('🔄 Reconnexion après retour sur la page');
            setTimeout(() => connectWebSocket(), 1000);
        }
    }
});