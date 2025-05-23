# Skribble - Jeu de Dessin Multijoueur

Un jeu de dessin en ligne inspiré de Skribbl.io où les joueurs doivent deviner ce que dessinent les autres participants en temps réel.

![Skribble Game](https://img.shields.io/badge/Status-En%20Développement-yellow)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 🎯 Description

Skribble est un jeu multijoueur en temps réel où :
- Un joueur dessine un mot choisi automatiquement
- Les autres joueurs tentent de deviner le mot dans un temps limité
- Chaque bonne réponse rapporte 100 points
- Le gagnant est celui qui accumule le plus de points à la fin de toutes les manches

## 🚀 Fonctionnalités

### 🎮 Côté Jeu
- **Dessin en temps réel** avec outils de dessin (crayon, gomme, formes géométriques)
- **Chat intégré** pour les interactions entre joueurs
- **Système de points** : 100 points par bonne réponse
- **Parties personnalisables** : 2, 3, 5 ou 10 manches
- **Temps de jeu modulable** : 60, 90 ou 120 secondes par manche
- **Interface responsive** pour tous types d'écrans

### 👤 Système Utilisateur
- **Inscription/Connexion** sécurisée avec mots de passe hashés
- **Tableau de bord personnel** avec statistiques
- **Historique des parties** jouées
- **Système d'administration** pour la gestion de la plateforme

### 🛡️ Interface Administrateur
- **Tableau de bord admin** avec statistiques en temps réel
- **Gestion des parties actives** (visualisation, terminaison forcée)
- **Gestion des joueurs connectés** (déconnexion forcée)
- **Journal d'activités** en temps réel (connexions, déconnexions, parties)
- **Actions rapides** (kick all, end all games)

## 🛠️ Stack Technique

### Backend
- **Runtime** : Deno
- **Framework** : Oak (équivalent Express pour Deno)
- **Base de données** : PostgreSQL
- **WebSockets** : Gestion temps réel des parties et de l'administration
- **Sécurité** : Bcrypt pour le hashage des mots de passe

### Frontend
- **HTML5 Canvas** pour le système de dessin
- **JavaScript ES6+** (vanilla, pas de framework)
- **CSS3** avec design responsive
- **WebSockets** pour les interactions temps réel

### Architecture
```
backend/
├── config/
│   └── server.ts          # Serveur principal Deno/Oak
└── ...

frontend/
├── index.html             # Page d'accueil
├── dashboard.html         # Tableau de bord utilisateur
├── admin_dashboard.html   # Interface administrateur
├── game.html             # Interface de jeu
└── assets/
    ├── css/
    │   ├── index.css
    │   ├── dashboard.css
    │   ├── admin-dashboard.css
    │   └── styleCommun.css
    └── js/
        ├── main.js
        ├── dashboard.js
        ├── admin_dashboard.js
        └── game.js
```

## 📋 Prérequis

- **Deno** (version 1.40+)
- **PostgreSQL** (version 12+)
- **Navigateur moderne** supportant HTML5 Canvas et WebSockets

## 🔧 Installation

### 1. Cloner le projet
```bash
git clone https://github.com/votre-username/skribble.git
cd skribble
```

### 2. Configuration de la base de données
```sql
-- Créer la base de données PostgreSQL
CREATE DATABASE skribble;

-- Se connecter à la base et créer les tables
\c skribble

-- Table des utilisateurs
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    isadmin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des parties
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    creator_id INTEGER REFERENCES users(id),
    total_rounds INTEGER DEFAULT 3,
    current_round INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'waiting',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP
);

-- Autres tables selon vos besoins...
```

### 3. Configuration des variables d'environnement
```bash
# Créer un fichier .env dans le dossier backend/config/
DB_HOST=localhost
DB_PORT=5432
DB_NAME=skribble
DB_USER=votre_user
DB_PASSWORD=votre_password
PORT=3000
WS_PORT=3001
```

### 4. Lancer le serveur backend
```bash
cd backend/config
deno run --allow-read --allow-net --allow-env --allow-write --watch server.ts
```

### 5. Servir le frontend
Vous pouvez utiliser n'importe quel serveur web local pour servir les fichiers frontend :

```bash
# Avec Python
cd frontend
python -m http.server 8080

# Avec Node.js (live-server)
cd frontend
npx live-server --port=8080

# Avec PHP
cd frontend
php -S localhost:8080
```

## 🎮 Utilisation

### Pour jouer
1. Accédez à `http://localhost:8080`
2. Créez un compte ou connectez-vous
3. Accédez au tableau de bord
4. Créez une nouvelle partie ou rejoignez une partie existante

### Pour administrer
1. Connectez-vous avec un compte administrateur
2. Accédez à `http://localhost:8080/admin_dashboard.html`
3. Surveillez les parties et joueurs en temps réel
4. Utilisez les outils d'administration selon vos besoins

## 📊 Fonctionnalités du Journal d'Activités

Le système de journal d'activités suit automatiquement :
- ✅ **Connexions** des utilisateurs
- ❌ **Déconnexions** des utilisateurs  
- 🎮 **Débuts de parties** avec créateur et ID
- 🏁 **Fins de parties** avec gagnant
- ⚙️ **Actions administratives** (kicks, terminaisons forcées)

## 🔐 Sécurité

- **Mots de passe hashés** avec bcrypt
- **Validation côté serveur** pour toutes les entrées
- **Protection CORS** configurée
- **Système de rôles** (utilisateur/administrateur)
- **Validation des sessions** pour les actions sensibles

## 🚀 Fonctionnalités Futures

### 🧪 Modes de Jeu Spéciaux (Prévus)
- **Mode Rapide** : 30 secondes par dessin
- **Mode "Mot Complexe"** : uniquement des mots difficiles
- **Mode Mystère** : dessiner un mot que vous ne connaissez pas

### 🎨 Améliorations Graphiques
- **Outils de dessin avancés** (brush patterns, textures)
- **Animations** et effets visuels
- **Thèmes personnalisables**

### 📈 Statistiques Avancées
- **Classements globaux**
- **Badges et achievements**
- **Historique détaillé** des performances

## 📝 API Documentation

### Authentification
```typescript
POST /api/login
Body: { username: string, password: string }
Response: { success: boolean, user: User }

POST /api/logout  
Body: { username: string }
Response: { success: boolean }
```

### Administration
```typescript
GET /api/admin/activity-log
Response: Activity[]

GET /api/admin/stats
Response: { activeGames: number, activePlayers: number, ... }

GET /api/admin/active-games
Response: { success: boolean, games: Game[] }

GET /api/admin/active-players
Response: { success: boolean, players: Player[] }
```

## 🐛 Dépannage

### Problème de connexion WebSocket
- Vérifiez que le port 3001 est libre
- Assurez-vous que le firewall autorise les connexions WebSocket

### Erreurs de base de données
- Vérifiez la configuration dans le fichier .env
- Assurez-vous que PostgreSQL est démarré
- Vérifiez les permissions de l'utilisateur de base de données

### Problèmes de CORS
- Vérifiez que les domaines frontend et backend sont correctement configurés
- Assurez-vous que les en-têtes CORS sont activés sur le serveur

## 📄 License

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

## 👥 Équipe

- **Développeur Principal** : FABRE Julien
