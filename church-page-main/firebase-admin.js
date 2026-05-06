import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    EmailAuthProvider,
    createUserWithEmailAndPassword,
    getAuth,
    onAuthStateChanged,
    reauthenticateWithCredential,
    reload,
    sendEmailVerification,
    signInWithEmailAndPassword,
    signOut,
    updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { EMAIL_INVITE_ENDPOINT, firebaseConfig, FIRESTORE_PATHS } from "./firebase-config.js";
import {
    FALLBACK_PDF_URL,
    FALLBACK_PPTX_URL,
    emailKey,
    formatUpdatedAt,
    isHttpUrl,
    makeDownloadUrl,
    makePreviewUrl,
    resolvePublishedUrl
} from "./firebase-utils.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const sheetStatus = document.getElementById("sheetStatus");
const loginStatus = document.getElementById("loginStatus");
const registerStatus = document.getElementById("registerStatus");
const linkStatus = document.getElementById("linkStatus");
const removeStatus = document.getElementById("removeStatus");
const inviteStatus = document.getElementById("inviteStatus");
const passwordStatus = document.getElementById("passwordStatus");
const authSection = document.getElementById("authSection");
const adminSection = document.getElementById("adminSection");
const adminList = document.getElementById("adminList");
const currentAdmin = document.getElementById("currentAdmin");
const pdfLink = document.getElementById("pdfLink");
const pptxLink = document.getElementById("pptxLink");
const pdfFrame = document.getElementById("pdfFrame");
const pdfName = document.getElementById("pdfName");
const pptxName = document.getElementById("pptxName");
const updatedAt = document.getElementById("updatedAt");
const pdfUrlInput = document.getElementById("pdfUrl");
const pptxUrlInput = document.getElementById("pptxUrl");
const previewWrap = document.getElementById("adminPreviewWrap");

let activeAdmin = null;

function setStatus(el, msg, isError = false) {
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#f29b9b" : "";
}

function strongPassword(value) {
    return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && value.length >= 8;
}

function setLinkState(anchor, url, enabledText, disabledText) {
    if (!anchor) return;

    if (!url) {
        anchor.href = "#";
        anchor.textContent = disabledText;
        anchor.setAttribute("aria-disabled", "true");
        anchor.classList.add("is-disabled");
        return;
    }

    anchor.href = makeDownloadUrl(url);
    anchor.textContent = enabledText;
    anchor.removeAttribute("aria-disabled");
    anchor.classList.remove("is-disabled");
}

function renderAnnouncementState(data = {}) {
    const pdfUrl = resolvePublishedUrl(data.pdfUrl, FALLBACK_PDF_URL);
    const pptxUrl = resolvePublishedUrl(data.pptxUrl, FALLBACK_PPTX_URL);

    if (pdfUrlInput) pdfUrlInput.value = data.pdfUrl || "";
    if (pptxUrlInput) pptxUrlInput.value = data.pptxUrl || "";

    setLinkState(pdfLink, pdfUrl, "Open current PDF", "PDF link not set");
    setLinkState(pptxLink, pptxUrl, "Open current PPTX", "PPTX link not set");

    if (pdfFrame) {
        if (pdfUrl) {
            pdfFrame.hidden = false;
            pdfFrame.src = makePreviewUrl(pdfUrl);
            if (previewWrap) previewWrap.hidden = false;
        } else {
            pdfFrame.hidden = true;
            pdfFrame.removeAttribute("src");
            if (previewWrap) previewWrap.hidden = true;
        }
    }

    if (pdfName) pdfName.textContent = pdfUrl ? "PDF link ready" : "PDF link not set";
    if (pptxName) pptxName.textContent = pptxUrl ? "PPTX link ready" : "PPTX link not set";

    const updated = formatUpdatedAt(data.updatedAt);
    if (updatedAt) updatedAt.textContent = updated ? `Updated: ${updated}` : "Not updated yet";
}

async function loadAnnouncementLinks() {
    const ref = doc(db, FIRESTORE_PATHS.site, FIRESTORE_PATHS.announcements);
    const snap = await getDoc(ref);
    renderAnnouncementState(snap.exists() ? snap.data() : {});
}

async function ensureApprovedAdmin(user) {
    const adminRef = doc(db, FIRESTORE_PATHS.admins, user.uid);
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists() && adminSnap.data().active === true) {
        return adminSnap.data();
    }

    await reload(user);
    if (!user.emailVerified) {
        throw new Error("Verify this email before using admin access.");
    }

    const key = emailKey(user.email);
    await setDoc(adminRef, {
        email: user.email,
        emailKey: key,
        role: "admin",
        active: true,
        claimedAt: serverTimestamp(),
        createdAt: serverTimestamp()
    }, { merge: true });

    const claimedSnap = await getDoc(adminRef);
    if (claimedSnap.exists() && claimedSnap.data().active === true) {
        return claimedSnap.data();
    }

    throw new Error("This email is not approved for admin access.");
}

function showSignedOut() {
    activeAdmin = null;
    authSection.hidden = false;
    adminSection.hidden = true;
    if (currentAdmin) currentAdmin.textContent = "";
    setStatus(sheetStatus, "Firebase ready. Waiting for login...");
}

async function showAuthed(user, adminData) {
    activeAdmin = { user, adminData };
    authSection.hidden = true;
    adminSection.hidden = false;
    const label = adminData.username || adminData.email || user.email;
    setStatus(sheetStatus, `Signed in as ${label}`);
    if (currentAdmin) currentAdmin.textContent = `${label} (${adminData.role || "admin"})`;
    await Promise.all([loadAnnouncementLinks(), refreshAdmins()]);
}

async function handleLogin(event) {
    event.preventDefault();
    setStatus(loginStatus, "Checking...");

    const email = document.getElementById("identifier").value.trim();
    const password = document.getElementById("password").value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        setStatus(loginStatus, "Welcome.");
    } catch (err) {
        setStatus(loginStatus, err.message, true);
    }
}

async function handleCreateAccount(event) {
    event.preventDefault();
    setStatus(registerStatus, "Creating account...");

    const email = document.getElementById("registerEmail").value.trim();
    const password = document.getElementById("registerPassword").value;
    const confirm = document.getElementById("registerConfirm").value;

    if (password !== confirm) {
        setStatus(registerStatus, "Passwords do not match.", true);
        return;
    }

    if (!strongPassword(password)) {
        setStatus(registerStatus, "Use at least 8 characters with uppercase, lowercase, and a number.", true);
        return;
    }

    try {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(credential.user);
        document.getElementById("registerForm").reset();
        setStatus(registerStatus, "Account created. Verify the email, then sign in.");
        await signOut(auth);
    } catch (err) {
        setStatus(registerStatus, err.message, true);
    }
}

async function handleSaveLinks(event) {
    event.preventDefault();
    setStatus(linkStatus, "Saving links...");

    const pdfUrl = pdfUrlInput.value.trim();
    const pptxUrl = pptxUrlInput.value.trim();

    if (!isHttpUrl(pdfUrl) || !isHttpUrl(pptxUrl)) {
        setStatus(linkStatus, "Use full links starting with http:// or https://.", true);
        return;
    }

    try {
        await setDoc(doc(db, FIRESTORE_PATHS.site, FIRESTORE_PATHS.announcements), {
            pdfUrl,
            pptxUrl,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || ""
        }, { merge: true });
        setStatus(linkStatus, "Announcement links saved.");
        await loadAnnouncementLinks();
    } catch (err) {
        setStatus(linkStatus, err.message, true);
    }
}

async function handleClear(kind) {
    setStatus(removeStatus, `Clearing ${kind.toUpperCase()} link...`);
    const field = kind === "pptx" ? "pptxUrl" : "pdfUrl";

    try {
        await setDoc(doc(db, FIRESTORE_PATHS.site, FIRESTORE_PATHS.announcements), {
            [field]: "",
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || ""
        }, { merge: true });
        setStatus(removeStatus, `${kind.toUpperCase()} link cleared.`);
        await loadAnnouncementLinks();
    } catch (err) {
        setStatus(removeStatus, err.message, true);
    }
}

async function handleChangePassword(event) {
    event.preventDefault();
    setStatus(passwordStatus, "Updating password...");

    const user = auth.currentUser;
    const currentPassword = document.getElementById("currentPassword").value;
    const newPassword = document.getElementById("newPassword").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!user?.email) {
        setStatus(passwordStatus, "Please sign in again.", true);
        return;
    }

    if (newPassword !== confirmPassword) {
        setStatus(passwordStatus, "New passwords do not match.", true);
        return;
    }

    if (!strongPassword(newPassword)) {
        setStatus(passwordStatus, "Use at least 8 characters with uppercase, lowercase, and a number.", true);
        return;
    }

    try {
        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);
        document.getElementById("changePasswordForm").reset();
        setStatus(passwordStatus, "Password updated.");
    } catch (err) {
        setStatus(passwordStatus, err.message, true);
    }
}

function makeInviteMailto(email) {
    const adminUrl = `${window.location.origin}${window.location.pathname}`;
    const subject = "JCIOTRIM admin access";
    const body = [
        "Hello,",
        "",
        "You have been approved as a JCIOTRIM technical admin.",
        "",
        `Open this page: ${adminUrl}`,
        "Choose Create approved account, verify your email, then sign in.",
        "",
        "Keep your password private."
    ].join("\n");

    return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function requestInviteEmail(email) {
    if (!EMAIL_INVITE_ENDPOINT) return false;

    const user = auth.currentUser;
    if (!user) throw new Error("Please sign in again.");

    const idToken = await user.getIdToken();
    const adminUrl = `${window.location.origin}${window.location.pathname}`;
    const payload = JSON.stringify({ idToken, email, adminUrl });

    await fetch(EMAIL_INVITE_ENDPOINT, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload
    });

    return true;
}

async function handleApproveAdmin(event) {
    event.preventDefault();
    setStatus(inviteStatus, "Approving admin email...");

    const email = document.getElementById("approveEmail").value.trim().toLowerCase();
    if (!email) {
        setStatus(inviteStatus, "Enter an email address.", true);
        return;
    }

    try {
        const key = emailKey(email);
        await setDoc(doc(db, FIRESTORE_PATHS.adminEmails, key), {
            email,
            emailKey: key,
            role: "admin",
            active: true,
            createdAt: serverTimestamp(),
            invitedBy: auth.currentUser?.email || ""
        }, { merge: true });

        const emailRequested = await requestInviteEmail(email);
        document.getElementById("approveAdminForm").reset();
        renderInviteStatus(email, emailRequested);
        await refreshAdmins();
    } catch (err) {
        setStatus(inviteStatus, err.message, true);
    }
}

function renderInviteStatus(email, emailRequested = false) {
    if (!inviteStatus) return;
    inviteStatus.textContent = "";
    inviteStatus.style.color = "";

    const text = document.createElement("span");
    text.textContent = emailRequested ? `${email} is approved. Invite email request sent. ` : `${email} is approved. `;
    const link = document.createElement("a");
    link.href = makeInviteMailto(email);
    link.textContent = emailRequested ? "Open backup invite" : "Open email invite";
    inviteStatus.append(text, link);
}

function makeAdminItem(label, detail) {
    const li = document.createElement("li");
    const span = document.createElement("span");
    span.textContent = label;
    const small = document.createElement("small");
    small.textContent = detail;
    li.append(span, small);
    return li;
}

function renderAdmins(adminDocs, approvedDocs) {
    if (!adminList) return;
    adminList.textContent = "";

    const adminTitle = document.createElement("h4");
    adminTitle.textContent = "Current admins";
    const adminUl = document.createElement("ul");

    if (!adminDocs.length) {
        adminUl.append(makeAdminItem("No admins found", ""));
    } else {
        adminDocs.forEach(({ id, data }) => {
            adminUl.append(makeAdminItem(data.email || id, data.active === false ? "disabled" : data.role || "admin"));
        });
    }

    const approvedTitle = document.createElement("h4");
    approvedTitle.textContent = "Approved emails";
    const approvedUl = document.createElement("ul");

    if (!approvedDocs.length) {
        approvedUl.append(makeAdminItem("No pending approvals", ""));
    } else {
        approvedDocs.forEach(({ id, data }) => {
            const li = makeAdminItem(data.email || id, data.active === false ? "disabled" : "approved");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "text-button";
            button.textContent = "Remove";
            button.dataset.removeApproved = id;
            li.append(button);
            approvedUl.append(li);
        });
    }

    adminList.append(adminTitle, adminUl, approvedTitle, approvedUl);
}

async function refreshAdmins() {
    try {
        const [adminsSnap, approvedSnap] = await Promise.all([
            getDocs(collection(db, FIRESTORE_PATHS.admins)),
            getDocs(collection(db, FIRESTORE_PATHS.adminEmails))
        ]);

        const admins = adminsSnap.docs.map((adminDoc) => ({ id: adminDoc.id, data: adminDoc.data() }));
        const approved = approvedSnap.docs.map((approvalDoc) => ({ id: approvalDoc.id, data: approvalDoc.data() }));
        renderAdmins(admins, approved);
    } catch (err) {
        console.warn("Admin list failed:", err);
        renderAdmins(activeAdmin ? [{ id: activeAdmin.user.uid, data: activeAdmin.adminData }] : [], []);
    }
}

async function handleAdminListClick(event) {
    const button = event.target.closest("[data-remove-approved]");
    if (!button) return;

    const key = button.dataset.removeApproved;
    setStatus(inviteStatus, "Removing approval...");

    try {
        await deleteDoc(doc(db, FIRESTORE_PATHS.adminEmails, key));
        setStatus(inviteStatus, "Approval removed.");
        await refreshAdmins();
    } catch (err) {
        setStatus(inviteStatus, err.message, true);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showSignedOut();
        return;
    }

    setStatus(sheetStatus, "Checking admin access...");
    try {
        const adminData = await ensureApprovedAdmin(user);
        await showAuthed(user, adminData);
    } catch (err) {
        await signOut(auth);
        showSignedOut();
        setStatus(loginStatus, err.message, true);
    }
});

document.getElementById("loginForm").addEventListener("submit", handleLogin);
document.getElementById("registerForm").addEventListener("submit", handleCreateAccount);
document.getElementById("announcementLinksForm").addEventListener("submit", handleSaveLinks);
document.getElementById("changePasswordForm").addEventListener("submit", handleChangePassword);
document.getElementById("approveAdminForm").addEventListener("submit", handleApproveAdmin);
document.getElementById("removePdf").addEventListener("click", () => handleClear("pdf"));
document.getElementById("removePptx").addEventListener("click", () => handleClear("pptx"));
document.getElementById("logoutButton").addEventListener("click", () => signOut(auth));
adminList?.addEventListener("click", handleAdminListClick);
