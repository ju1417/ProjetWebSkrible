// Variables globales
let currentUser = null;
const API_URL = 'http://localhost:3000/api';

// Initialisation au chargement de la page - VERSION CORRIGÉE
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initialisation du dashboard...');
    
    // Vérifier si l'utilisateur est connecté AVANT tout
    if (!checkAuthentication()) {
        return;
    }
    
    // ✅ MAINTENANT currentUser est défini - Nettoyer les anciens paramètres
    cleanupOldGameSettings();
    
    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Charger les données utilisateur
    loadUserData();
});

// Vérifier l'authentification - INCHANGÉ
function checkAuthentication() {
    console.log('🔐 Vérification authentification...');
    
    // Récupérer les infos utilisateur depuis le localStorage
    const userData = localStorage.getItem('currentUser');
    console.log('Données localStorage:', userData);
    
    if (!userData) {
        console.error('❌ Aucune donnée utilisateur trouvée');
        alert('Vous devez être connecté pour accéder au dashboard');
        window.location.href = 'index.html';
        return false;
    }
    
    try {
        currentUser = JSON.parse(userData);
        console.log('✅ Utilisateur récupéré:', currentUser);
        
        // Vérifier que l'utilisateur a un nom
        if (!currentUser.username) {
            throw new Error('Nom d\'utilisateur manquant');
        }
        
        // Afficher le nom d'utilisateur
        const userNameElement = document.getElementById('user-name');
        if (userNameElement) {
            userNameElement.textContent = currentUser.username;
            console.log('✅ Nom affiché:', currentUser.username);
        } else {
            console.error('❌ Élément user-name non trouvé');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Erreur parsing données utilisateur:', error);
        alert('Erreur de données utilisateur. Reconnectez-vous.');
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
        return false;
    }
}

// ✅ NOUVELLE FONCTION : Nettoyage sécurisé des paramètres
function cleanupOldGameSettings() {
    if (!currentUser || !currentUser.username) {
        console.log('⚠️ Pas d\'utilisateur défini, skip nettoyage');
        return;
    }
    
    const userStorageKey = `gameSettings_${currentUser.username}`;
    console.log('🧹 Nettoyage pour utilisateur:', currentUser.username);
    
    // Voir tous les gameSettings avant nettoyage
    const allKeys = Object.keys(sessionStorage);
    const gameSettingsKeys = allKeys.filter(key => key.startsWith('gameSettings_'));
    console.log('📱 GameSettings trouvés:', gameSettingsKeys);
    
    // Nettoyer les paramètres de CET utilisateur
    if (sessionStorage.getItem(userStorageKey)) {
        sessionStorage.removeItem(userStorageKey);
        console.log('✅ Supprimé:', userStorageKey);
    }
    
    // ✅ BONUS : Nettoyer TOUS les autres gameSettings (évite les conflits)
    gameSettingsKeys.forEach(key => {
        if (key !== userStorageKey) {
            sessionStorage.removeItem(key);
            console.log('🧹 Supprimé gameSettings orphelin:', key);
        }
    });
    
    console.log('✅ Nettoyage terminé pour', currentUser.username);
}

// Configuration des écouteurs d'événements - INCHANGÉ
function setupEventListeners() {
    console.log('🎯 Configuration des écouteurs...');
    
    // Bouton déconnexion
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
        console.log('✅ Écouteur déconnexion ajouté');
    } else {
        console.error('❌ Bouton logout non trouvé');
    }
    
    // Bouton lancer une partie
    const startGameBtn = document.getElementById('start-game-btn');
    if (startGameBtn) {
        startGameBtn.addEventListener('click', startNewGame);
        console.log('✅ Écouteur nouvelle partie ajouté');
    } else {
        console.error('❌ Bouton start-game non trouvé');
    }
    
    // Bouton rejoindre une partie
    const joinGameBtn = document.getElementById('join-game-btn');
    if (joinGameBtn) {
        joinGameBtn.addEventListener('click', joinExistingGame);
        console.log('✅ Écouteur rejoindre partie ajouté');
    } else {
        console.error('❌ Bouton join-game non trouvé');
    }
    
    // Bouton voir tout l'historique
    const viewAllHistoryBtn = document.getElementById('view-all-history');
    if (viewAllHistoryBtn) {
        viewAllHistoryBtn.addEventListener('click', viewAllHistory);
        console.log('✅ Écouteur historique ajouté');
    } else {
        console.error('❌ Bouton view-all-history non trouvé');
    }
}

// Fonction de déconnexion 
function logout() {
  console.log('🚪 Déconnexion...');
  
  if (!confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
    return;
  }
  
  // Récupérer les informations utilisateur
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
  const username = currentUser.username;
  
  if (username) {
    console.log('📤 Envoi beacon de déconnexion...');
    
    // Créer les données à envoyer
    const logoutData = JSON.stringify({ username });
    
    // Utiliser sendBeacon pour envoyer la requête même si la page se redirige
    const beaconSent = navigator.sendBeacon(
      '/api/logout', 
      new Blob([logoutData], { type: 'application/json' })
    );
    
    console.log('📤 Beacon envoyé:', beaconSent);
  }
  
  // Nettoyer et rediriger
  console.log('🧹 Nettoyage local et redirection...');
  sessionStorage.clear();
  localStorage.removeItem('currentUser');
  window.location.href = 'index.html';
}

// Lancer une nouvelle partie - AVEC LOGS DÉTAILLÉS
function startNewGame() {
    console.log('========================================');
    console.log('🎮 LANCEMENT NOUVELLE PARTIE');
    console.log(`👤 Créateur: ${currentUser.username}`);
    console.log('========================================');
    
    const rounds = document.getElementById('rounds-select').value;
    const timePerRound = document.getElementById('time-select').value;
    
    console.log(`📝 Paramètres sélectionnés:`);
    console.log(`   - Rounds: ${rounds}`);
    console.log(`   - Temps par round: ${timePerRound}s`);
    
    // ✅ Clé unique par utilisateur
    const storageKey = `gameSettings_${currentUser.username}`;
    
    const gameSettings = {
        isGameCreator: true,           // ✅ CRÉATEUR
        totalRounds: parseInt(rounds),
        timePerRound: parseInt(timePerRound),
        roomCode: null,
        username: currentUser.username,
        timestamp: Date.now()
    };
    
    console.log('💾 Clé de stockage:', storageKey);
    console.log('💾 Paramètres à sauvegarder:', gameSettings);
    
    // Sauvegarder avec une clé spécifique à l'utilisateur
    sessionStorage.setItem(storageKey, JSON.stringify(gameSettings));
    
    // ✅ Vérification immédiate avec logs détaillés
    const verification = JSON.parse(sessionStorage.getItem(storageKey));
    console.log('🔍 Vérification immédiate:', verification);
    console.log(`   - isGameCreator: ${verification.isGameCreator} (type: ${typeof verification.isGameCreator})`);
    console.log(`   - username: ${verification.username}`);
    console.log(`   - timestamp: ${new Date(verification.timestamp)}`);
    
    console.log('🔄 Redirection vers game.html...');
    console.log('========================================');
    
    // Rediriger vers la page de jeu
    window.location.href = 'game.html';
}

// Rejoindre une partie existante - AVEC LOGS DÉTAILLÉS
function joinExistingGame() {
    console.log('========================================');
    console.log('👥 REJOINDRE PARTIE EXISTANTE');
    console.log(`👤 Joueur: ${currentUser.username}`);
    console.log('========================================');
    
    const roomCode = document.getElementById('room-code').value.trim();
    console.log(`🏠 Code room: "${roomCode}"`);
    
    // ✅ Clé unique par utilisateur
    const storageKey = `gameSettings_${currentUser.username}`;
    
    const gameSettings = {
        isGameCreator: false,          // ✅ PAS CRÉATEUR
        totalRounds: null,
        timePerRound: null,
        roomCode: roomCode || null,
        username: currentUser.username,
        timestamp: Date.now()
    };
    
    console.log('💾 Clé de stockage:', storageKey);
    console.log('💾 Paramètres à sauvegarder:', gameSettings);
    
    // Sauvegarder avec une clé spécifique à l'utilisateur
    sessionStorage.setItem(storageKey, JSON.stringify(gameSettings));
    
    // ✅ Vérification immédiate avec logs détaillés
    const verification = JSON.parse(sessionStorage.getItem(storageKey));
    console.log('🔍 Vérification immédiate:', verification);
    console.log(`   - isGameCreator: ${verification.isGameCreator} (type: ${typeof verification.isGameCreator})`);
    console.log(`   - username: ${verification.username}`);
    console.log(`   - timestamp: ${new Date(verification.timestamp)}`);
    
    console.log('🔄 Redirection vers game.html...');
    console.log('========================================');
    
    // Rediriger vers la page de jeu
    window.location.href = 'game.html';
}


// Rejoindre une partie existante
function joinExistingGame() {
    console.log('========================================');
    console.log('👥 REJOINDRE PARTIE EXISTANTE');
    console.log(`👤 Joueur: ${currentUser.username}`);
    console.log('========================================');
    
    const roomCode = document.getElementById('room-code').value.trim();
    
    // ✅ SOLUTION : Clé unique par utilisateur
    const storageKey = `gameSettings_${currentUser.username}`;
    
    const gameSettings = {
        isGameCreator: false,
        totalRounds: null,
        timePerRound: null,
        roomCode: roomCode || null,
        username: currentUser.username,
        timestamp: Date.now()
    };
    
    console.log('💾 Clé de stockage:', storageKey);
    console.log('💾 Paramètres à sauvegarder:', gameSettings);
    
    // ✅ Sauvegarder avec une clé spécifique à l'utilisateur
    sessionStorage.setItem(storageKey, JSON.stringify(gameSettings));
    
    // Vérification
    const verification = JSON.parse(sessionStorage.getItem(storageKey));
    console.log('🔍 Vérification:', verification);
    
    console.log('🔄 Redirection vers game.html...');
    window.location.href = 'game.html';
}

// Charger les données utilisateur
async function loadUserData() {
    console.log('📊 Chargement des données utilisateur...');
    
    try {
        // Charger les statistiques utilisateur
        await loadUserStats();
        
        // Charger l'historique des parties
        await loadRecentGames();
        
    } catch (error) {
        console.error('❌ Erreur lors du chargement des données:', error);
        showError('Erreur lors du chargement des données : ' + error.message);
        
        // Afficher des valeurs par défaut pour que l'interface reste utilisable
        setDefaultStats();
        setDefaultHistory();
    }
}

// Charger les statistiques utilisateur
async function loadUserStats() {
    try {
        console.log('📊 Chargement des vraies statistiques...');
        
        // Vérifier que nous avons l'ID utilisateur
        if (!currentUser || !currentUser.id) {
            console.log('ℹ️ Pas d\'ID utilisateur, utilisation de stats par défaut');
            setDefaultStats();
            return;
        }
        
        // Récupérer les statistiques depuis l'API
        const response = await fetch(`${API_URL}/user/${currentUser.id}/stats`);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const stats = await response.json();
        console.log('✅ Statistiques reçues:', stats);
        
        // Mettre à jour l'affichage
        updateStatDisplay('games-played', stats.games_played);
        updateStatDisplay('best-score', stats.best_score);
        updateStatDisplay('words-guessed', stats.words_guessed);
        updateStatDisplay('win-rate', stats.win_rate + '%');
        
    } catch (error) {
        console.error('❌ Erreur chargement stats:', error);
        setDefaultStats();
        showError('Impossible de charger les statistiques');
    }
}

// Charger l'historique des parties
async function loadRecentGames() {
    try {
        console.log('📜 Chargement de l\'historique...');
        
        // Vérifier que nous avons l'ID utilisateur
        if (!currentUser || !currentUser.id) {
            console.log('ℹ️ Pas d\'ID utilisateur, historique par défaut');
            setDefaultHistory();
            return;
        }
        
        // Récupérer l'historique depuis l'API
        const response = await fetch(`${API_URL}/user/${currentUser.id}/history?limit=5`);
        
        if (!response.ok) {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
        
        const data = await response.json();
        const games = data.history;
        
        console.log('✅ Historique reçu:', games);
        
        const historyContainer = document.getElementById('recent-games');
        if (!historyContainer) {
            console.error('❌ Container historique non trouvé');
            return;
        }
        
        historyContainer.innerHTML = '';
        
        if (games.length === 0) {
            historyContainer.innerHTML = '<p class="loading">Aucune partie jouée pour le moment. Lancez votre première partie !</p>';
            return;
        }
        
        // Afficher les parties
        games.forEach((game, index) => {
            const gameElement = createGameHistoryElement(game);
            historyContainer.appendChild(gameElement);
            
            // Animation d'apparition
            setTimeout(() => {
                gameElement.style.transition = 'all 0.3s ease';
                gameElement.style.opacity = '1';
                gameElement.style.transform = 'translateY(0)';
            }, index * 100);
        });
        
    } catch (error) {
        console.error('❌ Erreur historique:', error);
        setDefaultHistory();
    }
}

// Fonctions utilitaires
function updateStatDisplay(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = value;
    } else {
        console.error(`❌ Élément stat non trouvé: ${elementId}`);
    }
}

function setDefaultStats() {
    console.log('📊 Affichage des stats par défaut');
    updateStatDisplay('games-played', '0');
    updateStatDisplay('best-score', '0');
    updateStatDisplay('words-guessed', '0');
    updateStatDisplay('win-rate', '0%');
}

function setDefaultHistory() {
    console.log('📜 Affichage de l\'historique par défaut');
    const historyContainer = document.getElementById('recent-games');
    if (historyContainer) {
        historyContainer.innerHTML = '<p class="loading">Aucune partie jouée pour le moment. Lancez votre première partie !</p>';
    }
}

function createGameHistoryElement(game) {
    const gameElement = document.createElement('div');
    gameElement.className = 'game-history-item';
    gameElement.style.opacity = '0';
    gameElement.style.transform = 'translateY(20px)';
    
    // Déterminer la position
    let positionClass = '';
    let positionIcon = '';
    switch(game.position) {
        case 1:
            positionClass = 'first-place';
            positionIcon = '🥇';
            break;
        case 2:
            positionClass = 'second-place';
            positionIcon = '🥈';
            break;
        case 3:
            positionClass = 'third-place';
            positionIcon = '🥉';
            break;
        default:
            positionClass = 'other-place';
            positionIcon = `#${game.position}`;
    }
    
    const approxDuration = `${(game.rounds || 3) * 2} min`;
    
    gameElement.innerHTML = `
        <div class="game-date">${formatDate(new Date(game.date))}</div>
        <div class="game-score">Score: ${game.score}</div>
        <div class="game-position ${positionClass}">${positionIcon}</div>
        <div class="game-details">${game.totalPlayers || 'N/A'} joueurs • ${approxDuration}</div>
    `;
    
    return gameElement;
}

// Voir tout l'historique
async function viewAllHistory() {
    alert('Fonctionnalité historique complet - À développer');
}

// Utilitaires
function formatDate(date) {
    return date.toLocaleDateString('fr-FR', { 
        day: 'numeric', 
        month: 'short',
        year: 'numeric'
    });
}

function showError(message) {
    console.log('⚠️ Affichage erreur:', message);
    
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background-color: #f8d7da;
        color: #721c24;
        padding: 15px;
        border-radius: 5px;
        border: 1px solid #f5c6cb;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    `;
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => errorDiv.remove(), 5000);
}