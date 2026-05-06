# Church Site

JCIOTRIM church site with a Firebase-ready online admin flow.

## Online Free Setup

The public pages can run on Firebase Hosting or GitHub Pages. The online admin uses:

- Firebase Authentication for admin sign-in
- Cloud Firestore for announcement links and approved admins
- Google Drive links for PDF/PPTX announcement files

Deploy to Firebase Hosting:

```bash
npm run deploy:firebase
```

Before deploying, publish the rules in `firestore.rules` from the Firebase Console or Firebase CLI.

## Local PC Setup

The old Node server still serves the site locally:

```bash
npm install
npm start
```

Open:

```text
http://localhost:3000/admin.html
```

## GitHub Notes

Do not upload `node_modules`. GitHub should contain `package.json` and `package-lock.json`; a PC/server rebuilds dependencies with `npm install`.

Keep these local files out of GitHub:

```text
church-page-main/admin-auth.json
church-page-main/admin-db.json
church-page-main/admin-mail.json
church-page-main/announcements.pdf
church-page-main/announcements.pptx
```

The Firebase web config in `church-page-main/firebase-config.js` is public config, not a password. Never upload Gmail app passwords, service account keys, or private keys.

## Optional Gmail Invite Emails

For professional Gmail invite emails without exposing a Gmail app password, use Google Apps Script:

1. Create a new Apps Script project at `https://script.google.com`.
2. Paste `apps-script/admin-invite.gs` into `Code.gs`.
3. Deploy it as a Web App.
4. Set **Execute as** to your Google account.
5. Set **Who has access** to **Anyone**.
6. Copy the Web App `/exec` URL.
7. Paste that URL into `EMAIL_INVITE_ENDPOINT` in `church-page-main/firebase-config.js`.
8. Commit, push, and run `firebase deploy`.

The web app still checks the Firebase ID token and Firestore admin record before sending email.
