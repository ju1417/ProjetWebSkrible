import { join } from "https://deno.land/std@0.206.0/path/mod.ts";
import { contentType } from "https://deno.land/std@0.206.0/media_types/content_type.ts";

// ==================== CONFIGURATION ====================
const HTTP_PORT = 8080;
const HTTPS_PORT = 8443;
const USE_HTTPS = true;

// Le répertoire racine est maintenant le dossier "fronted"
const ROOT_DIR = Deno.cwd();
console.log(`Répertoire racine: ${ROOT_DIR}`);

// ==================== CONFIGURATION HTTPS ====================
let tlsOptions = null;

if (USE_HTTPS) {
  try {
    // Lire les certificats (chemin absolu)
    const certPath = "/home/julien/Bureau/IG3/Projet_Web/certs/cert.pem";
    const keyPath = "/home/julien/Bureau/IG3/Projet_Web/certs/key.pem";
    
    tlsOptions = {
      cert: await Deno.readTextFile(certPath),
      key: await Deno.readTextFile(keyPath),
    };
    
    console.log(`Certificats HTTPS chargés pour le frontend`);
  } catch (error) {
    console.error(" Erreur chargement certificats HTTPS:", error);
    Deno.exit(1);
  }
}

// ==================== GESTIONNAIRE DE REQUÊTES ====================
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let filePath;
  
  console.log(`Requête reçue pour: ${url.pathname}`);
  
  if (url.pathname === "/" || url.pathname === "") {
    filePath = join(ROOT_DIR, "index.html");
  } else {
    filePath = join(ROOT_DIR, url.pathname);
  }
  
  console.log(`Tentative d'accès au fichier: ${filePath}`);
  
  try {
    const fileInfo = await Deno.stat(filePath);
    
    if (fileInfo.isDirectory) {
      filePath = join(filePath, "index.html");
      console.log(`C'est un répertoire, on cherche index.html: ${filePath}`);
    }
    
    const file = await Deno.open(filePath, { read: true });
    const ext = filePath.split(".").pop() || "";
    
    console.log(`Fichier trouvé! Type: ${contentType(ext) || "text/plain"}`);
    
    // Headers de sécurité pour HTTPS
    const headers: Record<string, string> = {
      "Content-Type": contentType(ext) || "text/plain",
    };
    
    // Ajouter des headers de sécurité si HTTPS
    if (USE_HTTPS && tlsOptions) {
      headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
      headers["X-Content-Type-Options"] = "nosniff";
      headers["X-Frame-Options"] = "DENY";
      headers["X-XSS-Protection"] = "1; mode=block";
    }
    
    return new Response(file.readable, { headers });
    
  } catch (error) {
    console.error(`Erreur: ${error.message}`);
    
    // Si le fichier n'est pas trouvé mais que c'est une route (pas un asset)
    if (error instanceof Deno.errors.NotFound && !url.pathname.includes(".")) {
      // Rediriger vers index.html pour le SPA routing
      try {
        const file = await Deno.open(join(ROOT_DIR, "index.html"), { read: true });
        return new Response(file.readable, {
          headers: {
            "Content-Type": "text/html",
          },
        });
      } catch (e) {
        console.error(`Impossible de servir index.html: ${e.message}`);
      }
    }
    
    return new Response(`Fichier non trouvé: ${filePath}`, { status: 404 });
  }
}

// ==================== SERVEUR HTTPS NATIF DENO ====================
console.log(" Démarrage du serveur frontend...");

if (USE_HTTPS && tlsOptions) {
  console.log(` Configuration serveur HTTPS sur port ${HTTPS_PORT}...`);
  console.log(` Pour accéder au jeu: https://localhost:${HTTPS_PORT}`);
  const server = Deno.listenTls({
    port: HTTPS_PORT,
    cert: tlsOptions.cert,
    key: tlsOptions.key,
  });
  
  console.log(` Serveur HTTPS frontend démarré sur https://localhost:${HTTPS_PORT}`);
  
  // Boucle de traitement des connexions HTTPS
  for await (const conn of server) {
    (async () => {
      const httpConn = Deno.serveHttp(conn);
      for await (const requestEvent of httpConn) {
        try {
          const response = await handler(requestEvent.request);
          await requestEvent.respondWith(response);
        } catch (error) {
          console.error("Erreur traitement requête:", error);
          await requestEvent.respondWith(new Response("Erreur serveur", { status: 500 }));
        }
      }
    })();
  }
  
} else {
  console.log(` Serveur frontend HTTP démarré sur http://localhost:${HTTP_PORT}`);
  
  // Serveur HTTP simple
  const server = Deno.listen({ port: HTTP_PORT });
  console.log(` Serveur HTTP frontend démarré sur http://localhost:${HTTP_PORT}`);
  
  for await (const conn of server) {
    (async () => {
      const httpConn = Deno.serveHttp(conn);
      for await (const requestEvent of httpConn) {
        try {
          const response = await handler(requestEvent.request);
          await requestEvent.respondWith(response);
        } catch (error) {
          console.error("Erreur traitement requête:", error);
          await requestEvent.respondWith(new Response("Erreur serveur", { status: 500 }));
        }
      }
    })();
  }
}