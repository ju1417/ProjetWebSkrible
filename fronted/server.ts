import { serve } from "https://deno.land/std@0.206.0/http/server.ts";
import { serveFile } from "https://deno.land/std@0.206.0/http/file_server.ts";
import { join, basename } from "https://deno.land/std@0.206.0/path/mod.ts";
import { Status } from "https://deno.land/std@0.206.0/http/http_status.ts";
import { contentType } from "https://deno.land/std@0.206.0/media_types/content_type.ts";

// Configuration du serveur
const PORT = 8080;
const ROOT_DIR = Deno.cwd();
const ASSETS_DIR = join(ROOT_DIR, "assets");

// Fonction pour servir un fichier statique
async function serveStaticFile(req: Request, filePath: string): Promise<Response> {
  try {
    // Vérifier si le fichier existe
    const fileInfo = await Deno.stat(filePath);
    
    if (fileInfo.isDirectory) {
      // Si c'est un répertoire, chercher index.html
      return await serveStaticFile(req, join(filePath, "index.html"));
    }
    
    // Déterminer le type de contenu basé sur l'extension
    const ext = filePath.split(".").pop() || "";
    const contentTypeValue = contentType(ext) || "text/plain";
    
    // Servir le fichier
    return new Response(await Deno.readFile(filePath), {
      status: Status.OK,
      headers: {
        "Content-Type": contentTypeValue,
      },
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // Fichier non trouvé, servir index.html pour SPA routing
      if (!filePath.includes("assets")) {
        return await serveStaticFile(req, join(ROOT_DIR, "index.html"));
      }
      
      // 404 pour les assets manquants
      return new Response("File not found", { status: Status.NotFound });
    }
    
    console.error("Erreur lors de la lecture du fichier:", error);
    return new Response("Internal Server Error", { status: Status.InternalServerError });
  }
}

// Fonction pour gérer les requêtes entrantes
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  let filePath: string;
  
  // Routing de base
  if (url.pathname === "/" || url.pathname === "/index.html") {
    filePath = join(ROOT_DIR, "index.html");
  } else if (url.pathname.startsWith("/assets/")) {
    filePath = join(ROOT_DIR, url.pathname);
  } else {
    // Pour toutes les autres routes, on sert index.html (SPA)
    filePath = join(ROOT_DIR, "index.html");
  }
  
  return await serveStaticFile(req, filePath);
}

// Démarrer le serveur
console.log(`Serveur frontend démarré sur http://localhost:${PORT}`);
await serve(handler, { port: PORT });