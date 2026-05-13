const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const nodemailer = require("nodemailer");
let bcrypt;
try { bcrypt = require("bcryptjs"); } catch (_) { bcrypt = null; }

const app = express();
const DEFAULT_PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
let PORT = DEFAULT_PORT;

// Paths
const SITE_DIR = path.join(__dirname, "church-page-main");
const ADMIN_DB_JSON = path.join(SITE_DIR, "admin-db.json");
const AUTH_STORE = path.join(SITE_DIR, "admin-auth.json");
const MAIL_CONFIG = path.join(SITE_DIR, "admin-mail.json");
const ANNOUNCEMENT_PDF = path.join(SITE_DIR, "announcements.pdf");
const ANNOUNCEMENT_PPTX = path.join(SITE_DIR, "announcements.pptx");
const DEFAULT_ADMIN_EMAIL = normalizeEmail(process.env.LEGACY_ADMIN_EMAIL || "local-admin@example.invalid");
const DEFAULT_ADMIN_USERNAME = normalizeLogin(process.env.LEGACY_ADMIN_USERNAME || "local admin");
const DEFAULT_ADMIN_PASSWORD = String(process.env.LEGACY_ADMIN_PASSWORD || "");
const LEGACY_ADMIN_PASSWORD = String(process.env.LEGACY_ADMIN_PASSWORD_ALT || "");

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

function hashPassword(value) {
  if (bcrypt) {
    return bcrypt.hashSync(String(value), 10);
  }
  return sha256(value);
}

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function strongPassword(value) {
  const s = String(value || "");
  return s.length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s);
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

function isDefaultAdmin(user) {
  const email = normalizeLogin(user?.email);
  const username = normalizeLogin(user?.username);
  return email === DEFAULT_ADMIN_EMAIL || username === DEFAULT_ADMIN_USERNAME;
}

function userMatchesLogin(user, identifier) {
  const id = normalizeLogin(identifier);
  if (!id) return false;
  const email = normalizeLogin(user?.email);
  const username = normalizeLogin(user?.username);
  return (
    id === email ||
    id === username ||
    (isDefaultAdmin(user) && id === DEFAULT_ADMIN_USERNAME)
  );
}

function verifyUserPassword(user, plain) {
    if (verifyPassword(user?.pass_hash, plain)) return true;
    if (!isDefaultAdmin(user) || !DEFAULT_ADMIN_PASSWORD || !LEGACY_ADMIN_PASSWORD) return false;

  if (String(plain) === DEFAULT_ADMIN_PASSWORD) {
    return verifyPassword(user?.pass_hash, LEGACY_ADMIN_PASSWORD);
  }
  if (String(plain) === LEGACY_ADMIN_PASSWORD) {
    return verifyPassword(user?.pass_hash, DEFAULT_ADMIN_PASSWORD);
  }
  return false;
}

async function seedAdmin() {
  const store = loadStore();
  if (store.users.length) {
    const admin = store.users.find((u) => normalizeLogin(u.role) === "admin") || store.users[0];
    let changed = false;
    if (admin && !admin.username) {
      admin.username = DEFAULT_ADMIN_USERNAME;
      changed = true;
    }
    if (admin && !admin.email) {
      admin.email = DEFAULT_ADMIN_EMAIL;
      changed = true;
    }
    if (admin && normalizeLogin(admin.role) !== "admin") {
      admin.role = "Admin";
      changed = true;
    }
    if (changed) saveStore(store);
    return;
  }
  let seedEmail = "admin@example.com";
  let seedUsername = DEFAULT_ADMIN_USERNAME;
  let seedHash = sha256(process.env.LEGACY_SEED_PASSWORD || crypto.randomBytes(24).toString("hex"));
  try {
    const raw = JSON.parse(fs.readFileSync(ADMIN_DB_JSON, "utf8"));
    if (raw.admins && raw.admins[0]) {
      seedEmail = String(raw.admins[0].email || seedEmail).toLowerCase().trim();
      seedUsername = String(raw.admins[0].username || seedUsername).toLowerCase().trim();
      seedHash = String(raw.admins[0].passwordHash || seedHash).trim();
    }
  } catch (_) {}
  store.users.push({
    id: nextId(store.users),
    email: seedEmail,
    username: seedUsername,
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

function makeTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(14);
  let value = "";
  for (const byte of bytes) {
    value += alphabet[byte % alphabet.length];
  }
  return value + "7Aa";
}

function makeInviteToken() {
  return crypto.randomBytes(32).toString("hex");
}

function addInviteTokenToUrl(baseUrl, inviteToken) {
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("invite", inviteToken);
    return url.toString();
  } catch (_) {
    const joiner = String(baseUrl).includes("?") ? "&" : "?";
    return `${baseUrl}${joiner}invite=${encodeURIComponent(inviteToken)}`;
  }
}

function deriveUsername(email, users) {
  const base = normalizeEmail(email).split("@")[0].replace(/[^a-z0-9]+/g, " ").trim() || "admin";
  let username = base;
  let suffix = 2;
  while (users.some((u) => normalizeLogin(u.username) === normalizeLogin(username))) {
    username = `${base} ${suffix}`;
    suffix += 1;
  }
  return username;
}

function adminPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username || user.email,
    role: user.role || "Admin",
    created_at: user.created_at || "",
    invited_by: user.invited_by || "",
    invite_sent_at: user.invite_sent_at || ""
  };
}

function loadMailConfig() {
  const envConfig = {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587) || 587,
    secure: String(process.env.SMTP_SECURE || "0") === "1",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    fromName: process.env.SMTP_FROM_NAME || "JCIOTRIM Admin",
    fromEmail: process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || ""
  };

  try {
    const raw = JSON.parse(fs.readFileSync(MAIL_CONFIG, "utf8"));
    return {
      host: String(raw.host || envConfig.host || "smtp.gmail.com").trim(),
      port: Number(raw.port || envConfig.port || 587) || 587,
      secure: Boolean(raw.secure ?? envConfig.secure),
      user: String(raw.user || envConfig.user || "").trim(),
      pass: String(raw.pass || envConfig.pass || ""),
      fromName: String(raw.fromName || envConfig.fromName || "JCIOTRIM Admin").trim(),
      fromEmail: String(raw.fromEmail || envConfig.fromEmail || raw.user || envConfig.user || "").trim()
    };
  } catch (_) {
    return envConfig;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendAdminInviteEmail({ toEmail, username, temporaryPassword, inviteToken, invitedBy }) {
  const mail = loadMailConfig();
  if (!mail.host || !mail.user || !mail.pass || !mail.fromEmail) {
    throw new Error("Email is not configured. Add church-page-main/admin-mail.json or SMTP environment variables.");
  }

  const transporter = nodemailer.createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    auth: {
      user: mail.user,
      pass: mail.pass
    }
  });

  const loginUrl = addInviteTokenToUrl(process.env.PUBLIC_ADMIN_URL || "http://localhost:3000/admin.html", inviteToken);
  const fromName = mail.fromName.replace(/"/g, "");
  const safeLoginUrl = escapeHtml(loginUrl);
  const safeUsername = escapeHtml(username);
  const safeToEmail = escapeHtml(toEmail);
  const safeTemporaryPassword = escapeHtml(temporaryPassword);
  const safeInvitedBy = escapeHtml(invitedBy);
  await transporter.sendMail({
    from: `"${fromName}" <${mail.fromEmail}>`,
    to: toEmail,
    subject: "JCIOTRIM Technical Admin Invitation",
    text:
      "You have been invited to join the JCIOTRIM technical admin team.\n\n" +
      `Admin page: ${loginUrl}\n` +
      `Username: ${username}\n` +
      `Email: ${toEmail}\n` +
      `Temporary password: ${temporaryPassword}\n\n` +
      `Invited by: ${invitedBy}\n\n` +
      "Click the admin page link to sign in from this invitation, then use the Change password section to set your own password.\n\n" +
      "Please keep this message private. If you were not expecting this invitation, contact the church technical lead before signing in.",
    html: `
      <div style="margin:0;padding:28px;background:#f4f2fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e7e1f5;border-radius:18px;overflow:hidden;box-shadow:0 10px 28px rgba(31,41,55,.08);">
          <div style="padding:26px 30px;background:linear-gradient(135deg,#1c0436,#0c154f);color:#ffffff;">
            <div style="text-align:center;margin-bottom:18px;">
              <img src="cid:jciotrim-logo" alt="JCIOTRIM" style="width:96px;height:96px;object-fit:contain;border-radius:18px;background:#ffffff;padding:8px;display:inline-block;" />
            </div>
            <div style="font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#d8caf6;text-align:center;">JCIOTRIM</div>
            <h1 style="margin:8px 0 0;font-size:25px;line-height:1.25;font-weight:800;">Technical Admin Invitation</h1>
          </div>

          <div style="padding:30px;">
            <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">You have been invited to help manage JCIOTRIM announcements as part of the church technical team.</p>

            <div style="margin:22px 0;padding:18px;border:1px solid #e8e2f3;border-radius:14px;background:#faf8ff;">
              <p style="margin:0 0 12px;font-size:14px;color:#5b526d;">Use the details below to sign in:</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px;">
                <tr>
                  <td style="padding:8px 0;color:#6b617d;width:150px;">Username</td>
                  <td style="padding:8px 0;font-weight:700;color:#1f2937;">${safeUsername}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b617d;">Email</td>
                  <td style="padding:8px 0;font-weight:700;color:#1f2937;">${safeToEmail}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#6b617d;">Temporary password</td>
                  <td style="padding:8px 0;">
                    <span style="display:inline-block;padding:8px 10px;border-radius:8px;background:#ffffff;border:1px solid #ded6ee;font-family:Consolas,Monaco,monospace;font-size:16px;font-weight:700;letter-spacing:.04em;color:#26113f;">${safeTemporaryPassword}</span>
                  </td>
                </tr>
              </table>
            </div>

            <p style="margin:0 0 24px;">
              <a href="${safeLoginUrl}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#7e3cff;color:#ffffff;text-decoration:none;font-weight:700;">Go to JCIOTRIM Admin</a>
            </p>

            <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b526d;">This invitation was requested by <strong>${safeInvitedBy}</strong>.</p>
            <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5b526d;">This button signs you in from the invitation and takes you to the admin page. Use the <strong>Change password</strong> section with the temporary password above to set your own password.</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#5b526d;">Please keep this message private. If you were not expecting this invitation, contact the church technical lead before signing in.</p>
          </div>

          <div style="padding:18px 30px;background:#f9f7fd;border-top:1px solid #eee8f8;color:#7a728a;font-size:12px;line-height:1.5;">
            Jesus Christ Is Our True Religion International Ministry
          </div>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: "CHURCH_LOGO.png",
        path: path.join(SITE_DIR, "CHURCH_LOGO.png"),
        cid: "jciotrim-logo"
      }
    ]
  });
}

async function authFromBearer(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
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
    req.adminUsername = user.username || user.email;
    req.adminMustChangePassword = !!user.must_change_password;
    req.authToken = token;
    next();
  } catch (err) {
    console.error("AUTH ERROR", err);
    res.status(500).json({ error: "Auth error" });
  }
}

async function issueToken(userId) {
  const store = loadStore();
  return issueTokenForStore(store, userId);
}

async function issueTokenForStore(store, userId) {
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
async function handleLogin(req, res) {
  const { identifier = "", email = "", username = "", password = "" } = req.body || {};
  try {
    const loginId = identifier || username || email;
    if (!loginId || !password) {
      return res.status(400).json({ error: "Enter username/email and password" });
    }
    const store = loadStore();
    const user = store.users.find((u) => userMatchesLogin(u, loginId));
    if (!user || !verifyUserPassword(user, password)) {
      return res.status(401).json({ error: "Invalid username/email or password" });
    }
    const { token, expiresAt } = await issueToken(user.id);
    return res.json({
      ok: true,
      token,
      id: user.id,
      email: user.email,
      username: user.username || user.email,
      role: user.role || "Admin",
      must_change_password: !!user.must_change_password,
      expires_at: expiresAt
    });
  } catch (err) {
    console.error("LOGIN ERROR", err);
    return res.status(500).json({ error: "Login failed" });
  }
}

app.post("/api/auth/invite-login", async (req, res) => {
  const inviteToken = String(req.body?.inviteToken || "").trim();
  try {
    if (!inviteToken) {
      return res.status(400).json({ error: "Missing invite token" });
    }

    const store = loadStore();
    const inviteHash = sha256(inviteToken);
    const user = store.users.find((u) => u.invite_token_hash === inviteHash);
    if (!user) {
      return res.status(401).json({ error: "Invalid or expired invite link" });
    }

    const expiresAt = Date.parse(user.invite_expires_at || "");
    if (Number.isNaN(expiresAt) || Date.now() > expiresAt) {
      delete user.invite_token_hash;
      delete user.invite_expires_at;
      saveStore(store);
      return res.status(401).json({ error: "Invite link expired. Ask for a new invite." });
    }

    delete user.invite_token_hash;
    delete user.invite_expires_at;
    user.invite_login_used_at = new Date().toISOString();
    const { token, expiresAt: sessionExpiresAt } = await issueTokenForStore(store, user.id);
    return res.json({
      ok: true,
      token,
      id: user.id,
      email: user.email,
      username: user.username || user.email,
      role: user.role || "Admin",
      must_change_password: !!user.must_change_password,
      expires_at: sessionExpiresAt
    });
  } catch (err) {
    console.error("INVITE LOGIN ERROR", err);
    return res.status(500).json({ error: "Invite login failed" });
  }
});

app.post("/api/login", handleLogin);
app.post("/api/auth/login", handleLogin);

function authUserPayload(req) {
  return {
    id: req.adminId,
    email: req.adminEmail,
    username: req.adminUsername || req.adminEmail,
    role: "Admin",
    must_change_password: !!req.adminMustChangePassword
  };
}

app.get("/api/auth/me", authFromBearer, (req, res) => {
  res.json({ user: authUserPayload(req) });
});

app.get("/api/me", authFromBearer, (req, res) => {
  const user = authUserPayload(req);
  res.json({ email: user.email, username: user.username, role: user.role, must_change_password: user.must_change_password });
});

app.post("/api/auth/logout", authFromBearer, (req, res) => {
  const store = loadStore();
  store.tokens = store.tokens.filter((t) => t.token !== req.authToken);
  saveStore(store);
  res.json({ ok: true });
});

app.post("/api/auth/change-password", authFromBearer, (req, res) => {
  const { currentPassword = "", newPassword = "", confirmPassword = "" } = req.body || {};
  try {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ error: "Complete all password fields" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New passwords do not match" });
    }
    if (!strongPassword(newPassword)) {
      return res.status(400).json({ error: "Use at least 8 characters with uppercase, lowercase, and a number" });
    }

    const store = loadStore();
    const user = store.users.find((u) => u.id === req.adminId);
    if (!user) return res.status(401).json({ error: "Please sign in to continue" });
    if (!verifyUserPassword(user, currentPassword)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }

    user.pass_hash = hashPassword(newPassword);
    user.must_change_password = false;
    user.password_changed_at = new Date().toISOString();
    delete user.invite_token_hash;
    delete user.invite_expires_at;
    store.tokens = store.tokens.filter((t) => t.token === req.authToken);
    saveStore(store);
    res.json({ ok: true });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR", err);
    res.status(500).json({ error: "Could not change password" });
  }
});

app.get("/api/admins", authFromBearer, (req, res) => {
  const store = loadStore();
  const admins = store.users
    .filter((u) => normalizeLogin(u.role || "Admin") === "admin")
    .map(adminPublicUser);
  res.json({ admins });
});

app.post("/api/admins/invite", authFromBearer, async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  try {
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Enter a valid email address" });
    }

    const store = loadStore();
    const existing = store.users.find((u) => normalizeEmail(u.email) === email);
    if (existing) {
      return res.status(409).json({ error: "That email already has admin access" });
    }

    const username = deriveUsername(email, store.users);
    const temporaryPassword = makeTemporaryPassword();
    const inviteToken = makeInviteToken();
    const now = new Date().toISOString();
    const user = {
      id: nextId(store.users),
      email,
      username,
      pass_hash: hashPassword(temporaryPassword),
      role: "Admin",
      created_at: now,
      invited_by: req.adminEmail,
      invite_sent_at: now,
      invite_token_hash: sha256(inviteToken),
      invite_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      must_change_password: true
    };

    await sendAdminInviteEmail({
      toEmail: email,
      username,
      temporaryPassword,
      inviteToken,
      invitedBy: req.adminEmail
    });

    store.users.push(user);
    saveStore(store);
    return res.json({ ok: true, admin: adminPublicUser(user) });
  } catch (err) {
    console.error("ADMIN INVITE ERROR", err);
    return res.status(500).json({ error: err.message || "Could not send admin invite" });
  }
});

app.post(
  "/api/upload-announcement",
  authFromBearer,
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

app.post("/api/delete-announcement", authFromBearer, (req, res) => {
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
