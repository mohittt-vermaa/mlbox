"use strict";
// Serves the mlbox folder over loopback HTTP, so the packaged desktop app
// behaves exactly like `python3 -m http.server` — ES modules and the vocabulary
// JSON fetches both work here, which they do not over file://.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

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
    const file = path.normalize(path.join(base, rel));
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      return res.end("forbidden");
    }

    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("404 " + rel);
      }
      res.writeHead(200, {
        "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-cache",
        "x-content-type-options": "nosniff",
      });
      res.end(buf);
    });
  });
}

module.exports = { createStaticServer };
