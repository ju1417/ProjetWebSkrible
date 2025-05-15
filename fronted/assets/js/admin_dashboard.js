// Variables globales
let currentAdmin = null;
const API_URL = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3001';
let adminSocket = null;

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
    console.log('🛡️ Initialisation du dashboard admin...');
    
    // Vérifier les droits admin
    if (!checkAdminAuthentication()) {
        return;
    }
    
    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Connecter le WebSocket admin
    connectAdminWebSocket();
    
    // Charger les données initiales
    loadAdminData();
    
    // Actualiser les données toutes les 30 secondes
    setInterval(loadAdminData, 30000);
});

// Vérifier l'authentification admin
function checkAdminAuthentication() {
    console.log('🔐 Vérification des droits admin...');
    
    const userData = localStorage.getItem('currentUser');
    
    if (!userData) {
        console.error('❌ Aucune donnée utilisateur trouvée');
        alert('Vous devez être connecté pour accéder au dashboard admin');
        window.location.href = 'index.html';
        return false;
    }
    
    try {
        currentAdmin = JSON.parse(userData);
        
        // Vérifier que l'utilisateur est admin
        if (!currentAdmin.isadmin) {
            console.error('❌ Utilisateur non-admin tentant d\'accéder au dashboard admin');
            alert('Accès refusé : droits administrateur requis');
            window.location.href = 'dashboard.html';
            return false;
        }
        
        // Afficher le nom de l'admin
        const adminNameElement = document.getElementById('admin-name');
        if (adminNameElement) {
            adminNameElement.textContent = currentAdmin.username;
        }
        
        console.log('✅ Admin connecté:', currentAdmin.username);
        return true;
        
    } catch (error) {
        console.error('❌ Erreur parsing données admin:', error);
        alert('Erreur de données utilisateur. Reconnectez-vous.');
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
        return false;
    }
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
    // Bouton déconnexion
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }
    
    // Auto-refresh des données toutes les 10 secondes pour les parties actives
    setInterval(refreshActiveGames, 10000);
    setInterval(refreshActivePlayers, 15000);
}

// Fonction de déconnexion
function logout() {
    console.log('🚪 Déconnexion admin...');
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
        // Fermer la connexion WebSocket
        if (adminSocket) {
            adminSocket.close();
        }
        
        // Nettoyer le stockage
        sessionStorage.clear();
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }
}

// Connexion WebSocket pour surveiller les parties en temps réel
function connectAdminWebSocket() {
    try {
        console.log('🔌 Connexion WebSocket admin...');
        adminSocket = new WebSocket(WS_URL);
        
        adminSocket.onopen = () => {
            console.log('✅ WebSocket admin connecté');
            // S'identifier comme admin
            adminSocket.send(JSON.stringify({
                type: 'adminConnect',
                adminId: currentAdmin.id,
                username: currentAdmin.username
            }));
        };
        
        adminSocket.onmessage = (event) => {
            handleAdminWebSocketMessage(JSON.parse(event.data));
        };
        
        adminSocket.onclose = () => {
            console.log('🔌 WebSocket admin déconnecté');
            // Reconnecter après 5 secondes
            setTimeout(connectAdminWebSocket, 5000);
        };
        
        adminSocket.onerror = (error) => {
            console.error('❌ Erreur WebSocket admin:', error);
        };
        
    } catch (error) {
        console.error('❌ Erreur connexion WebSocket:', error);
    }
}

// Gérer les messages WebSocket
function handleAdminWebSocketMessage(message) {
    switch (message.type) {
        case 'gameUpdate':
            refreshActiveGames();
            break;
        case 'playerUpdate':
            refreshActivePlayers();
            break;
        case 'systemUpdate':
            loadAdminData();
            break;
        default:
            console.log('📨 Message admin non géré:', message.type);
    }
}

// Charger toutes les données admin
async function loadAdminData() {
    console.log('📊 Chargement des données admin...');
    
    try {
        await Promise.all([
            loadAdminStats(),
            refreshActiveGames(),
            refreshActivePlayers()
        ]);
    } catch (error) {
        console.error('❌ Erreur chargement données admin:', error);
        showError('Erreur lors du chargement des données admin');
    }
}

// Charger les statistiques admin
async function loadAdminStats() {
    try {
        // Simulation des statistiques (à remplacer par de vraies API)
        updateStatDisplay('active-games-count', '2');
        updateStatDisplay('active-players-count', '7');
        updateStatDisplay('total-users-count', '156');
        updateStatDisplay('games-today-count', '12');
        
        // TODO: Implémenter les vraies API pour récupérer ces stats
        /*
        const response = await fetch(`${API_URL}/admin/stats`);
        if (response.ok) {
            const stats = await response.json();
            updateStatDisplay('active-games-count', stats.activeGames);
            updateStatDisplay('active-players-count', stats.activePlayers);
            updateStatDisplay('total-users-count', stats.totalUsers);
            updateStatDisplay('games-today-count', stats.gamesToday);
        }
        */
    } catch (error) {
        console.error('❌ Erreur chargement stats:', error);
    }
}

// Actualiser la liste des parties actives
async function refreshActiveGames() {
    console.log('🎮 Actualisation des parties actives...');
    
    const container = document.getElementById('active-games-container');
    if (!container) return;
    
    try {
        // Simulation des parties actives (à remplacer par vraie API)
        const activeGames = [
            {
                id: 1,
                players: ['Alice', 'Bob', 'Charlie'],
                status: 'playing',
                currentRound: 2,
                totalRounds: 3,
                creator: 'Alice',
                startTime: new Date(Date.now() - 300000)
            },
            {
                id: 2,
                players: ['David', 'Eve'],
                status: 'waiting',
                currentRound: 0,
                totalRounds: 2,
                creator: 'David',
                startTime: new Date(Date.now() - 120000)
            }
        ];
        
        // TODO: Remplacer par vraie API
        /*
        const response = await fetch(`${API_URL}/admin/active-games`);
        const activeGames = await response.json();
        */
        
        if (activeGames.length === 0) {
            container.innerHTML = '<div class="no-data">Aucune partie active</div>';
            return;
        }
        
        container.innerHTML = activeGames.map(game => `
            <div class="game-item">
                <div class="game-info">
                    <strong>Partie #${game.id}</strong>
                    <br>
                    <span class="game-status status-${game.status}">
                        ${getStatusText(game.status)}
                    </span>
                    <br>
                    Créateur: ${game.creator} | 
                    Joueurs: ${game.players.length} |
                    Round: ${game.currentRound}/${game.totalRounds}
                    <br>
                    <small>Démarrée: ${formatTime(game.startTime)}</small>
                </div>
                <div class="game-actions">
                    <button class="admin-btn" onclick="viewGameDetails(${game.id})">
                        👁️ Voir
                    </button>
                    <button class="admin-btn danger" onclick="endGame(${game.id})">
                        🛑 Terminer
                    </button>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Erreur actualisation parties:', error);
        container.innerHTML = '<div class="no-data">Erreur de chargement</div>';
    }
}

// Actualiser la liste des joueurs actifs
async function refreshActivePlayers() {
    console.log('👥 Actualisation des joueurs actifs...');
    
    const container = document.getElementById('active-players-container');
    if (!container) return;
    
    try {
        // Simulation des joueurs actifs (à remplacer par vraie API)
        const activePlayers = [
            {
                id: 1,
                username: 'Alice',
                currentGame: 1,
                isPlaying: true,
                connectedTime: new Date(Date.now() - 600000),
                socketId: 'socket-123'
            },
            {
                id: 2,
                username: 'Bob',
                currentGame: 1,
                isPlaying: true,
                connectedTime: new Date(Date.now() - 450000),
                socketId: 'socket-456'
            },
            {
                id: 3,
                username: 'David',
                currentGame: 2,
                isPlaying: false,
                connectedTime: new Date(Date.now() - 180000),
                socketId: 'socket-789'
            }
        ];
        
        // TODO: Remplacer par vraie API
        /*
        const response = await fetch(`${API_URL}/admin/active-players`);
        const activePlayers = await response.json();
        */
        
        if (activePlayers.length === 0) {
            container.innerHTML = '<div class="no-data">Aucun joueur connecté</div>';
            return;
        }
        
        container.innerHTML = activePlayers.map(player => `
            <div class="player-item">
                <div class="player-info">
                    <strong>${player.username}</strong>
                    <br>
                    ${player.currentGame ? `Partie #${player.currentGame}` : 'En attente'}
                    ${player.isPlaying ? ' (En jeu)' : ' (Lobby)'}
                    <br>
                    <small>Connecté: ${formatTime(player.connectedTime)}</small>
                </div>
                <div class="player-actions">
                    <button class="admin-btn warning" onclick="kickPlayer('${player.socketId}', '${player.username}')">
                        👢 Déconnecter
                    </button>
                    ${player.currentGame ? `
                        <button class="admin-btn" onclick="movePlayer(${player.id}, ${player.currentGame})">
                            🔄 Déplacer
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('❌ Erreur actualisation joueurs:', error);
        container.innerHTML = '<div class="no-data">Erreur de chargement</div>';
    }
}

// Fonctions d'actions admin
async function endGame(gameId) {
    if (!confirm(`Êtes-vous sûr de vouloir terminer la partie #${gameId} ?`)) {
        return;
    }
    
    try {
        console.log(`🛑 Tentative de terminer la partie #${gameId}...`);
        
        // TODO: Implémenter l'API pour terminer une partie
        /*
        const response = await fetch(`${API_URL}/admin/games/${gameId}/end`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentAdmin.token}` // si vous utilisez des tokens
            }
        });
        
        if (response.ok) {
            showSuccess(`Partie #${gameId} terminée avec succès`);
            refreshActiveGames();
        } else {
            throw new Error('Erreur lors de la terminaison de la partie');
        }
        */
        
        // Simulation
        showSuccess(`Partie #${gameId} terminée`);
        setTimeout(refreshActiveGames, 1000);
        
    } catch (error) {
        console.error('❌ Erreur terminer partie:', error);
        showError('Impossible de terminer la partie');
    }
}

async function kickPlayer(socketId, username) {
    if (!confirm(`Êtes-vous sûr de vouloir déconnecter ${username} ?`)) {
        return;
    }
    
    try {
        console.log(`👢 Tentative de déconnexion de ${username}...`);
        
        // TODO: Envoyer via WebSocket pour déconnecter le joueur
        if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            adminSocket.send(JSON.stringify({
                type: 'kickPlayer',
                socketId: socketId,
                username: username,
                adminId: currentAdmin.id
            }));
            
            showSuccess(`${username} a été déconnecté`);
            setTimeout(refreshActivePlayers, 1000);
        } else {
            throw new Error('WebSocket admin non connecté');
        }
        
    } catch (error) {
        console.error('❌ Erreur déconnexion joueur:', error);
        showError('Impossible de déconnecter le joueur');
    }
}

function viewGameDetails(gameId) {
    console.log(`👁️ Affichage détails partie #${gameId}`);
    alert(`Fonctionnalité à implémenter : Détails de la partie #${gameId}`);
    // TODO: Ouvrir un modal avec les détails de la partie
}

function movePlayer(playerId, currentGameId) {
    console.log(`🔄 Déplacement joueur ${playerId} de la partie ${currentGameId}`);
    alert(`Fonctionnalité à implémenter : Déplacer le joueur`);
    // TODO: Interface pour déplacer un joueur vers une autre partie
}

// Actions rapides
async function kickAllPlayers() {
    if (!confirm('Êtes-vous sûr de vouloir déconnecter TOUS les joueurs ? Cette action est irréversible.')) {
        return;
    }
    
    try {
        console.log('👢 Déconnexion de tous les joueurs...');
        
        if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            adminSocket.send(JSON.stringify({
                type: 'kickAllPlayers',
                adminId: currentAdmin.id
            }));
            
            showSuccess('Tous les joueurs ont été déconnectés');
            setTimeout(() => {
                refreshActivePlayers();
                refreshActiveGames();
            }, 1000);
        }
        
    } catch (error) {
        console.error('❌ Erreur déconnexion tous joueurs:', error);
        showError('Erreur lors de la déconnexion massive');
    }
}

async function endAllGames() {
    if (!confirm('Êtes-vous sûr de vouloir terminer TOUTES les parties ? Cette action est irréversible.')) {
        return;
    }
    
    try {
        console.log('🛑 Terminaison de toutes les parties...');
        
        if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
            adminSocket.send(JSON.stringify({
                type: 'endAllGames',
                adminId: currentAdmin.id
            }));
            
            showSuccess('Toutes les parties ont été terminées');
            setTimeout(refreshActiveGames, 1000);
        }
        
    } catch (error) {
        console.error('❌ Erreur terminer toutes parties:', error);
        showError('Erreur lors de la terminaison massive');
    }
}

function viewServerLogs() {
    console.log('📋 Affichage des logs serveur...');
    alert('Fonctionnalité à implémenter : Consultation des logs serveur');
    // TODO: Ouvrir une fenêtre avec les logs du serveur
}

function exportGameData() {
    console.log('📊 Export des données de jeu...');
    alert('Fonctionnalité à implémenter : Export des données (CSV, JSON)');
    // TODO: Générer et télécharger un export des données
}

// Fonctions utilitaires
function updateStatDisplay(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    }
}

function getStatusText(status) {
    const statusMap = {
        'waiting': 'En attente',
        'playing': 'En cours',
        'finished': 'Terminée'
    };
    return statusMap[status] || status;
}

function formatTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins}min`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    
    return date.toLocaleDateString('fr-FR');
}

function showSuccess(message) {
    showNotification(message, 'success');
}

function showError(message) {
    showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        font-weight: bold;
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
    `;
    
    switch (type) {
        case 'success':
            notification.style.background = '#10b981';
            break;
        case 'error':
            notification.style.background = '#ef4444';
            break;
        default:
            notification.style.background = '#3b82f6';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Styles pour les animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);