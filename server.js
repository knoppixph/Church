const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
let bcrypt;
try { bcrypt = require("bcryptjs"); } catch (_) { bcrypt = null; }

const app = express();
const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
let PORT = DEFAULT_PORT;

// Paths
const SITE_DIR = path.join(__dirname, "church-page-main");
const ADMIN_DB_JSON = path.join(SITE_DIR, "admin-db.json");
const AUTH_STORE = path.join(SITE_DIR, "admin-auth.json");
const ANNOUNCEMENT_PDF = path.join(SITE_DIR, "announcements.pdf");
const ANNOUNCEMENT_PPTX = path.join(SITE_DIR, "announcements.pptx");

// Static site
// Disable caching so CSS/HTML changes show up immediately during local editing.
app.use(
  express.static(SITE_DIR, {
    etag: false,
    lastModified: false,
    setHeaders: (res, filePath) => {
      const lower = String(filePath || "").toLowerCase();
      if (lower.endsWith(".html") || lower.endsWith(".css") || lower.endsWith(".js")) {
        res.setHeader("Cache-Control", "no-store, max-age=0, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    },
  })
);
app.use(express.json({ limit: "1mb" }));

// Simple JSON auth store (to avoid native sqlite binding)
function loadStore() {
  try {
    const raw = fs.readFileSync(AUTH_STORE, "utf8");
    const json = JSON.parse(raw);
    return {
      users: Array.isArray(json.users) ? json.users : [],
      tokens: Array.isArray(json.tokens) ? json.tokens : []
    };
  } catch (_) {
    return { users: [], tokens: [] };
  }
}

function saveStore(store) {
  fs.writeFileSync(AUTH_STORE, JSON.stringify(store, null, 2));
}

function nextId(list) {
  return list.length ? Math.max(...list.map((u) => u.id || 0)) + 1 : 1;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function verifyPassword(stored, plain) {
  const s = String(stored || "").trim();
  if (!s) return false;
  if (/^[a-f0-9]{64}$/i.test(s)) return sha256(plain).toLowerCase() === s.toLowerCase();
  if (s.startsWith("$2") && bcrypt) {
    try { return bcrypt.compareSync(plain, s); } catch (_) { return false; }
  }
  return s === plain;
}

async function seedAdmin() {
  const store = loadStore();
  if (store.users.length) return;
  let seedEmail = "admin@example.com";
  let seedHash = sha256("password");
  try {
    const raw = JSON.parse(fs.readFileSync(ADMIN_DB_JSON, "utf8"));
    if (raw.admins && raw.admins[0]) {
      seedEmail = String(raw.admins[0].email || seedEmail).toLowerCase().trim();
      seedHash = String(raw.admins[0].passwordHash || seedHash).trim();
    }
  } catch (_) {}
  store.users.push({
    id: nextId(store.users),
    email: seedEmail,
    pass_hash: seedHash,
    role: "Admin",
    created_at: new Date().toISOString()
  });
  saveStore(store);
  console.log(`Seeded admin user: ${seedEmail}`);
}

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function authFromBearer(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer\\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "Missing token" });
    const token = m[1].trim();
    const store = loadStore();
    const entry = store.tokens.find((t) => t.token === token);
    if (!entry) return res.status(401).json({ error: "Invalid token" });
    if (entry.expires_at && Date.now() > Date.parse(entry.expires_at)) {
      store.tokens = store.tokens.filter((t) => t.token !== token);
      saveStore(store);
      return res.status(401).json({ error: "Session expired" });
    }
    const user = store.users.find((u) => u.id === entry.user_id);
    if (!user) return res.status(401).json({ error: "Invalid token" });
    entry.last_seen_at = new Date().toISOString();
    saveStore(store);
    req.adminEmail = user.email;
    req.adminId = user.id;
    next();
  } catch (err) {
    console.error("AUTH ERROR", err);
    res.status(500).json({ error: "Auth error" });
  }
}

async function issueToken(userId) {
  const store = loadStore();
  const token = makeToken();
  const ttlMinutes = 480;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  store.tokens.push({
    token,
    user_id: userId,
    created_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    expires_at: expiresAt
  });
  saveStore(store);
  return { token, expiresAt };
}

// Multer storage for announcements
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SITE_DIR),
  filename: (req, file, cb) => {
    if (file.fieldname === "pptx") return cb(null, "announcements.pptx");
    return cb(null, "announcements.pdf");
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    const ext = path.extname(file.originalname || "").toLowerCase();
    const isPdf = mime === "application/pdf" || ext === ".pdf";
    const isPptx =
      mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
      mime === "application/vnd.ms-powerpoint" ||
      mime === "application/octet-stream" || // some browsers when downloaded
      ext === ".pptx" || ext === ".ppt" || ext === ".ppsx" || ext === ".pps";
    const ok =
      (file.fieldname === "pdf" && isPdf) ||
      (file.fieldname === "pptx" && (isPptx || true)); // accept pptx field even if mime is odd
    if (!ok) {
      return cb(new Error("Only PDF or PPTX files are allowed"));
    }
    cb(null, true);
  },
});

// Routes
app.post("/api/login", (req, res) => {
  const { email = "", password = "" } = req.body || {};
  (async () => {
    try {
      const store = loadStore();
      const user = store.users.find(
        (u) => String(u.email || "").toLowerCase().trim() === String(email).toLowerCase().trim()
      );
      if (!user || !verifyPassword(user.pass_hash, password)) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const { token, expiresAt } = await issueToken(user.id);
      return res.json({ token, email: user.email, expires_at: expiresAt });
    } catch (err) {
      console.error("LOGIN ERROR", err);
      return res.status(500).json({ error: "Login failed" });
    }
  })();
});

app.get("/api/me", authFromBearer, (req, res) => {
  res.json({ email: req.adminEmail });
});

app.post(
  "/api/upload-announcement",
  upload.fields([{ name: "pdf", maxCount: 1 }, { name: "pptx", maxCount: 1 }]),
  (req, res) => {
    const saved = [];
    if (req.files?.pdf) saved.push("PDF");
    if (req.files?.pptx) saved.push("PPTX");
    if (!saved.length) return res.status(400).json({ error: "No files uploaded" });
    console.log("Uploaded announcements:", {
      user: req.adminEmail,
      pdf: !!req.files?.pdf,
      pptx: !!req.files?.pptx,
      time: new Date().toISOString(),
    });
    return res.json({ ok: true, saved });
  }
);

app.post("/api/delete-announcement", (req, res) => {
  const { kind } = req.body || {};
  const target = kind === "pptx" ? ANNOUNCEMENT_PPTX : ANNOUNCEMENT_PDF;
  if (!target) return res.status(400).json({ error: "Unknown file type" });
  try {
    if (fs.existsSync(target)) {
      fs.unlinkSync(target);
      console.log("Deleted announcement file:", target);
      return res.json({ ok: true, deleted: kind });
    }
    return res.status(404).json({ error: "File not found" });
  } catch (err) {
    console.error("DELETE ANNOUNCEMENT ERROR:", err);
    return res.status(500).json({ error: "Could not delete file" });
  }
});

app.get("/api/status", (req, res) => {
  const files = [];
  if (fs.existsSync(ANNOUNCEMENT_PDF)) files.push("pdf");
  if (fs.existsSync(ANNOUNCEMENT_PPTX)) files.push("pptx");
  res.json({ ok: true, files });
});

// Fallback to index
app.get("/", (req, res) => {
  res.sendFile(path.join(SITE_DIR, "church_HOME.html"));
});

// startup with port retry
(async () => {
  try {
    await seedAdmin();
    const server = app.listen(PORT, () => {
      console.log(`Admin backend running on http://localhost:${PORT}`);
    });
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE" && PORT === DEFAULT_PORT) {
        PORT = DEFAULT_PORT + 1;
        console.warn(`Port ${DEFAULT_PORT} busy; retrying on ${PORT}...`);
        app.listen(PORT, () => {
          console.log(`Admin backend running on http://localhost:${PORT}`);
        });
      } else {
        console.error("Startup failed", err);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error("Startup failed", err);
    process.exit(1);
  }
})();
