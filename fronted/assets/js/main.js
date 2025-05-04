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
  
  // Bouton de test API
  const testApiBtn = document.getElementById('test-api');
  const apiResult = document.getElementById('api-result');
  
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
  
  // Tester l'API
  testApiBtn.addEventListener('click', async function() {
      try {
          apiResult.style.display = 'block';
          apiResult.textContent = 'Chargement...';
          
          // Utiliser une route qui existe réellement dans votre serveur
          const response = await fetch(`${API_URL}/words`);
          
          if (!response.ok) {
              throw new Error(`Erreur HTTP: ${response.status}`);
          }
          
          const data = await response.json();
          apiResult.textContent = `Réponse du serveur: ${data.length} mots trouvés`;
          apiResult.style.color = 'green';
          
          // Tester la connexion WebSocket
          testWebSocket();
          
      } catch (error) {
          console.error('Erreur lors du test de l\'API:', error);
          apiResult.textContent = `Erreur: Impossible de contacter le serveur. Vérifiez que le backend est en cours d'exécution.`;
          apiResult.style.color = 'red';
      }
  });
  
  function testWebSocket() {
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log("Connexion WebSocket établie");

      // Envoyer un message au serveur
      ws.send("Bonjour depuis le frontend!");
    };

    ws.onmessage = (event) => {
      console.log("Message reçu du serveur :", event.data);
    };

    ws.onerror = (error) => {
      console.error("Erreur WebSocket :", error);
    };

    ws.onclose = () => {
      console.log("Connexion WebSocket fermée");
    };
  }

  // Formulaire de connexion
  const loginForm = document.getElementById('login-form');
  loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const username = document.getElementById('login-username').value;
      const password = document.getElementById('login-password').value;
      
      // Maintenant on peut implémenter la connexion
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
          
          const data = await response.json();
          
          if (!response.ok) {
              throw new Error(data.error || "Erreur lors de la connexion");
          }
          
          alert("Connexion réussie!");
          // Rediriger ou mettre à jour l'interface
          
      } catch (error) {
          console.error("Erreur lors de la connexion:", error);
          alert(error.message);
      }
  });
  
  // Formulaire d'inscription
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
    
        // Assurer que les données sont bien formatées
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
    
        // Log de la réponse brute pour debug
        const responseText = await response.text();
        console.log("Réponse brute du serveur:", responseText);
        
        // On tente de parser la réponse en JSON
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
      } catch (error) {
        console.error("Erreur lors de l'inscription :", error);
        alert(error.message);
      }
  }
});