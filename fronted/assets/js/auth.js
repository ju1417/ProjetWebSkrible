// FICHIER : assets/js/auth.js
// ===========================

// Configuration (même que vos autres fichiers)
function getConfig() {
    const hostname = window.location.hostname;
    const isProduction = hostname.includes('cluster-ig3.igpolytech.fr');
    
    if (isProduction) {
        return {
            API_URL: 'https://skribble-julien-api.cluster-ig3.igpolytech.fr/api',
            WS_URL: 'wss://skribble-julien-api.cluster-ig3.igpolytech.fr'
        };
    } else {
        const isHTTPS = window.location.protocol === 'https:';
        return {
            API_URL: isHTTPS ? 'https://localhost:3443/api' : 'http://localhost:3000/api',
            WS_URL: isHTTPS ? 'wss://localhost:3001' : 'ws://localhost:3001'
        };
    }
}

const CONFIG = getConfig();
const API_URL = CONFIG.API_URL;

// Fonction principale de connexion
async function login(username, password) {
    try {
        console.log('🔐 Tentative de connexion pour:', username);
        
        showLoadingIndicator(true);
        
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                username: username.trim(), 
                password: password 
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.user) {
            console.log('✅ Connexion réussie pour:', data.user.username);
            
            // Créer un token simple côté client
            const tokenData = {
                user: {
                    id: data.user.id,
                    username: data.user.username,
                    isadmin: data.user.isadmin || false
                },
                timestamp: Date.now(),
                expires: Date.now() + (24 * 60 * 60 * 1000) // 24 heures
            };
            
            const token = btoa(JSON.stringify(tokenData));
            
            // Stocker le token
            localStorage.setItem('authToken', token);
            localStorage.removeItem('currentUser');
            
            console.log('💾 Token créé et stocké avec succès');
            
            showLoadingIndicator(false);
            
            // Redirection selon le type d'utilisateur
            if (tokenData.user.isadmin) {
                console.log('👨‍💼 Redirection vers dashboard admin');
                window.location.href = 'admin-dashboard.html';
            } else {
                console.log('👤 Redirection vers dashboard utilisateur');
                window.location.href = 'dashboard.html';
            }
            
            return true;
            
        } else {
            throw new Error(data.error || 'Identifiants incorrects');
        }
        
    } catch (error) {
        console.error('❌ Erreur lors de la connexion:', error);
        showLoadingIndicator(false);
        showError(error.message || 'Erreur de connexion. Vérifiez vos identifiants.');
        return false;
    }
}

// Fonctions utilitaires
function showLoadingIndicator(show) {
    const submitBtn = document.querySelector('button[type="submit"]') || 
                     document.querySelector('#login-btn') ||
                     document.querySelector('.login-btn');
    
    if (submitBtn) {
        if (show) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Connexion...';
            submitBtn.style.opacity = '0.6';
        } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Se connecter';
            submitBtn.style.opacity = '1';
        }
    }
}

function showError(message) {
    console.log('⚠️ Affichage erreur:', message);
    alert(message);
}

// Vérifier si déjà connecté
function checkIfAlreadyLoggedIn() {
    const token = localStorage.getItem('authToken');
    
    if (token) {
        try {
            const tokenData = JSON.parse(atob(token));
            
            if (Date.now() < tokenData.expires) {
                console.log('👤 Utilisateur déjà connecté:', tokenData.user.username);
                
                if (tokenData.user.isadmin) {
                    window.location.href = 'admin-dashboard.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
                return true;
            } else {
                localStorage.removeItem('authToken');
                console.log('⏰ Token expiré, supprimé');
            }
        } catch (error) {
            localStorage.removeItem('authToken');
            console.log('💀 Token corrompu, supprimé');
        }
    }
    
    return false;
}

// Initialisation automatique
document.addEventListener('DOMContentLoaded', function() {
    console.log('🔐 Initialisation système d\'authentification...');
    
    // Vérifier si déjà connecté
    if (checkIfAlreadyLoggedIn()) {
        return;
    }
    
    // Configurer le formulaire de connexion
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('📝 Formulaire de connexion trouvé');
        
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            if (!username || !password) {
                showError('Veuillez remplir tous les champs');
                return;
            }
            
            await login(username, password);
        });
    } else {
        console.log('ℹ️ Pas de formulaire de connexion sur cette page');
    }
});