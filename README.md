# Skribble - Jeu de Dessin Multijoueur

Un jeu de dessin en ligne inspiré de Skribbl.io où les joueurs doivent deviner ce que dessinent les autres participants en temps réel.

##  Description

Skribble est un jeu multijoueur en temps réel où :
- Un joueur dessine un mot choisi automatiquement
- Les autres joueurs tentent de deviner le mot dans un temps limité  
- Chaque bonne réponse rapporte 100 points
- Le gagnant est celui qui accumule le plus de points à la fin de toutes les manches

Le jeu propose une interface de dessin complète avec chat intégré, un système d'administration, et un tableau de bord personnel pour suivre ses statistiques.

##  Fonctionnalités

###  Système de Jeu
- **Dessin temps réel** : Canvas HTML5 avec outils variés (crayon, gomme, formes)
- **Chat intégré** : Communication entre joueurs pendant les parties
- **Système de points** : 100 points par bonne réponse
- **Parties configurables** : 2, 3, 5 ou 10 manches au choix
- **Temps modulable** : 60, 90 ou 120 secondes par manche
- **Outils de dessin** : Annulation, effacement, palette de couleurs

###  Gestion Utilisateur
- **Authentification sécurisée** : Inscription/connexion avec hashage bcrypt
- **Tableau de bord personnel** : Statistiques et historique des parties
- **Profils utilisateur** : Suivi des performances individuelles
- **Historique complet** : Consultation des parties passées

###  Interface Administrateur
- **Dashboard admin temps réel** : Surveillance globale de la plateforme
- **Gestion des parties** : Visualisation et terminaison forcée
- **Gestion des joueurs** : Déconnexion et modération
- **Journal d'activités** : Logs de toutes les actions importantes
- **Actions groupées** : Kick all, end all games

##  Limitations Actuelles

- **Maximum 2 joueurs** par partie (pas de support multijoueur étendu)
- **Dictionnaire limité** : Environ 50 mots disponibles
- **Pas de catégories** : Tous types de mots mélangés
- **Interface desktop** : Non optimisé pour mobile/tablette
- **Synchronisation imparfaite** : L'annulation ne se synchronise pas toujours
- **Gestion des déconnexions** : Parties bloquées en cas de déconnexion brutale

##  Améliorations Souhaitées

###  Multijoueur Étendu
- **Parties 3-8 joueurs** avec salles d'attente
- **Modes équipe** : 2v2, 3v3 avec scores collectifs
- **Système de spectateurs** pour regarder les parties
- **Salons privés** avec codes d'accès

###  Nouveaux Modes de Jeu
- **Mode Rapide** : 30 secondes par dessin
- **Mode Thématique** : Parties sur des sujets spécifiques
- **Mode Mystère** : Le dessinateur ne connaît pas le mot
- **Mode Relais** : Dessins collaboratifs en chaîne

###  Outils Avancés
- **Palettes étendues** avec couleurs personnalisées
- **Pinceaux texturés** : aquarelle, crayon, marqueur
- **Système de calques** pour dessins complexes
- **Outils géométriques** : ellipses, polygones, courbes

###  Optimisation Mobile
- **Interface tactile** pour smartphones/tablettes
- **Contrôles gestuels** : zoom, navigation tactile
- **Mode portrait/paysage** adaptatif

##  Difficultés Rencontrées

###  Défis Techniques
- **Synchronisation canvas** : Maintenir la cohérence entre tous les clients
- **WebSockets complexes** : Gestion des connexions multiples et déconnexions
- **Performance temps réel** : Optimiser le rendu pour les dessins complexes
- **Architecture scalable** : Concevoir pour plus de joueurs simultanés

###  Défis de Déploiement
- **Configuration serveur** : Gestion des certificats HTTPS et WebSockets
- **Base de données** : Setup PostgreSQL et migrations
- **Variables d'environnement** : Configuration multi-environnements
- **Monitoring** : Surveillance des performances en production

##  Fonctionnalités Sociales

- **Système d'amis** : Ajouter et défier ses contacts
- **Classements globaux** : Leaderboards mensuels et annuels  
- **Profils personnalisés** : Avatars et statistiques détaillées
- **Galerie communautaire** : Partage des meilleurs dessins
- **Système de badges** : Récompenses pour accomplissements
- **Replay system** : Revoir les parties passées
- **Chat vocal** : Communication audio entre joueurs
- **Modération automatique** : Détection de contenu inapproprié

##  Architecture

```
Projet Skribble/
├── backend/
│   ├── config/
│   │   ├── server.ts           # Serveur principal API + WebSocket
│   │   └── database.ts         # Configuration PostgreSQL
│   └── ...
├── frontend/
│   ├── server.ts               # Serveur statique HTTPS
│   ├── index.html              # Page de connexion
│   ├── dashboard.html          # Tableau de bord utilisateur
│   ├── game.html              # Interface de jeu
│   ├── admin_dashboard.html    # Interface administrateur
│   └── assets/
│       ├── css/               # Styles CSS
│       └── js/                # Scripts JavaScript
└── .vscode/
    └── tasks.json             # Automatisation VS Code
```

**Stack Technique :**
- **Backend** : Deno + Oak + PostgreSQL + WebSockets
- **Frontend** : HTML5 Canvas + JavaScript Vanilla + CSS3
- **Temps réel** : WebSockets pour synchronisation
- **Sécurité** : HTTPS + Bcrypt + CORS

##  Prérequis

- **Deno** (version 1.40+)
- **PostgreSQL** (version 12+)
- **Navigateur moderne** (Chrome, Firefox, Safari, Edge)
- **VS Code** (recommandé pour l'automatisation)

##  Base de Données

Le projet utilise **PostgreSQL** avec 5 tables principales :

1. **`users`** - Gestion des comptes utilisateurs et administrateurs
2. **`games`** - Partie dans lesquelle jouent les joueurs
3. **`user_stats`** - Statistiques des joueurs au fil du temps
4. **`words`** - Listes de mots aléatoire
5. **`player_scores`** - Scores des parties des joueurs

##  Automatisation avec tasks.json

Le projet inclut une configuration VS Code pour automatiser le lancement :

- **Ouvrir VS Code** → `Ctrl+Shift+P` → "Tasks: Run Task"
- **3 tâches disponibles** :
  - `Start Backend` : Lance le serveur API
  - `Start Frontend` : Lance le serveur web
  - `Start Both` : Lance les deux simultanément
- **Rechargement automatique** avec le flag `--watch`
- **Terminaux séparés** pour backend et frontend

##  Comment Jouer

### Première Utilisation
1. **Accéder** à `https://localhost:8443`
2. **Créer un compte** ou se connecter
3. **Tableau de bord** : Choisir "Lancer une nouvelle partie" ou "Rejoindre"
4. **Configurer** : Nombre de rounds (2-10) et temps par round (60-120s)
5. **Attendre** qu'un autre joueur rejoigne la partie

### Pendant le Jeu
- **Dessinateur** : Dessiner le mot affiché dans le temps imparti
- **Devineur** : Taper les réponses dans le chat
- **Points** : 100 points par bonne réponse
- **Alternance** : Les rôles changent à chaque round

### Outils de Dessin
- **Crayon** : Dessin libre
- **Gomme** : Effacer des zones
- **Formes** : Rectangle, cercle, ligne
- **Couleurs** : Palette de couleurs
- **Actions** : Annuler, Effacer tout (dessinateur uniquement)

##  Interface Administrateur

### Accès Admin
1. **Compte administrateur** requis (flag `isadmin = true` en BDD)
2. **Accéder** à `/admin_dashboard.html`
3. **Dashboard temps réel** avec WebSocket

### Fonctionnalités Admin
- **Statistiques live** : Joueurs connectés, parties actives
- **Gestion des parties** : Voir détails, terminer de force
- **Gestion des joueurs** : Déconnecter, bannir temporairement
- **Journal d'activités** : Historique de toutes les actions
- **Actions d'urgence** : Kick all players, End all games

##  Sécurité

### Authentification
- **Hashage bcrypt** : Mots de passe sécurisés (salt + rounds)
- **Sessions serveur** : Validation côté backend
- **Validation stricte** : Contrôles d'entrée sur toutes les données

### Communications
- **HTTPS obligatoire** : Certificats SSL/TLS
- **WebSockets sécurisés** : WSS pour temps réel
- **CORS configuré** : Protection contre les requêtes malveillantes

### Administration
- **Rôles utilisateur** : Séparation user/admin
- **Logs d'audit** : Traçabilité de toutes les actions admin
- **Validation permissions** : Vérification des droits à chaque action

---


**Développeur Principal** : FABRE Julien

*Projet développé dans le cadre de l'apprentissage des technologies web modernes et de la programmation temps réel.*
