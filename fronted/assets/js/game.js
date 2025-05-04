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

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    initCanvas();
    setupEventListeners();
    
    // Demander le nom d'utilisateur
    myUsername = prompt('Entrez votre nom d\'utilisateur:') || 'Joueur' + Math.floor(Math.random() * 1000);
    
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
            username: myUsername
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
    showRoundAnnouncement(`Le mot était : ${data.word}`);
    
    setTimeout(() => {
        addChatMessage('Système', `Round terminé ! Le mot était : ${data.word}`);
        if (data.scores) {
            updatePlayersList(data.scores);
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
    // Mettre à jour la liste des joueurs
    updatePlayersList(state.players);
    
    // Mettre à jour le timer
    if (state.timeLeft) {
        updateTimer(state.timeLeft);
    }
}

// Fonction pour démarrer un nouveau round
function startNewRound(data) {
    clearCanvas();
    
    if (data.role === 'drawer') {
        isDrawer = true;
        enableDrawing(true);
        displayWordForDrawer(data.word);
        showRoundAnnouncement(`C'est votre tour de dessiner !`);
        
        setTimeout(() => {
            addChatMessage('Système', `Dessinez : ${data.word}`);
        }, 3000);
    } else {
        isDrawer = false;
        enableDrawing(false);
        displayWordHint(data.wordHint);
        showRoundAnnouncement(`${data.drawer} dessine !`);
        
        setTimeout(() => {
            addChatMessage('Système', `${data.drawer} est en train de dessiner...`);
        }, 3000);
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
    
    // Utiliser les joueurs du serveur si disponibles
    const playersToDisplay = serverPlayers || players;
    
    playersToDisplay.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.style.marginBottom = '10px';
        playerElement.innerHTML = `
            <strong>${player.username}</strong>
            <span style="float: right;">${player.score} pts</span>
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
