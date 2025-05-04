import { serve } from "https://deno.land/std@0.206.0/http/server.ts";
import { join } from "https://deno.land/std@0.206.0/path/mod.ts";
import { contentType } from "https://deno.land/std@0.206.0/media_types/content_type.ts";

const PORT = 8080;
// Le répertoire racine est maintenant le dossier "fronted"
const ROOT_DIR = Deno.cwd();

console.log(`Répertoire racine: ${ROOT_DIR}`);

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
    
    return new Response(file.readable, {
      headers: {
        "Content-Type": contentType(ext) || "text/plain",
      },
    });
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

console.log(`Serveur frontend démarré sur http://localhost:${PORT}`);
await serve(handler, { port: PORT });