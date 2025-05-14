document.addEventListener('DOMContentLoaded', function() {
  // Configuration de l'API - URL corrigée
  const API_URL = 'http://localhost:3000/api'; 
  const WS_URL = 'ws://localhost:3001';

  // Éléments de navigation
  const navHome = document.getElementById('nav-home');
  const navLogin = document.getElementById('nav-login');
  const navRegister = document.getElementById('nav-register');
  
  // Sections
  const homeSection = document.getElementById('home-section');
  const loginSection = document.getElementById('login-section');
  const registerSection = document.getElementById('register-section');
  
  // Fonctions de navigation
  function showSection(section) {
      // Cacher toutes les sections
      [homeSection, loginSection, registerSection].forEach(s => {
          s.classList.remove('section-active');
          s.classList.add('section-hidden');
      });
      
      // Afficher la section demandée
      section.classList.remove('section-hidden');
      section.classList.add('section-active');
  }
  
  // Mettre à jour le menu actif
  function updateActiveNav(activeNav) {
      [navHome, navLogin, navRegister].forEach(nav => {
          nav.classList.remove('active');
      });
      activeNav.classList.add('active');
  }
  
  // Gestionnaires d'événements pour la navigation
  navHome.addEventListener('click', function(e) {
      e.preventDefault();
      showSection(homeSection);
      updateActiveNav(navHome);
  });
  
  navLogin.addEventListener('click', function(e) {
      e.preventDefault();
      showSection(loginSection);
      updateActiveNav(navLogin);
  });
  
  navRegister.addEventListener('click', function(e) {
      e.preventDefault();
      showSection(registerSection);
      updateActiveNav(navRegister);
  });

  // Formulaire de connexion (avec la version debuggée)
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      
      console.log("Tentative de connexion pour:", username);
      
      try {
          const response = await fetch(`${API_URL}/login`, {
              method: "POST",
              headers: { 
                  "Content-Type": "application/json" 
              },
              body: JSON.stringify({
                  username: username.trim(),
                  password: password.trim()
              })
          });
          
          console.log("Statut de la réponse:", response.status);
          
          const data = await response.json();
          console.log("Données reçues du serveur:", data);
          
          if (!response.ok) {
              throw new Error(data.error || "Erreur lors de la connexion");
          }
          
          // Vérifier que les données utilisateur existent
          if (!data.user || !data.user.username) {
              throw new Error("Données utilisateur manquantes dans la réponse");
          }
          
          console.log("Sauvegarde des données utilisateur:", data.user);
          
          // Sauvegarder les infos utilisateur
          localStorage.setItem('currentUser', JSON.stringify({
              username: data.user.username,
              id: data.user.id
          }));
          
          // Vérifier que la sauvegarde a fonctionné
          const savedUser = localStorage.getItem('currentUser');
          console.log("Données sauvegardées:", savedUser);
          
          // Rediriger vers le dashboard
          console.log("Redirection vers dashboard.html");
          window.location.href = 'dashboard.html';
          
      } catch (error) {
          console.error("Erreur lors de la connexion:", error);
          alert("Erreur: " + error.message);
      }
  });
  
  // Formulaire d'inscription (gardez votre code existant)
  const registerForm = document.getElementById('register-form');
  registerForm.addEventListener('submit', async function (e) {
    e.preventDefault();

    const username = document.getElementById('register-username').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-confirm-password').value;

    console.log("Valeurs récupérées :", { username, password, confirmPassword });

    if (password !== confirmPassword) {
      alert('Les mots de passe ne correspondent pas.');
      return;
    }

    await registerUser(username, password);
  });

  async function registerUser(username, password) {
      try {
        console.log("Données envoyées au backend :", { username, password });
    
        const userData = {
          username: username.trim(),
          password: password.trim()
        };
    
        const response = await fetch(`${API_URL}/register`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json" 
          },
          body: JSON.stringify(userData)
        });
    
        const responseText = await response.text();
        console.log("Réponse brute du serveur:", responseText);
        
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (e) {
          console.error("Erreur parsing réponse JSON:", e);
          throw new Error("Format de réponse invalide du serveur");
        }
    
        if (!response.ok) {
          throw new Error(data.error || "Erreur lors de l'inscription.");
        }
    
        alert(data.message || "Inscription réussie!");
        
        // Après inscription réussie, passer à la section connexion
        showSection(loginSection);
        updateActiveNav(navLogin);
        
      } catch (error) {
        console.error("Erreur lors de l'inscription :", error);
        alert(error.message);
      }
  }
});