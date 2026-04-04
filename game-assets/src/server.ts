/**
 * game-assets — Upload server (Bun)
 *
 * Routes :
 *   POST /upload   — Upload un fichier dans public/
 *                    Requiert un JWT admin dans Authorization: Bearer <token>
 *   GET  /health   — Healthcheck (unauthenticated)
 *
 * Le chemin de destination est fourni via form-data field "path"
 * (ex: "clothes/hair/hair8.json"). Les .. sont interdits.
 *
 * Authentification : même JWT_SECRET que game-api, vérification du claim "rank"
 * qui doit contenir "ROLE_ADMIN" ou "ROLE_MODERATOR".
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

const PORT        = parseInt(Bun.env.UPLOAD_PORT ?? "3002");
const JWT_SECRET  = Bun.env.JWT_SECRET ?? "";
const PUBLIC_DIR  = resolve(Bun.env.PUBLIC_DIR ?? join(import.meta.dir, "../public"));

const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/json",
  "video/webm",
  "font/ttf",
  "application/octet-stream", // .ttf peut arriver avec ce type
]);

// ── Helpers JWT ──────────────────────────────────────────────────────────────

function base64urlDecode(str: string): string {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function verifyJwt(token: string): Promise<{ sub: string; rank: string } | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const sig = Uint8Array.from(
      atob(sigB64.replace(/-/g, "+").replace(/_/g, "/")),
      (c) => c.charCodeAt(0),
    );

    const valid = await crypto.subtle.verify("HMAC", key, sig, data);
    if (!valid) return null;

    const payload = JSON.parse(base64urlDecode(payloadB64));

    // Vérification expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    return { sub: payload.sub, rank: payload.rank ?? "" };
  } catch {
    return null;
  }
}

function isAdmin(rank: string): boolean {
  return rank === "ROLE_ADMIN" || rank === "ROLE_MODERATOR";
}

// ── Sécurisation du chemin ────────────────────────────────────────────────────

function safePath(relativePath: string): string | null {
  // Refuser les traversées de répertoire
  const normalized = normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = resolve(PUBLIC_DIR, normalized);
  if (!abs.startsWith(PUBLIC_DIR + "/") && abs !== PUBLIC_DIR) return null;
  return abs;
}

// ── Server ───────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,

  async fetch(req) {
    const url = new URL(req.url);

    // Health
    if (url.pathname === "/health" && req.method === "GET") {
      return Response.json({ status: "ok" });
    }

    // Upload
    if (url.pathname === "/upload" && req.method === "POST") {
      // Auth
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace(/^Bearer\s+/i, "");
      if (!token) return Response.json({ error: "Unauthorized" }, { status: 401 });

      const claims = await verifyJwt(token);
      if (!claims || !isAdmin(claims.rank)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      // Parse multipart
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return Response.json({ error: "Invalid multipart form" }, { status: 400 });
      }

      const pathField = formData.get("path");
      const file = formData.get("file");

      if (typeof pathField !== "string" || !pathField.trim()) {
        return Response.json({ error: "Missing 'path' field" }, { status: 400 });
      }
      if (!(file instanceof Blob)) {
        return Response.json({ error: "Missing 'file' field" }, { status: 400 });
      }

      // Vérification MIME
      if (!ALLOWED_MIME.has(file.type) && file.type !== "") {
        return Response.json({ error: `MIME type '${file.type}' not allowed` }, { status: 415 });
      }

      // Sécurisation du chemin
      const destPath = safePath(pathField.trim());
      if (!destPath) {
        return Response.json({ error: "Invalid path" }, { status: 400 });
      }

      // Écriture
      try {
        const dirPath = dirname(destPath);
        if (!existsSync(dirPath)) {
          mkdirSync(dirPath, { recursive: true });
        }
        writeFileSync(destPath, Buffer.from(await file.arrayBuffer()));
      } catch (err) {
        console.error("[upload] Write error:", err);
        return Response.json({ error: "Write failed" }, { status: 500 });
      }

      const rel = destPath.replace(PUBLIC_DIR + "/", "");
      console.log(`[upload] ${claims.sub} → ${rel}`);
      return Response.json({ path: rel }, { status: 201 });
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
});

console.log(`[game-assets upload] listening on port ${server.port}`);
console.log(`[game-assets upload] PUBLIC_DIR = ${PUBLIC_DIR}`);
