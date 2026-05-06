const CONFIG = {
  FIREBASE_API_KEY: "AIzaSyBDhRUTRjT7fvUhx_z64REemz0zmD7H5YU",
  PROJECT_ID: "jciotrim-website",
  ADMIN_URL: "https://jciotrim-website.web.app/admin.html",
  LOGO_URL: "https://jciotrim-website.web.app/CHURCH_LOGO.png",
  SENDER_NAME: "JCIOTRIM Technical Team"
};

function doPost(e) {
  try {
    const payload = JSON.parse((e.postData && e.postData.contents) || "{}");
    const email = normalizeEmail_(payload.email);
    const idToken = String(payload.idToken || "");
    const adminUrl = String(payload.adminUrl || CONFIG.ADMIN_URL);

    if (!email || !idToken) {
      throw new Error("Missing invite request data.");
    }

    const sender = verifyFirebaseToken_(idToken);
    ensureActiveAdmin_(idToken, sender.localId);

    MailApp.sendEmail({
      to: email,
      subject: "JCIOTRIM admin access",
      name: CONFIG.SENDER_NAME,
      htmlBody: buildInviteHtml_(email, adminUrl, sender.email),
      body: buildInviteText_(email, adminUrl, sender.email)
    });

    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

function doGet() {
  return json_({ ok: true, service: "JCIOTRIM admin invite sender" });
}

function verifyFirebaseToken_(idToken) {
  const url = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + encodeURIComponent(CONFIG.FIREBASE_API_KEY);
  const res = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ idToken: idToken }),
    muteHttpExceptions: true
  });

  const data = JSON.parse(res.getContentText() || "{}");
  if (res.getResponseCode() !== 200 || !data.users || !data.users.length) {
    throw new Error("Firebase login could not be verified.");
  }

  return data.users[0];
}

function ensureActiveAdmin_(idToken, uid) {
  const url = "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(CONFIG.PROJECT_ID) +
    "/databases/(default)/documents/admins/" +
    encodeURIComponent(uid);

  const res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + idToken },
    muteHttpExceptions: true
  });

  const data = JSON.parse(res.getContentText() || "{}");
  const active = data.fields && data.fields.active && data.fields.active.booleanValue === true;

  if (res.getResponseCode() !== 200 || !active) {
    throw new Error("Only active JCIOTRIM admins can send invite emails.");
  }
}

function buildInviteText_(email, adminUrl, invitedBy) {
  return [
    "JCIOTRIM admin access",
    "",
    "Hello,",
    "",
    "You have been approved as a JCIOTRIM technical admin.",
    "",
    "Open this page:",
    adminUrl,
    "",
    "Choose Create approved account, verify your email, then sign in.",
    "",
    "Invited by: " + invitedBy,
    "",
    "Keep your password private."
  ].join("\n");
}

function buildInviteHtml_(email, adminUrl, invitedBy) {
  const safeEmail = escapeHtml_(email);
  const safeUrl = escapeHtml_(adminUrl);
  const safeInvitedBy = escapeHtml_(invitedBy || "");
  const safeLogo = escapeHtml_(CONFIG.LOGO_URL);

  return `
  <div style="margin:0;padding:32px;background:#f3f6fb;font-family:Arial,Helvetica,sans-serif;color:#202938;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;border-collapse:collapse;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 16px 40px rgba(31,41,55,.12);">
            <tr>
              <td style="padding:32px 34px;text-align:center;background:#16052f;">
                <img src="${safeLogo}" alt="JCIOTRIM" width="88" height="88" style="display:block;margin:0 auto 18px;border-radius:18px;object-fit:cover;">
                <div style="font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:#cbb8ff;font-weight:700;">JCIOTRIM</div>
                <h1 style="margin:8px 0 0;font-size:28px;line-height:1.2;color:#ffffff;">Admin Access Invitation</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:34px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Hello,</p>
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">You have been approved as a <strong>JCIOTRIM technical admin</strong>.</p>
                <p style="margin:0 0 24px;font-size:16px;line-height:1.6;">Use the button below to open the admin page. Create your approved account, verify your email, then sign in.</p>
                <p style="margin:0 0 26px;text-align:center;">
                  <a href="${safeUrl}" style="display:inline-block;background:#7e3cff;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:10px;">Go to JCIOTRIM Admin</a>
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f7f4ff;border:1px solid #e2d7ff;border-radius:12px;">
                  <tr>
                    <td style="padding:16px 18px;font-size:14px;line-height:1.6;color:#374151;">
                      <strong>Email:</strong> ${safeEmail}<br>
                      <strong>Invited by:</strong> ${safeInvitedBy}
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Keep your password private. If you did not expect this invitation, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

function normalizeEmail_(email) {
  return String(email || "").trim().toLowerCase();
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
