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

// Ajouter aux variables globales existantes
let totalRounds = 3; // Valeur par défaut
let currentRound = 0;
let isGameCreator = false; // Pour identifier le premier joueur qui crée la partie

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    initCanvas();
    setupEventListeners();
    
    // Demander le nom d'utilisateur
    myUsername = prompt('Entrez votre nom d\'utilisateur:') || 'Joueur' + Math.floor(Math.random() * 1000);
    
    // Demander le nombre de rounds seulement au premier joueur
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    
    if (!roomId) {
        // C'est un nouveau jeu, donc le joueur est le créateur
        isGameCreator = true;
        totalRounds = parseInt(prompt('Nombre de rounds (entre 1 et 10):', '3')) || 3;
        // S'assurer que le nombre est dans une plage valide
        totalRounds = Math.max(1, Math.min(10, totalRounds));
    }
    
    // Se connecter au WebSocket
    connectWebSocket();
});

// Fonction de connexion WebSocket
function connectWebSocket() {
    ws = new WebSocket('ws://localhost:3001');
    
    ws.onopen = () => {
        console.log('Connecté au serveur');
        // Envoyer un message pour rejoindre le jeu
        ws.send(JSON.stringify({
            type: 'join',
            username: myUsername,
            isGameCreator: isGameCreator,
            totalRounds: isGameCreator ? totalRounds : undefined
        }));
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleServerMessage(message);
    };
    
    ws.onerror = (error) => {
        console.error('Erreur WebSocket:', error);
    };
    
    ws.onclose = () => {
        console.log('Déconnecté du serveur');
        // Tenter de se reconnecter après 3 secondes
        setTimeout(connectWebSocket, 3000);
    };
}

// Gestionnaire des messages du serveur
function handleServerMessage(message) {
    // Déboguer: afficher tous les messages reçus
    console.log('Message reçu du serveur:', message);
    
    switch(message.type) {
        case 'gameState':
            updateGameState(message);
            break;
        case 'playerJoined':
            addPlayer(message.player);
            break;
        case 'playerLeft':
            removePlayer(message.playerId);
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
        default:
            console.log('Type de message non géré:', message.type);
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
    console.log("Mise à jour de l'état du jeu:", state);
    
    // Mettre à jour la liste des joueurs si disponible
    if (state.players) {
        // Mettre à jour notre variable locale des joueurs
        players = state.players;
        
        // Mettre à jour l'affichage
        updatePlayersList();
    }
    
    // Mettre à jour le timer
    if (state.timeLeft !== undefined) {
        updateTimer(state.timeLeft);
    }
    
    // Mettre à jour les informations de round
    if (state.currentRound !== undefined && state.totalRounds !== undefined) {
        document.getElementById('round-info').textContent = 
            `Round ${state.currentRound}/${state.totalRounds}`;
    }
    
    // Autres mises à jour d'état si nécessaire
}

// Fonction pour démarrer un nouveau round
function startNewRound(data) {
    clearCanvas();
    
    // Mettre à jour l'indicateur de round
    currentRound = data.currentRound || currentRound;
    totalRounds = data.totalRounds || totalRounds;
    
    // Afficher l'information sur les rounds
    document.getElementById('round-info').textContent = `Round ${currentRound}/${totalRounds}`;
    
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
function addChatMessage(username, message) {
    const chatMessages = document.getElementById('chat-messages');
    const messageElement = document.createElement('div');
    messageElement.className = 'new-message'; // Ajouter la classe d'animation
    messageElement.innerHTML = `<strong>${username}:</strong> ${message}`;
    
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Fonctions pour les joueurs
function updatePlayersList(serverPlayers = null) {
    const playersContainer = document.getElementById('players-container');
    playersContainer.innerHTML = '';
    
    // Utiliser les joueurs du serveur si disponibles, sinon utiliser la variable locale
    const playersToDisplay = serverPlayers || players;
    
    // Déboguer: afficher les joueurs dans la console
    console.log('Mise à jour de la liste des joueurs:', playersToDisplay);
    
    // Afficher chaque joueur
    playersToDisplay.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.style.marginBottom = '10px';
        playerElement.innerHTML = `
            <strong>${player.username}</strong>
            <span style="float: right;">${player.score || 0} pts</span>
            ${player.isDrawing ? '<span style="color: green;"> (Dessine)</span>' : ''}
        `;
        playersContainer.appendChild(playerElement);
    });
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

// Nouvelle fonction pour afficher la fin du jeu
function showGameOver(finalScores) {
    // Trier les scores par ordre décroissant
    const sortedScores = [...finalScores].sort((a, b) => b.score - a.score);
    const winner = sortedScores[0];
    
    const gameOverAnnouncement = document.createElement('div');
    gameOverAnnouncement.className = 'game-over-announcement';
    gameOverAnnouncement.innerHTML = `
        <h2>Fin de la partie!</h2>
        <h3>${winner.username} gagne avec ${winner.score} points!</h3>
        <div class="final-scores">
            <h4>Scores finaux:</h4>
            <ul>
                ${sortedScores.map(player => `<li>${player.username}: ${player.score} points</li>`).join('')}
            </ul>
        </div>
        <button id="new-game-btn">Nouvelle Partie</button>
    `;
    
    document.body.appendChild(gameOverAnnouncement);
    
    // Ajouter l'écouteur pour le bouton nouvelle partie
    document.getElementById('new-game-btn').addEventListener('click', () => {
        location.reload();
    });
}
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
    // Ajouter le joueur à notre tableau local de joueurs
    // Vérifier d'abord si le joueur existe déjà pour éviter les doublons
    const existingPlayerIndex = players.findIndex(p => p.username === player.username);
    
    if (existingPlayerIndex === -1) {
        // Si le joueur n'existe pas, l'ajouter à notre tableau
        players.push(player);
    } else {
        // Si le joueur existe déjà, mettre à jour ses informations
        players[existingPlayerIndex] = player;
    }
    
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
    
    // Trier les scores par ordre décroissant
    const sortedScores = [...finalScores].sort((a, b) => b.score - a.score);
    const winner = sortedScores[0];
    
    // Créer l'élément d'annonce
    const gameOverAnnouncement = document.createElement('div');
    gameOverAnnouncement.className = 'game-over-announcement';
    gameOverAnnouncement.style.position = 'fixed';
    gameOverAnnouncement.style.top = '50%';
    gameOverAnnouncement.style.left = '50%';
    gameOverAnnouncement.style.transform = 'translate(-50%, -50%)';
    gameOverAnnouncement.style.backgroundColor = 'white';
    gameOverAnnouncement.style.padding = '20px';
    gameOverAnnouncement.style.borderRadius = '10px';
    gameOverAnnouncement.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.5)';
    gameOverAnnouncement.style.zIndex = '1000';
    gameOverAnnouncement.style.textAlign = 'center';
    
    // Contenu de l'annonce
    gameOverAnnouncement.innerHTML = `
        <h2>Fin de la partie!</h2>
        <h3>${winner.username} gagne avec ${winner.score} points!</h3>
        <div class="final-scores">
            <h4>Scores finaux:</h4>
            <ul style="list-style: none; padding: 0;">
                ${sortedScores.map(player => `<li>${player.username}: ${player.score} points</li>`).join('')}
            </ul>
        </div>
        <button id="new-game-btn" style="margin-top: 20px; padding: 10px 20px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">Nouvelle Partie</button>
    `;
    
    // Ajouter l'annonce au DOM
    document.body.appendChild(gameOverAnnouncement);
    
    // Ajouter l'écouteur d'événements au bouton
    document.getElementById('new-game-btn').addEventListener('click', function() {
        console.log("Bouton Nouvelle Partie cliqué");
        
        // Envoyer un message au serveur pour relancer la partie
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'restartGame'
            }));
            console.log("Message restartGame envoyé au serveur");
        } else {
            console.error("WebSocket non connecté, impossible d'envoyer la demande de redémarrage");
        }
        
        // Supprimer l'annonce
        gameOverAnnouncement.remove();
    });
}