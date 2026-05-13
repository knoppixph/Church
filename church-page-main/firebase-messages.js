import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    orderBy,
    query,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, FIRESTORE_PATHS } from "./firebase-config.js";
import { formatUpdatedAt } from "./firebase-utils.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const statusEl = document.getElementById("messagesStatus");
const loginStatus = document.getElementById("messagesLoginStatus");
const authSection = document.getElementById("messagesAuthSection");
const adminSection = document.getElementById("messagesAdminSection");
const currentAdmin = document.getElementById("messagesCurrentAdmin");
const messageList = document.getElementById("messageList");

let activeUser = null;

function setStatus(el, message, isError = false) {
    if (!el) return;
    el.textContent = message;
    el.style.color = isError ? "#f29b9b" : "";
}

function showSignedOut() {
    activeUser = null;
    authSection.hidden = false;
    adminSection.hidden = true;
    setStatus(statusEl, "Sign in with an approved admin account to view messages.");
    if (currentAdmin) currentAdmin.textContent = "";
}

async function ensureAdmin(user) {
    const adminSnap = await getDoc(doc(db, FIRESTORE_PATHS.admins, user.uid));
    if (adminSnap.exists() && adminSnap.data().active === true) {
        return adminSnap.data();
    }
    throw new Error("This account is not approved for admin access.");
}

function formatDate(value) {
    const formatted = formatUpdatedAt(value);
    if (formatted) return formatted;
    if (value?.toDate) return value.toDate().toLocaleString();
    return "No date available";
}

function createMessageCard(id, data) {
    const article = document.createElement("article");
    article.className = `message-card ${data.status === "done" ? "is-done" : ""}`;

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const name = document.createElement("h3");
    name.textContent = data.name || "Unnamed sender";

    const status = document.createElement("span");
    status.className = "message-status";
    status.textContent = data.status === "done" ? "Done" : data.status === "read" ? "Read" : "New";

    meta.append(name, status);

    const contact = document.createElement("p");
    contact.className = "doc-note";
    contact.textContent = `Contact: ${data.contact || "No contact info"} | Sent: ${formatDate(data.createdAt)}`;

    const message = document.createElement("p");
    message.className = "message-body";
    message.textContent = data.message || "";

    const actions = document.createElement("div");
    actions.className = "cta-group";

    const readButton = document.createElement("button");
    readButton.type = "button";
    readButton.className = "button ghost";
    readButton.textContent = "Mark read";
    readButton.dataset.action = "read";
    readButton.dataset.id = id;

    const doneButton = document.createElement("button");
    doneButton.type = "button";
    doneButton.className = "button primary";
    doneButton.textContent = "Mark done";
    doneButton.dataset.action = "done";
    doneButton.dataset.id = id;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button ghost";
    deleteButton.textContent = "Delete";
    deleteButton.dataset.action = "delete";
    deleteButton.dataset.id = id;

    actions.append(readButton, doneButton, deleteButton);
    article.append(meta, contact, message, actions);
    return article;
}

async function loadMessages() {
    if (!activeUser) return;
    window.showLoader?.();
    setStatus(statusEl, "Loading messages...");

    try {
        const q = query(collection(db, "contactRequests"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        messageList.textContent = "";

        if (snap.empty) {
            const empty = document.createElement("div");
            empty.className = "announcement-empty-state";
            empty.innerHTML = "<h3>No prayer or contact messages yet.</h3><p>New submissions from the home page will appear here.</p>";
            messageList.append(empty);
            setStatus(statusEl, "No messages yet.");
            return;
        }

        snap.docs.forEach((messageDoc) => {
            messageList.append(createMessageCard(messageDoc.id, messageDoc.data()));
        });
        setStatus(statusEl, `${snap.size} message(s) loaded.`);
    } catch (error) {
        console.error(error);
        setStatus(statusEl, error.message || "Messages could not load.", true);
    } finally {
        window.hideLoader?.();
    }
}

async function handleLogin(event) {
    event.preventDefault();
    setStatus(loginStatus, "Signing in...");
    window.showLoader?.();

    try {
        const email = document.getElementById("messagesEmail").value.trim();
        const password = document.getElementById("messagesPassword").value;
        await signInWithEmailAndPassword(auth, email, password);
        document.getElementById("messagesLoginForm").reset();
        setStatus(loginStatus, "");
    } catch (error) {
        setStatus(loginStatus, error.message, true);
        window.hideLoader?.();
    }
}

async function handleMessageAction(event) {
    const button = event.target.closest("[data-action][data-id]");
    if (!button) return;

    const { action, id } = button.dataset;
    const ref = doc(db, "contactRequests", id);
    button.disabled = true;
    window.showLoader?.();

    try {
        if (action === "delete") {
            const ok = window.confirm("Delete this message permanently?");
            if (!ok) return;
            await deleteDoc(ref);
        } else {
            await updateDoc(ref, {
                status: action,
                reviewedAt: serverTimestamp(),
                reviewedBy: auth.currentUser?.email || ""
            });
        }
        await loadMessages();
    } catch (error) {
        console.error(error);
        setStatus(statusEl, error.message || "Message action failed.", true);
    } finally {
        button.disabled = false;
        window.hideLoader?.();
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        showSignedOut();
        return;
    }

    window.showLoader?.();
    setStatus(statusEl, "Checking admin access...");

    try {
        const adminData = await ensureAdmin(user);
        activeUser = user;
        authSection.hidden = true;
        adminSection.hidden = false;
        currentAdmin.textContent = `Signed in as ${adminData.email || user.email}`;
        await loadMessages();
    } catch (error) {
        await signOut(auth);
        showSignedOut();
        setStatus(loginStatus, error.message, true);
    } finally {
        window.hideLoader?.();
    }
});

document.getElementById("messagesLoginForm").addEventListener("submit", handleLogin);
document.getElementById("messagesLogout").addEventListener("click", () => signOut(auth));
document.getElementById("refreshMessages").addEventListener("click", loadMessages);
messageList.addEventListener("click", handleMessageAction);
