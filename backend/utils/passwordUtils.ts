import { bcrypt } from "../deps.ts";

// Fonction basique de hash
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password);
}

// Fonction basique de vérification
export async function verifyPassword(
  plainText: string, 
  hash: string
): Promise<boolean> {
  return await bcrypt.compare(plainText, hash);
}