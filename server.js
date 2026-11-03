const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { createAttemptLimiter } = require("./lib/attempts");
const { createReservationPool } = require("./lib/capacity");
const { releaseOnResponseEnd } = require("./lib/lifecycle");
const { createPasswordService } = require("./lib/passwords");
const { concatenateFiles, createMetadataStore } = require("./lib/storage");

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const app = express();
const PORT = positiveInteger(process.env.PORT, 3200);
const HOST = process.env.HOST || "127.0.0.1";
const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, "uploads");
const CHUNKS_DIR = process.env.CHUNKS_DIR ? path.resolve(process.env.CHUNKS_DIR) : path.join(__dirname, "chunks");
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const MAX_FILE_SIZE = positiveInteger(process.env.MAX_FILE_SIZE, 500 * 1024 * 1024);
const MAX_PASTE_SIZE = 500 * 1024; // 500 KB
const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_MULTIPART_OVERHEAD = 64 * 1024;
const MAX_ACTIVE_BYTES = positiveInteger(process.env.MAX_ACTIVE_BYTES, 5 * 1024 * 1024 * 1024);
const RATE_LIMIT_MAX = positiveInteger(process.env.RATE_LIMIT_MAX, 300);
const SCRYPT_MAX_CONCURRENCY = positiveInteger(process.env.SCRYPT_MAX_CONCURRENCY, 4);
const PASSWORD_ATTEMPT_MAX = positiveInteger(process.env.PASSWORD_ATTEMPT_MAX, 10);
const ERRORS_TOKEN = process.env.ERRORS_TOKEN || "";

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true });
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ===== SECURITY =====
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

// ===== RATE LIMITING (in-memory, no dependencies) =====
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
setInterval(() => rateLimitMap.clear(), RATE_LIMIT_WINDOW).unref();

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  let entry = rateLimitMap.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    entry = { count: 1, start: now };
    rateLimitMap.set(ip, entry);
  } else {
    entry.count++;
  }
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many requests. Try again later." });
  }
  next();
});

// A 500 KiB paste can be larger on the wire when JSON escapes control chars.
app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ===== PERSISTENT METADATA + EPHEMERAL SESSIONS =====
const metadataStore = createMetadataStore({
  filePath: path.join(DATA_DIR, "shares.json"),
  uploadDir: UPLOAD_DIR,
});
const files = metadataStore.records;
const restored = metadataStore.load();
if (restored.loaded || restored.discarded) {
  console.log(`[STARTUP] ${restored.loaded} partage(s) restaure(s), ${restored.discarded} entree(s) nettoyee(s)`);
}
// Chunk sessions live in memory. Once the durable index is known to be safe,
// directories left by an interrupted process cannot be resumed and are removed.
for (const entry of fs.readdirSync(CHUNKS_DIR, { withFileTypes: true })) {
  try { fs.rmSync(path.join(CHUNKS_DIR, entry.name), { recursive: true, force: true }); } catch {}
}
const chunkedUploads = new Map(); // uploadId -> { name, size, ttl, passwordHash, chunksDir, receivedBytes, chunkCount }
const downloadTokens = new Map(); // token -> { fileId, expiresAt }
const passwordService = createPasswordService({ maxConcurrent: SCRYPT_MAX_CONCURRENCY });
const passwordAttemptLimiter = createAttemptLimiter({ maxAttempts: PASSWORD_ATTEMPT_MAX, windowMs: RATE_LIMIT_WINDOW });
setInterval(() => passwordAttemptLimiter.prune(), RATE_LIMIT_WINDOW).unref();

function committedBytes() {
  let total = 0;
  for (const meta of files.values()) total += meta.size;
  for (const session of chunkedUploads.values()) total += session.size;
  return total;
}

const capacityReservations = createReservationPool({
  limitBytes: MAX_ACTIVE_BYTES,
  getCommittedBytes: committedBytes,
});

// ===== MULTER =====
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(16).toString("hex");
    cb(null, id);
  },
});
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 2,
    parts: 3,
    fieldNameSize: 100,
    fieldSize: 2048,
    headerPairs: 50,
    fieldArrayIndexLimit: 0,
  },
});

const chunkUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadId = req.params.uploadId;
      const session = chunkedUploads.get(uploadId);
      if (!session) return cb(new Error("Invalid upload session"));
      cb(null, session.chunksDir);
    },
    filename: (req, file, cb) => {
      const uploadId = req.params.uploadId;
      const session = chunkedUploads.get(uploadId);
      if (!session) return cb(new Error("Invalid upload session"));
      cb(null, String(req.chunkIndex));
    },
  }),
  limits: {
    fileSize: CHUNK_SIZE + 1024,
    files: 1,
    fields: 0,
    parts: 1,
    fieldNameSize: 100,
    headerPairs: 50,
    fieldArrayIndexLimit: 0,
  },
});

// ===== STATS =====
const STATS_FILE = path.join(DATA_DIR, "stats.json");
const LEGACY_STATS_FILE = path.join(__dirname, "stats.json");
let stats = { uploads: 0, pastes: 0, downloads: 0, totalUploadBytes: 0, totalPasteBytes: 0 };
const statsSource = fs.existsSync(STATS_FILE) ? STATS_FILE : LEGACY_STATS_FILE;
if (fs.existsSync(statsSource)) {
  try { stats = { ...stats, ...JSON.parse(fs.readFileSync(statsSource, "utf-8")) }; } catch {}
}
function saveStats() { fs.writeFileSync(STATS_FILE, JSON.stringify(stats), { mode: 0o600 }); }
function recordStats(changes) {
  for (const [key, amount] of Object.entries(changes)) stats[key] = (stats[key] || 0) + amount;
  try { saveStats(); }
  catch (error) { console.error("[STATS] Ecriture impossible:", error.message); }
}
setInterval(() => {
  try { saveStats(); }
  catch (error) { console.error("[STATS] Ecriture periodique impossible:", error.message); }
}, 30_000).unref();

// ===== HELPERS =====
async function hashPassword(password) { return passwordService.hash(password); }

function humanSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
}

function cleanFileName(value) {
  return path.basename(String(value || "fichier")).replace(/[\u0000-\u001f\u007f]/g, "").substring(0, 240) || "fichier";
}

function shortText(value, maxLength = 500) {
  return typeof value === "string" ? value.substring(0, maxLength) : "";
}

async function verifyPassword(password, stored) {
  return passwordService.verify(password, stored);
}

function registerPasswordAttempt(req, id) {
  const key = `${req.ip}:${id}`;
  return passwordAttemptLimiter.attempt(key) ? key : null;
}

function clearPasswordAttempts(key) {
  if (key) passwordAttemptLimiter.clear(key);
}

function passwordServiceUnavailable(res, error) {
  if (error?.code !== "SCRYPT_BUSY") return false;
  res.status(503).json({ error: "Service de mot de passe occupe, reessayez" });
  return true;
}

async function authorizePassword(req, res, meta, id) {
  if (!meta.passwordHash) return true;
  const attemptKey = registerPasswordAttempt(req, id);
  if (!attemptKey) {
    res.status(429).json({ error: "Trop de tentatives de mot de passe" });
    return false;
  }
  try {
    const valid = await verifyPassword(req.body?.password || "", meta.passwordHash);
    if (!valid) {
      res.status(403).json({ error: "Wrong password" });
      return false;
    }
    clearPasswordAttempts(attemptKey);
    return true;
  } catch (error) {
    if (passwordServiceUnavailable(res, error)) return false;
    throw error;
  }
}

function requireAdmin(req, res, next) {
  if (!ERRORS_TOKEN) return res.status(404).json({ error: "Not found" });
  const provided = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const expected = Buffer.from(ERRORS_TOKEN);
  const candidate = Buffer.from(provided);
  if (candidate.length !== expected.length || !crypto.timingSafeEqual(candidate, expected)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// ===== CHUNKED UPLOAD: INIT =====
app.post("/api/upload/init", async (req, res) => {
  const { name, size, ttl, password } = req.body || {};
  const declaredSize = Number(size);
  if (!name || !Number.isSafeInteger(declaredSize) || declaredSize <= 0) return res.status(400).json({ error: "Name and valid size required" });
  if (declaredSize > MAX_FILE_SIZE) return res.status(413).json({ error: `File too large (max ${humanSize(MAX_FILE_SIZE)})` });
  const reservation = capacityReservations.reserve(declaredSize);
  if (!reservation) return res.status(503).json({ error: "Espace temporaire sature, reessayez plus tard" });

  try {
    const uploadId = crypto.randomBytes(16).toString("hex");
    const chunksDir = path.join(CHUNKS_DIR, uploadId);
    const ttlMinutes = Math.min(Math.max(parseInt(ttl) || 60, 15), 1440);
    const passwordHash = password ? await hashPassword(password) : null;
    if (res.destroyed) return;
    fs.mkdirSync(chunksDir, { recursive: true });

    chunkedUploads.set(uploadId, {
      name: cleanFileName(name),
      size: declaredSize,
      ttl: ttlMinutes,
      passwordHash,
      chunksDir,
      receivedBytes: 0,
      chunkCount: 0,
      receivedChunks: new Set(),
      createdAt: Date.now(),
      receiving: false,
      finalizing: false,
    });

    console.log(`[CHUNK-INIT] ${uploadId} "${name}" (${humanSize(size)}) TTL=${ttlMinutes}min`);
    res.json({ uploadId, chunkSize: CHUNK_SIZE });
  } catch (error) {
    if (!passwordServiceUnavailable(res, error)) {
      console.error("[CHUNK-INIT] Error:", error.message);
      res.status(500).json({ error: "Impossible de demarrer le transfert" });
    }
  } finally {
    reservation.release();
  }
});

// ===== CHUNKED UPLOAD: CHUNK =====
app.post("/api/upload/chunk/:uploadId", (req, res, next) => {
  const session = chunkedUploads.get(req.params.uploadId);
  if (!session) return res.status(404).json({ error: "Upload session not found" });
  if (session.finalizing) return res.status(409).json({ error: "Upload finalization in progress" });
  const chunkIndex = Number.parseInt(req.headers["x-chunk-index"], 10);
  const expectedChunks = Math.ceil(session.size / CHUNK_SIZE);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= expectedChunks) {
    return res.status(400).json({ error: "Invalid chunk index" });
  }
  if (session.receivedChunks.has(chunkIndex)) {
    return res.json({ received: session.receivedBytes, chunks: session.chunkCount, duplicate: true });
  }
  if (session.receiving) return res.status(409).json({ error: "A chunk is already being processed" });
  req.chunkIndex = chunkIndex;
  session.receiving = true;
  releaseOnResponseEnd(res, () => { session.receiving = false; });
  next();
}, chunkUpload.single("chunk"), (req, res) => {
  const { uploadId } = req.params;
  const session = chunkedUploads.get(uploadId);
  if (!session) return res.status(404).json({ error: "Upload session not found" });

  if (req.file) {
    if (session.receivedBytes + req.file.size > session.size) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: "Received data exceeds declared file size" });
    }
    session.receivedBytes += req.file.size;
    session.receivedChunks.add(req.chunkIndex);
    session.chunkCount = session.receivedChunks.size;
  }

  res.json({ received: session.receivedBytes, chunks: session.chunkCount });
});

// ===== CHUNKED UPLOAD: COMPLETE =====
app.post("/api/upload/complete/:uploadId", async (req, res) => {
  const { uploadId } = req.params;
  const session = chunkedUploads.get(uploadId);
  if (!session) return res.status(404).json({ error: "Upload session not found" });
  if (session.receiving) return res.status(409).json({ error: "A chunk is still being processed" });
  if (session.finalizing) return res.status(409).json({ error: "Upload finalization already in progress" });
  if (session.chunkCount === 0 || session.receivedBytes !== session.size) {
    return res.status(400).json({ error: "Upload incomplete" });
  }
  const chunkPaths = Array.from({ length: session.chunkCount }, (_, index) => path.join(session.chunksDir, String(index)));
  if (chunkPaths.some(chunkPath => !fs.existsSync(chunkPath))) return res.status(400).json({ error: "Upload incomplete" });
  const finalizationReservation = capacityReservations.reserve(session.size);
  if (!finalizationReservation) return res.status(503).json({ error: "Espace temporaire insuffisant pour finaliser le transfert" });
  session.finalizing = true;

  let filePath = null;
  let registered = false;
  try {
    // Merge chunks into a single file
    const fileId = crypto.randomBytes(16).toString("hex");
    filePath = path.join(UPLOAD_DIR, fileId);
    await concatenateFiles(chunkPaths, filePath);
    if (res.destroyed) throw Object.assign(new Error("Client deconnecte"), { code: "CLIENT_ABORTED" });

    // Register the file
    const finalSize = fs.statSync(filePath).size;
    if (finalSize !== session.size) throw new Error("La taille finale ne correspond pas a la taille declaree");
    const meta = {
      type: "file",
      originalName: session.name,
      size: finalSize,
      mime: "application/octet-stream",
      expiresAt: Date.now() + session.ttl * 60 * 1000,
      passwordHash: session.passwordHash,
      filePath,
    };
    metadataStore.set(fileId, meta);
    registered = true;

    // Chunks remain recoverable until the durable metadata commit succeeds.
    for (let i = 0; i < session.chunkCount; i++) {
      try { fs.unlinkSync(path.join(session.chunksDir, String(i))); } catch {}
    }
    try { fs.rmdirSync(session.chunksDir); } catch {}
    chunkedUploads.delete(uploadId);

    recordStats({ uploads: 1, totalUploadBytes: finalSize });

    console.log(
      `[UPLOAD] ${fileId} "${meta.originalName}" (${humanSize(meta.size)}) TTL=${session.ttl}min${session.passwordHash ? " [LOCKED]" : ""}`
    );

    res.json({
      id: fileId,
      url: `/d/${fileId}`,
      name: meta.originalName,
      size: humanSize(meta.size),
      expiresAt: new Date(meta.expiresAt).toISOString(),
      hasPassword: !!session.passwordHash,
    });
  } catch (err) {
    console.error("[UPLOAD-COMPLETE] Error:", err);
    if (!registered && filePath) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    if (!registered) session.finalizing = false;
    if (!res.destroyed) res.status(500).json({ error: "Failed to finalize upload" });
  } finally {
    finalizationReservation.release();
  }
});

function reserveLegacyUpload(req, res, next) {
  const contentLength = Number.parseInt(req.headers["content-length"] || "", 10);
  const maximumRequestBytes = MAX_FILE_SIZE + MAX_MULTIPART_OVERHEAD;
  if (Number.isSafeInteger(contentLength) && contentLength > maximumRequestBytes) {
    return res.status(413).json({ error: `Requete trop volumineuse (maximum ${humanSize(MAX_FILE_SIZE)})` });
  }
  const requestedBytes = Number.isSafeInteger(contentLength) && contentLength > 0
    ? contentLength
    : maximumRequestBytes;
  const reservation = capacityReservations.reserve(requestedBytes);
  if (!reservation) return res.status(503).json({ error: "Espace temporaire sature, reessayez plus tard" });
  const release = releaseOnResponseEnd(res, () => reservation.release());
  req.releaseCapacityReservation = release;
  let responseFinished = false;
  res.once("finish", () => { responseFinished = true; });
  res.once("close", () => {
    if (responseFinished || req.uploadCommitted) return;
    req.uploadAborted = true;
    if (req.file?.path) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
  });
  next();
}

// ===== LEGACY UPLOAD (single request) =====
app.post("/api/upload", reserveLegacyUpload, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });

  const ttlMinutes = Math.min(Math.max(parseInt(req.body?.ttl) || 60, 15), 1440);
  const password = req.body?.password || null;
  let registered = false;
  try {
    const id = req.file.filename;
    const meta = {
      type: "file",
      originalName: cleanFileName(req.file.originalname),
      size: req.file.size,
      mime: req.file.mimetype,
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
      passwordHash: password ? await hashPassword(password) : null,
      filePath: req.file.path,
    };
    if (req.uploadAborted) throw Object.assign(new Error("Client deconnecte"), { code: "CLIENT_ABORTED" });
    metadataStore.set(id, meta);
    registered = true;
    req.uploadCommitted = true;
    req.releaseCapacityReservation();
    recordStats({ uploads: 1, totalUploadBytes: req.file.size });

    console.log(
      `[UPLOAD] ${id} "${meta.originalName}" (${humanSize(meta.size)}) TTL=${ttlMinutes}min${password ? " [LOCKED]" : ""}`
    );

    res.json({
      id,
      url: `/d/${id}`,
      name: meta.originalName,
      size: humanSize(meta.size),
      expiresAt: new Date(meta.expiresAt).toISOString(),
      hasPassword: !!password,
    });
  } catch (error) {
    if (!registered) {
      try { fs.unlinkSync(req.file.path); } catch {}
    }
    if (error?.code === "CLIENT_ABORTED" || res.destroyed) return;
    if (!passwordServiceUnavailable(res, error)) {
      console.error("[UPLOAD] Error:", error.message);
      res.status(500).json({ error: "Impossible d'enregistrer le fichier" });
    }
  }
});

// ===== PASTE =====
app.post("/api/paste", async (req, res) => {
  const { content, ttl, password } = req.body || {};
  if (!content || typeof content !== "string") return res.status(400).json({ error: "No content" });
  if (Buffer.byteLength(content, "utf-8") > MAX_PASTE_SIZE) {
    return res.status(413).json({ error: `Paste too large (max ${humanSize(MAX_PASTE_SIZE)})` });
  }
  const contentSize = Buffer.byteLength(content, "utf-8");
  const reservation = capacityReservations.reserve(contentSize);
  if (!reservation) return res.status(503).json({ error: "Espace temporaire sature, reessayez plus tard" });

  const ttlMinutes = Math.min(Math.max(parseInt(ttl) || 60, 15), 1440);
  const id = crypto.randomBytes(16).toString("hex");
  const filePath = path.join(UPLOAD_DIR, id);
  let fileWritten = false;
  let registered = false;
  try {
    const passwordHash = password ? await hashPassword(password) : null;
    if (res.destroyed) return;
    fs.writeFileSync(filePath, content, { encoding: "utf-8", mode: 0o600 });
    fileWritten = true;
    const meta = {
      type: "paste",
      originalName: "paste.txt",
      size: contentSize,
      mime: "text/plain",
      expiresAt: Date.now() + ttlMinutes * 60 * 1000,
      passwordHash,
      filePath,
    };
    metadataStore.set(id, meta);
    registered = true;
    recordStats({ pastes: 1, totalPasteBytes: meta.size });

    console.log(
      `[PASTE] ${id} (${humanSize(meta.size)}) TTL=${ttlMinutes}min${password ? " [LOCKED]" : ""}`
    );

    res.json({
      id,
      url: `/p/${id}`,
      size: humanSize(meta.size),
      expiresAt: new Date(meta.expiresAt).toISOString(),
      hasPassword: !!password,
    });
  } catch (error) {
    if (fileWritten && !registered) {
      try { fs.unlinkSync(filePath); } catch {}
    }
    if (!passwordServiceUnavailable(res, error)) {
      console.error("[PASTE] Error:", error.message);
      res.status(500).json({ error: "Impossible d'enregistrer le texte" });
    }
  } finally {
    reservation.release();
  }
});

// ===== PASTE PAGE =====
app.get("/p/:id", (req, res) => {
  const meta = files.get(req.params.id);
  if (!meta || Date.now() > meta.expiresAt) {
    cleanup(req.params.id);
    return res.status(404).send(notFoundPage());
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== PASTE INFO =====
app.get("/api/paste/:id", (req, res) => {
  const meta = files.get(req.params.id);
  if (!meta || Date.now() > meta.expiresAt) {
    cleanup(req.params.id);
    return res.status(404).json({ error: "Paste expired or not found" });
  }
  res.json({
    size: humanSize(meta.size),
    expiresAt: new Date(meta.expiresAt).toISOString(),
    hasPassword: !!meta.passwordHash,
    content: meta.passwordHash ? undefined : fs.readFileSync(meta.filePath, "utf-8"),
  });
});

// ===== PASTE CONTENT (with password) =====
app.post("/api/paste/:id", async (req, res) => {
  const meta = files.get(req.params.id);
  if (!meta || Date.now() > meta.expiresAt) {
    cleanup(req.params.id);
    return res.status(404).json({ error: "Paste expired or not found" });
  }
  if (!await authorizePassword(req, res, meta, req.params.id)) return;
  res.json({ content: fs.readFileSync(meta.filePath, "utf-8") });
});

// ===== DOWNLOAD PAGE =====
app.get("/d/:id", (req, res) => {
  const meta = files.get(req.params.id);
  if (!meta || Date.now() > meta.expiresAt) {
    cleanup(req.params.id);
    return res.status(404).send(notFoundPage());
  }
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== FILE INFO (for download page) =====
app.get("/api/file/:id", (req, res) => {
  const meta = files.get(req.params.id);
  if (!meta || Date.now() > meta.expiresAt) {
    cleanup(req.params.id);
    return res.status(404).json({ error: "File expired or not found" });
  }
  res.json({
    name: meta.originalName,
    size: humanSize(meta.size),
    expiresAt: new Date(meta.expiresAt).toISOString(),
    hasPassword: !!meta.passwordHash,
  });
});

// ===== DOWNLOAD TOKEN (password check) =====
app.post("/api/download-token/:id", async (req, res) => {
  const meta = files.get(req.params.id);
  if (!meta || Date.now() > meta.expiresAt) {
    cleanup(req.params.id);
    return res.status(404).json({ error: "File expired or not found" });
  }

  if (!await authorizePassword(req, res, meta, req.params.id)) return;

  // Generate a one-time download token valid for 60 seconds
  const token = crypto.randomBytes(16).toString("hex");
  downloadTokens.set(token, { fileId: req.params.id, expiresAt: Date.now() + 60000 });

  res.json({ token });
});

// ===== DOWNLOAD FILE (via token) =====
app.get("/api/download-get/:id", (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: "Token required" });

  const tokenData = downloadTokens.get(token);
  if (!tokenData || tokenData.fileId !== req.params.id || Date.now() > tokenData.expiresAt) {
    downloadTokens.delete(token);
    return res.status(403).json({ error: "Invalid or expired token" });
  }
  downloadTokens.delete(token);

  const meta = files.get(req.params.id);
  if (!meta || Date.now() > meta.expiresAt) {
    cleanup(req.params.id);
    return res.status(404).json({ error: "File expired or not found" });
  }

  recordStats({ downloads: 1 });

  res.download(meta.filePath, meta.originalName);
});

// ===== LEGACY DOWNLOAD (POST with password) =====
app.post("/api/download/:id", async (req, res) => {
  const meta = files.get(req.params.id);
  if (!meta || Date.now() > meta.expiresAt) {
    cleanup(req.params.id);
    return res.status(404).json({ error: "File expired or not found" });
  }

  if (!await authorizePassword(req, res, meta, req.params.id)) return;

  recordStats({ downloads: 1 });
  res.download(meta.filePath, meta.originalName);
});

// ===== REPORT (takedown) =====
const REPORTS_LOG = path.join(__dirname, "reports.json");
let reports = [];
if (fs.existsSync(REPORTS_LOG)) {
  try { reports = JSON.parse(fs.readFileSync(REPORTS_LOG, "utf-8")); } catch {}
}

app.post("/api/report/:id", (req, res) => {
  const { id } = req.params;
  const reason = shortText(req.body?.reason);
  const meta = files.get(id);

  const report = {
    id,
    fileName: meta?.originalName || "unknown",
    reason,
    ip: req.ip,
    time: new Date().toISOString(),
    fileExisted: !!meta,
  };
  reports.push(report);
  if (reports.length > 1000) reports = reports.slice(-1000);
  fs.writeFileSync(REPORTS_LOG, JSON.stringify(reports, null, 2), { mode: 0o600 });
  console.log(`[REPORT] ${id} "${report.fileName}" reason="${reason}" by ${report.ip}`);

  if (meta && !cleanup(id)) {
    return res.status(503).json({ ok: false, error: "Signalement enregistre, mais la suppression doit etre reessayee" });
  }

  res.json({ ok: true, message: "Fichier supprime. Merci pour le signalement." });
});

// ===== CLEANUP =====
function cleanup(id) {
  try { return metadataStore.remove(id); }
  catch (error) {
    console.error(`[CLEANUP] Impossible de persister la suppression ${id}:`, error.message);
    return false;
  }
}

// Cleanup expired files every 60s
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, meta] of files) {
    if (now > meta.expiresAt) {
      if (cleanup(id)) cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[CLEANUP] Removed ${cleaned} expired file(s)`);
}, 60_000).unref();

// Cleanup stale chunked uploads (older than 30 min)
setInterval(() => {
  const now = Date.now();
  for (const [uploadId, session] of chunkedUploads) {
    if (!session.receiving && !session.finalizing && now - session.createdAt > 30 * 60 * 1000) {
      try {
        fs.rmSync(session.chunksDir, { recursive: true, force: true });
        chunkedUploads.delete(uploadId);
        console.log(`[CLEANUP] Removed stale chunked upload ${uploadId}`);
      } catch (error) {
        console.error(`[CLEANUP] Echec du nettoyage du transfert ${uploadId}:`, error.message);
      }
    }
  }
}, 60_000).unref();

// Cleanup expired download tokens every 60s
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of downloadTokens) {
    if (now > data.expiresAt) downloadTokens.delete(token);
  }
}, 60_000).unref();

// ===== 404 PAGE =====
function notFoundPage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lien expire</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
.c{text-align:center;padding:2rem}h1{font-size:2rem;font-weight:300;margin-bottom:.5rem}p{color:#888}a{color:#6ea8fe;text-decoration:none}</style></head>
<body><div class="c"><h1>Lien expire</h1><p>Ce fichier ou paste n'est plus disponible.</p><br><a href="/">Retour</a></div></body></html>`;
}

// ===== STATS API =====
app.get("/api/stats", (req, res) => {
  let activeSize = 0;
  let activeFiles = 0;
  let activePastes = 0;
  for (const meta of files.values()) {
    activeSize += meta.size;
    if (meta.type === "paste") activePastes++;
    else activeFiles++;
  }
  res.json({
    active: { files: activeFiles, pastes: activePastes, totalSize: humanSize(activeSize) },
    cumulative: stats,
  });
});


// ===== ERROR LOGGING =====
const ERRORS_FILE = path.join(__dirname, "errors.json");
let errorLogs = [];
if (fs.existsSync(ERRORS_FILE)) {
  try { errorLogs = JSON.parse(fs.readFileSync(ERRORS_FILE, "utf-8")); } catch {}
}

function logError(type, error, extra) {
  const entry = { time: new Date().toISOString(), type, error: typeof error === "string" ? error.substring(0, 500) : String(error).substring(0, 500), ...extra };
  errorLogs.push(entry);
  if (errorLogs.length > 500) errorLogs = errorLogs.slice(-500);
  try {
    fs.writeFileSync(ERRORS_FILE, JSON.stringify(errorLogs, null, 2), { mode: 0o600 });
    fs.chmodSync(ERRORS_FILE, 0o600);
  } catch {}
  console.log("[ERROR-LOG] " + type + " — " + entry.error.substring(0, 100));
}

app.post("/api/report-bug", (req, res) => {
  const { error, comment, userAgent, page } = req.body || {};
  logError("user-report", shortText(error) || "No error message", {
    comment: shortText(comment),
    page: shortText(page, 200) || "/",
    userAgent: shortText(userAgent, 300) || req.headers["user-agent"],
    ip: req.ip,
  });
  res.json({ ok: true });
});

app.get("/api/errors", requireAdmin, (req, res) => { res.json(errorLogs.slice(-100).reverse()); });
// ===== 404 CATCH-ALL =====
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error("[ERROR]", err.message);
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `Fichier trop volumineux (maximum ${humanSize(MAX_FILE_SIZE)})` });
    }
    return res.status(400).json({ error: "Formulaire de transfert invalide" });
  }
  res.status(500).json({ error: "Erreur interne du serveur" });
});

function startServer() {
  return app.listen(PORT, HOST, () => {
    console.log(`\nFileDrop running on http://${HOST}:${PORT}`);
    console.log(`Max file size: ${humanSize(MAX_FILE_SIZE)}`);
    console.log(`Upload dir: ${UPLOAD_DIR}\n`);
  });
}

if (require.main === module) startServer();

module.exports = { app, startServer };
