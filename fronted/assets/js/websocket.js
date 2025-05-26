/**
 * Initialise une connexion WebSocket
 * @param {string} url - L'URL du serveur WebSocket
 * @param {Object} callbacks - Les callbacks pour les événements WebSocket
 * @param {Function} callbacks.onOpen - Appelé quand la connexion est établie
 * @param {Function} callbacks.onMessage - Appelé quand un message est reçu
 * @param {Function} callbacks.onError - Appelé quand une erreur se produit
 * @param {Function} callbacks.onClose - Appelé quand la connexion est fermée
 * @param {boolean} autoReconnect - Si true, tente de se reconnecter en cas de déconnexion
 * @returns {Object} Interface pour interagir avec la connexion WebSocket
 */
export function initWebSocket(url, callbacks = {}, autoReconnect = true) {
    let ws = null;
    let reconnectAttempts = 0;
    let reconnectInterval = 1000; // Commencer à 1 seconde
    let maxReconnectAttempts = 5;
    let reconnectTimeout = null;
    let intentionallyClosed = false;
    
    // Callbacks par défaut
    const defaultCallbacks = {
        onOpen: () => console.log('WebSocket connected'),
        onMessage: (data) => console.log('WebSocket message received:', data),
        onError: (error) => console.error('WebSocket error:', error),
        onClose: () => console.log('WebSocket disconnected'),
    };
    
    // Fusionner les callbacks fournis avec les defaults
    const { onOpen, onMessage, onError, onClose } = {
        ...defaultCallbacks,
        ...callbacks,
    };
    
    // Fonction pour établir la connexion
    function connect() {
        if (ws) {
            // Fermer l'ancienne connexion si elle existe
            ws.close();
        }
        
        try {
            ws = new WebSocket(url);
            
            ws.onopen = () => {
                console.log('WebSocket connection established');
                reconnectAttempts = 0;
                reconnectInterval = 1000;
                onOpen();
            };
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    onMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                    onError('Erreur lors du traitement du message');
                }
            };
            
            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                onError(error.message || 'Une erreur est survenue');
            };
            
            ws.onclose = (event) => {
                console.log('WebSocket connection closed, code:', event.code);
                onClose(event);
                
                // Tenter de se reconnecter sauf si la fermeture était intentionnelle
                if (autoReconnect && !intentionallyClosed && reconnectAttempts < maxReconnectAttempts) {
                    console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${maxReconnectAttempts})...`);
                    reconnectTimeout = setTimeout(() => {
                        reconnectAttempts++;
                        reconnectInterval *= 1.5; // Backoff exponentiel
                        connect();
                    }, reconnectInterval);
                }
            };
        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            onError('Impossible de créer une connexion WebSocket');
        }
    }
    
    // Fonction pour envoyer un message
    function sendMessage(message) {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.error('WebSocket not connected, cannot send message');
            return false;
        }
        
        try {
            const messageString = typeof message === 'string' 
                ? message 
                : JSON.stringify(message);
            
            ws.send(messageString);
            return true;
        } catch (error) {
            console.error('Error sending WebSocket message:', error);
            return false;
        }
    }
    
    // Fonction pour fermer la connexion
    function close() {
        intentionallyClosed = true;
        if (reconnectTimeout) {
            clearTimeout(reconnectTimeout);
        }
        if (ws) {
            ws.close();
        }
    }
    
    // Établir la connexion initiale
    connect();
    
    // Retourner une interface pour interagir avec la connexion
    return {
        sendMessage,
        close,
        reconnect: () => {
            intentionallyClosed = false;
            reconnectAttempts = 0;
            reconnectInterval = 1000;
            connect();
        },
        getStatus: () => ws ? ws.readyState : WebSocket.CLOSED
    };
}