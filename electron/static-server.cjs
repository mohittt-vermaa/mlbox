"use strict";
// Serves the mlbox folder over loopback HTTP, so the packaged desktop app
// behaves exactly like `python3 -m http.server` — ES modules and the vocabulary
// JSON fetches both work here, which they do not over file://.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath } = require("node:url");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp4": "video/mp4",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

/** @param {string} root directory to serve (the app folder) */
function createStaticServer(root) {
  const base = path.resolve(root);
  // Resolve any symlinks in the base directory for defense in depth
  const realBase = fs.realpathSync(base);
  return http.createServer((req, res) => {
    let rel;
    try {
      rel = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname);
    } catch {
      res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
      return res.end("bad request");
    }
    if (rel === "/" || rel === "") rel = "/index.html";

    // normalise, then refuse anything that climbs out of the app folder
    const file = path.normalize(path.join(realBase, rel));
    // Also resolve the final path to prevent symlink escape
    let realFile;
    try {
      realFile = fs.realpathSync(file);
    } catch {
      // File doesn't exist yet - check if the parent directory is within base
      const parent = path.dirname(file);
      let realParent;
      try { realParent = fs.realpathSync(parent); } catch { realParent = parent; }
      if (realParent !== realBase && !realParent.startsWith(realBase + path.sep)) {
        res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        return res.end("forbidden");
      }
      realFile = file;
    }
    if (realFile !== realBase && !realFile.startsWith(realBase + path.sep)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      return res.end("forbidden");
    }

    fs.readFile(realFile, (err, buf) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("404 " + rel);
      }
      // CSP: allow only same-origin scripts, styles, images, fonts; frame-ancestors none
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ");
      res.writeHead(200, {
        "content-type": MIME[path.extname(realFile).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
        "content-security-policy": csp,
      });
      res.end(buf);
    });
  });
}

module.exports = { createStaticServer };
