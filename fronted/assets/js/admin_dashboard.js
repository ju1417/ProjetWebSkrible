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
    
    // Boutons d'actions rapides
    const kickAllBtn = document.getElementById('kick-all-players-btn');
    if (kickAllBtn) {
        kickAllBtn.addEventListener('click', kickAllPlayers);
    }
    
    const endAllGamesBtn = document.getElementById('end-all-games-btn');
    if (endAllGamesBtn) {
        endAllGamesBtn.addEventListener('click', endAllGames);
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
        case 'adminConnected':
            console.log('✅ Admin confirmé par le serveur:', message.message);
            break;
        case 'gameUpdate':
            refreshActiveGames();
            break;
        case 'playerUpdate':
            refreshActivePlayers();
            break;
        case 'systemUpdate':
            loadAdminData();
            break;
        case 'adminAction':
            // Notification d'une action admin
            showSuccess(message.message || 'Action effectuée avec succès');
            refreshActiveGames();
            refreshActivePlayers();
            break;
        case 'error':
            showError(message.message || 'Erreur lors de l\'opération');
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
            refreshActivePlayers(),
            loadTodayGames(),
            refreshActivityLog()
        ]);
    } catch (error) {
        console.error('❌ Erreur chargement données admin:', error);
        showError('Erreur lors du chargement des données admin');
    }
}

// Charger les statistiques admin
async function loadAdminStats() {
    try {
        const response = await fetch(`${API_URL}/admin/stats`, {
            headers: {
                'X-Admin-Username': currentAdmin.username
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.stats) {
            throw new Error('Format de réponse invalide');
        }
        
        const { stats } = data;
        
        updateStatDisplay('active-games-count', stats.activeGames);
        updateStatDisplay('active-players-count', stats.activePlayers);
        updateStatDisplay('total-users-count', stats.totalUsers);
        updateStatDisplay('games-today-count', stats.gamesToday);
    } catch (error) {
        console.error('❌ Erreur chargement stats:', error);
        // Mettre des valeurs par défaut en cas d'erreur
        updateStatDisplay('active-games-count', '-');
        updateStatDisplay('active-players-count', '-');
        updateStatDisplay('total-users-count', '-');
        updateStatDisplay('games-today-count', '-');
    }
}

// Actualiser la liste des parties actives
async function refreshActiveGames() {
    console.log('🎮 Actualisation des parties actives...');
    
    const container = document.getElementById('active-games-container');
    if (!container) return;
    
    try {
        const response = await fetch(`${API_URL}/admin/active-games`, {
            headers: {
                'X-Admin-Username': currentAdmin.username
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.games) {
            throw new Error('Format de réponse invalide');
        }
        
        const activeGames = data.games;
        
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
                    Joueurs: ${Array.isArray(game.players) ? game.players.length : 0} |
                    Round: ${game.currentRound}/${game.totalRounds}
                    <br>
                    <small>Démarrée: ${formatTime(new Date(game.startTime))}</small>
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
        const response = await fetch(`${API_URL}/admin/active-players`, {
            headers: {
                'X-Admin-Username': currentAdmin.username
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.players) {
            throw new Error('Format de réponse invalide');
        }
        
        const activePlayers = data.players;
        
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
                    <small>Connecté: ${formatTimeFixed(player.connectedTime)}</small>
                </div>
                <div class="player-actions">
                    <button class="admin-btn warning" onclick="kickPlayer('${player.socketId}', '${player.username}')">
                        👢 Déconnecter
                    </button>
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
        
        const response = await fetch(`${API_URL}/admin/games/${gameId}/end`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Username': currentAdmin.username
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            showSuccess(data.message || `Partie #${gameId} terminée avec succès`);
            refreshActiveGames();
        } else {
            const error = await response.json();
            throw new Error(error.error || 'Erreur lors de la terminaison de la partie');
        }
        
    } catch (error) {
        console.error('❌ Erreur terminer partie:', error);
        showError(error.message || 'Impossible de terminer la partie');
    }
}

async function kickPlayer(socketId, username) {
    if (!confirm(`Êtes-vous sûr de vouloir déconnecter ${username} ?`)) {
        return;
    }
    
    try {
        console.log(`👢 Tentative de déconnexion de ${username}...`);
        
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

// Fonction améliorée pour voir les détails d'une partie
function viewGameDetails(gameId) {
    console.log(`👁️ Affichage détails partie #${gameId}`);
    
    // Créer un modal pour afficher les détails
    const modal = document.createElement('div');
    modal.className = 'game-details-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Détails de la partie #${gameId}</h3>
                <span class="close-modal">&times;</span>
            </div>
            <div class="modal-body">
                <div class="loading">Chargement des détails...</div>
            </div>
        </div>
    `;
    
    // Ajouter le style du modal
    const style = document.createElement('style');
    style.textContent = `
        .game-details-modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        }
        .modal-content {
            background: white;
            border-radius: 10px;
            width: 80%;
            max-width: 600px;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
        }
        .modal-header {
            padding: 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #e5e7eb;
            background: #dc2626;
            color: white;
            border-radius: 10px 10px 0 0;
        }
        .modal-body {
            padding: 20px;
        }
        .close-modal {
            font-size: 24px;
            cursor: pointer;
        }
        .close-modal:hover {
            color: #f1f1f1;
        }
        .loading {
            text-align: center;
            padding: 20px;
            color: #6b7280;
        }
        .player-list {
            margin-top: 15px;
        }
        .player-row {
            display: flex;
            justify-content: space-between;
            padding: 8px;
            border-bottom: 1px solid #e5e7eb;
        }
        .player-row:last-child {
            border-bottom: none;
        }
        .player-position {
            display: inline-block;
            width: 25px;
            height: 25px;
            line-height: 25px;
            text-align: center;
            border-radius: 50%;
            background: #3b82f6;
            color: white;
            margin-right: 10px;
        }
        .game-info-row {
            display: flex;
            margin-bottom: 10px;
        }
        .game-info-label {
            font-weight: bold;
            width: 120px;
        }
        .error {
            color: #dc2626;
            text-align: center;
            padding: 20px;
        }
    `;
    document.head.appendChild(style);
    
    document.body.appendChild(modal);
    
    // Fermer le modal quand on clique sur X
    const closeBtn = modal.querySelector('.close-modal');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Fermer en cliquant à l'extérieur
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
        }
    });
    
    // Pour les parties en cours, utiliser l'API active-games
    if (gameId === 0 || gameId === 1) {
        // C'est une partie active en mémoire
        fetch(`${API_URL}/admin/active-games`, {
            headers: {
                'X-Admin-Username': currentAdmin.username
            }
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erreur HTTP: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (!data.success || !data.games) {
                    throw new Error('Format de réponse invalide');
                }
                
                // Trouver la partie active correspondante
                const game = data.games.find(g => g.id === gameId);
                if (!game) {
                    throw new Error('Partie non trouvée');
                }
                
                displayActiveGameDetails(game, modal);
            })
            .catch(error => {
                console.error('Erreur:', error);
                showModalError(modal, error.message);
            });
    } else {
        // Pour les parties terminées, utiliser l'API standard
        fetch(`${API_URL}/game/${gameId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Erreur HTTP: ${response.status}`);
                }
                return response.json();
            })
            .then(game => {
                displayFinishedGameDetails(game, modal);
            })
            .catch(error => {
                console.error('Erreur:', error);
                showModalError(modal, error.message);
            });
    }
}

// Charger les parties du jour
async function loadTodayGames() {
    console.log('📅 Chargement des parties d\'aujourd\'hui...');
    
    const container = document.getElementById('today-games-container');
    if (!container) return;
    
    try {
        // Afficher l'état de chargement
        container.innerHTML = '<div class="loading">Chargement des parties...</div>';
        
        const response = await fetch(`${API_URL}/admin/today-games`, {
            headers: {
                'X-Admin-Username': currentAdmin.username
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.games) {
            throw new Error('Format de réponse invalide');
        }
        
        const todayGames = data.games;
        
        if (todayGames.length === 0) {
            container.innerHTML = '<div class="no-data">Aucune partie jouée aujourd\'hui</div>';
            return;
        }
        
        container.innerHTML = todayGames.map(game => `
            <div class="game-history-item">
                <div class="game-header">
                    <strong>Partie #${game.id}</strong>
                    <span class="game-time">${new Date(game.createdAt).toLocaleTimeString('fr-FR')}</span>
                </div>
                <div class="game-body">
                    <div>Créateur: ${game.creator || 'Inconnu'}</div>
                    <div>Joueurs: ${game.playerCount}</div>
                    <div>Tours: ${game.totalRounds}</div>
                    ${game.duration ? `<div>Durée: ${formatDuration(game.duration)}</div>` : ''}
                    ${game.winner ? `<div>Gagnant: ${game.winner}</div>` : ''}
                </div>
                <div class="game-footer">
                    <button class="admin-btn small" onclick="viewGameDetails(${game.id})">
                        👁️ Voir détails
                    </button>
                </div>
            </div>
        `).join('');
        
        // Ajouter des styles spécifiques
        const style = document.createElement('style');
        style.textContent = `
            .recent-games-list {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 1rem;
                margin-top: 1rem;
            }
            
            .game-history-item {
                background: white;
                border-radius: 8px;
                padding: 1rem;
                box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                border: 1px solid #e5e7eb;
                transition: transform 0.2s;
            }
            
            .game-history-item:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            
            .game-header {
                display: flex;
                justify-content: space-between;
                margin-bottom: 0.5rem;
                border-bottom: 1px solid #f3f4f6;
                padding-bottom: 0.5rem;
            }
            
            .game-time {
                color: #6b7280;
                font-size: 0.875rem;
            }
            
            .game-body {
                font-size: 0.875rem;
                margin-bottom: 0.5rem;
            }
            
            .game-footer {
                display: flex;
                justify-content: flex-end;
                margin-top: 0.5rem;
                padding-top: 0.5rem;
                border-top: 1px solid #f3f4f6;
            }
            
            .admin-btn.small {
                padding: 0.25rem 0.5rem;
                font-size: 0.75rem;
            }
        `;
        document.head.appendChild(style);
        
    } catch (error) {
        console.error('❌ Erreur chargement parties du jour:', error);
        container.innerHTML = '<div class="no-data">Erreur de chargement</div>';
    }
}

// Formater la durée en minutes
function formatDuration(minutes) {
    if (minutes < 60) {
        return `${minutes} min`;
    } else {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours}h${mins > 0 ? ` ${mins}min` : ''}`;
    }
}


// Afficher les détails d'une partie active
function displayActiveGameDetails(game, modal) {
    const modalBody = modal.querySelector('.modal-body');
    
    let content = `
        <div class="game-info">
            <div class="game-info-row">
                <div class="game-info-label">Créateur:</div>
                <div>${game.creator || 'Inconnu'}</div>
            </div>
            <div class="game-info-row">
                <div class="game-info-label">Tours:</div>
                <div>${game.totalRounds || 0}</div>
            </div>
            <div class="game-info-row">
                <div class="game-info-label">Tour actuel:</div>
                <div>${game.currentRound || 0}/${game.totalRounds || 0}</div>
            </div>
            <div class="game-info-row">
                <div class="game-info-label">Statut:</div>
                <div>${getStatusText(game.status)}</div>
            </div>
            <div class="game-info-row">
                <div class="game-info-label">Démarré:</div>
                <div>${formatTime(new Date(game.startTime))}</div>
            </div>
        </div>
    `;
    
    // Ajouter la liste des joueurs si disponible
    if (game.players && game.players.length > 0) {
        content += `
            <h4>Joueurs (${game.players.length})</h4>
            <div class="player-list">
        `;
        
        game.players.forEach((player, index) => {
            content += `
                <div class="player-row">
                    <div>
                        <span class="player-position">${index + 1}</span>
                        ${player}
                    </div>
                </div>
            `;
        });
        
        content += '</div>';
    } else {
        content += '<p>Aucun joueur dans cette partie.</p>';
    }
    
    modalBody.innerHTML = content;
}

// Afficher les détails d'une partie terminée
function displayFinishedGameDetails(game, modal) {
    const modalBody = modal.querySelector('.modal-body');
    
    let content = `
        <div class="game-info">
            <div class="game-info-row">
                <div class="game-info-label">Créateur:</div>
                <div>${game.creator || 'Inconnu'}</div>
            </div>
            <div class="game-info-row">
                <div class="game-info-label">Tours:</div>
                <div>${game.total_rounds || 0}</div>
            </div>
            <div class="game-info-row">
                <div class="game-info-label">Statut:</div>
                <div>${game.finished_at ? 'Terminée' : 'En cours'}</div>
            </div>
            <div class="game-info-row">
                <div class="game-info-label">Démarré le:</div>
                <div>${new Date(game.created_at).toLocaleString('fr-FR')}</div>
            </div>
            ${game.finished_at ? `
                <div class="game-info-row">
                    <div class="game-info-label">Terminé le:</div>
                    <div>${new Date(game.finished_at).toLocaleString('fr-FR')}</div>
                </div>
            ` : ''}
            ${game.winner ? `
                <div class="game-info-row">
                    <div class="game-info-label">Gagnant:</div>
                    <div>${game.winner}</div>
                </div>
            ` : ''}
        </div>
    `;
    
    // Ajouter la liste des joueurs si disponible
    if (game.players && game.players.length > 0) {
        content += `
            <h4>Joueurs (${game.players.length})</h4>
            <div class="player-list">
        `;
        
        game.players.forEach(player => {
            content += `
                <div class="player-row">
                    <div>
                        <span class="player-position">${player.position}</span>
                        ${player.username}
                    </div>
                    <div>${player.score} points</div>
                </div>
            `;
        });
        
        content += '</div>';
    } else {
        content += '<p>Aucun joueur dans cette partie.</p>';
    }
    
    modalBody.innerHTML = content;
}

// Afficher une erreur dans le modal
function showModalError(modal, errorMessage) {
    const modalBody = modal.querySelector('.modal-body');
    modalBody.innerHTML = `
        <div class="error">
            <p>Impossible de récupérer les détails de la partie.</p>
            <p>Erreur: ${errorMessage}</p>
        </div>
    `;
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
                adminId: currentAdmin.id,
                username: currentAdmin.username
            }));
            
            showSuccess('Tous les joueurs ont été déconnectés');
            setTimeout(() => {
                refreshActivePlayers();
                refreshActiveGames();
            }, 1000);
        } else {
            throw new Error('WebSocket admin non connecté');
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
                adminId: currentAdmin.id,
                username: currentAdmin.username
            }));
            
            showSuccess('Toutes les parties ont été terminées');
            setTimeout(refreshActiveGames, 1000);
        } else {
            throw new Error('WebSocket admin non connecté');
        }
        
    } catch (error) {
        console.error('❌ Erreur terminer toutes parties:', error);
        showError('Erreur lors de la terminaison massive');
    }
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
        'roundEnd': 'Fin de tour',
        'finished': 'Terminée'
    };
    return statusMap[status] || status;
}

function formatTime(date) {
    // Version sécurisée qui vérifie si l'input est bien une Date
    if (!(date instanceof Date) || isNaN(date.getTime())) {
        return "À l'instant";
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins}min`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    
    return date.toLocaleDateString('fr-FR');
}

function formatTimeFixed(timestamp) {
    // Pour gérer le cas où timestamp est un string ou un objet
    try {
        const date = new Date(timestamp);
        return formatTime(date);
    } catch (e) {
        return "À l'instant";
    }
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

// Variables globales
let activityLog = [];
const MAX_LOG_ENTRIES = 50; // Nombre maximum d'entrées dans le journal

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', function() {
  console.log("DOM chargé, initialisation des écouteurs...");
  
  // Ces éléments existent-ils lorsque ce code s'exécute?
  const logoutBtn = document.getElementById('logout-btn');
  console.log("Bouton de déconnexion trouvé:", logoutBtn);
  
  if (logoutBtn) {
    console.log("Ajout de l'écouteur d'événement au bouton de déconnexion");
    logoutBtn.addEventListener('click', logout);
  } else {
    console.error("❌ Bouton de déconnexion non trouvé dans le DOM");
  }
  
  // Actualiser le journal d'activités
  refreshActivityLog();
});

// Fonction pour afficher le journal d'activités
function refreshActivityLog() {
    console.log("📋 Actualisation du journal d'activités...");
    
    const activityContainer = document.getElementById('activity-log-container');
    if (!activityContainer) {
        console.error("❌ Container d'activités non trouvé");
        return;
    }
    
    activityContainer.innerHTML = '<div class="loading">Chargement des activités...</div>';
    
    fetch(`${API_URL}/admin/activity-log`, {
        headers: {
            'X-Admin-Username': currentAdmin.username
        }
    })
    .then(response => {
        console.log("📡 Réponse API activités:", response.status);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log("📊 Données activités reçues:", data);
        console.log("📊 Type des données:", typeof data);
        console.log("📊 Est un tableau:", Array.isArray(data));
        
        // Ton backend retourne directement le tableau activityLog
        if (Array.isArray(data)) {
            displayActivities(activityContainer, data);
        } else if (data.success && Array.isArray(data.activities)) {
            // Au cas où tu changes le format plus tard
            displayActivities(activityContainer, data.activities);
        } else {
            console.error("❌ Format de données inattendu:", data);
            throw new Error('Format de données incorrect');
        }
    })
    .catch(error => {
        console.error('❌ Erreur chargement activités:', error);
        activityContainer.innerHTML = `<div class="error">Erreur: ${error.message}</div>`;
        
        // Afficher des données de test après 2 secondes
        setTimeout(() => {
            showMockActivities(activityContainer);
        }, 2000);
    });
}
// Ajouter une nouvelle activité au log (pour les événements en temps réel si vous utilisez WebSockets)
function addActivityToLog(activity) {
    console.log("➕ Ajout activité en temps réel:", activity);
    
    const activityContainer = document.getElementById('activity-log-container');
    if (!activityContainer) return;
    
    // Créer l'élément
    const logItem = document.createElement('div');
    logItem.className = `log-item ${activity.type}-action new-activity`;
    
    const timeFormatted = formatTime(new Date(activity.timestamp));
    
    logItem.innerHTML = `
        <span class="log-time">${timeFormatted}</span>
        <span class="log-event">${activity.message}</span>
    `;
    
    // Ajouter au début de la liste existante
    const activityLogDiv = activityContainer.querySelector('.activity-log');
    if (activityLogDiv) {
        activityLogDiv.insertBefore(logItem, activityLogDiv.firstChild);
        
        // Animation pour la nouvelle activité
        logItem.style.backgroundColor = '#E6F2FF';
        setTimeout(() => {
            logItem.style.backgroundColor = '';
            logItem.classList.remove('new-activity');
        }, 2000);
        
        // Limiter le nombre d'entrées
        const items = activityLogDiv.querySelectorAll('.log-item');
        if (items.length > MAX_LOG_ENTRIES) {
            activityLogDiv.removeChild(items[items.length - 1]);
        }
    }
}

function displayActivities(container, activities) {
    console.log("🎭 Affichage des activités:", activities.length);
    
    if (!Array.isArray(activities) || activities.length === 0) {
        container.innerHTML = '<div class="no-data">Aucune activité récente</div>';
        return;
    }
    
    const activitiesHtml = activities.map(activity => {
        const timeFormatted = formatTime(new Date(activity.timestamp));
        const typeClass = activity.type || 'default';
        
        return `
            <div class="log-item ${typeClass}-action">
                <span class="log-time">${timeFormatted}</span>
                <span class="log-event">${activity.message}</span>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `
        <div class="activity-log">
            ${activitiesHtml}
        </div>
    `;
}

document.head.appendChild(style);