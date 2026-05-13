import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getFirestore,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, FIRESTORE_PATHS } from "./firebase-config.js";
import { formatUpdatedAt, resolvePublishedUrl } from "./firebase-utils.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const latestText = document.getElementById("latestAnnouncementText");
const contactForm = document.getElementById("prayerRequestForm");
const contactStatus = document.getElementById("contactStatus");

function setContactStatus(message, isError = false) {
    if (!contactStatus) return;
    contactStatus.textContent = message;
    contactStatus.style.color = isError ? "#f29b9b" : "";
}

async function loadLatestAnnouncement() {
    if (!latestText) return;

    try {
        const ref = doc(db, FIRESTORE_PATHS.site, FIRESTORE_PATHS.announcements);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        const hasPdf = !!resolvePublishedUrl(data.pdfUrl);
        const hasPptx = !!resolvePublishedUrl(data.pptxUrl);
        const updated = formatUpdatedAt(data.updatedAt);

        if (hasPdf || hasPptx) {
            latestText.textContent = updated
                ? `The latest announcement is published. Updated: ${updated}.`
                : "The latest announcement is published and ready to view.";
            return;
        }

        latestText.textContent = "No announcement is currently published. Please check back soon.";
    } catch (error) {
        console.warn("Latest announcement preview failed:", error);
        latestText.textContent = "Announcements are temporarily unavailable. Please check again soon.";
    }
}

async function handleContactSubmit(event) {
    event.preventDefault();

    const name = document.getElementById("contactName")?.value.trim() || "";
    const contact = document.getElementById("contactInfo")?.value.trim() || "";
    const message = document.getElementById("contactMessage")?.value.trim() || "";
    const consent = document.getElementById("contactConsent")?.checked === true;

    if (!name || !contact || !message || !consent) {
        setContactStatus("Complete the form and consent checkbox before sending.", true);
        return;
    }

    window.showLoader?.();
    setContactStatus("Sending message...");

    try {
        await addDoc(collection(db, "contactRequests"), {
            name,
            contact,
            message,
            consent,
            status: "new",
            page: "home",
            createdAt: serverTimestamp()
        });
        contactForm.reset();
        setContactStatus("Message sent. Thank you for reaching out.");
    } catch (error) {
        console.error(error);
        setContactStatus("Message could not be sent. Please email jciotrim@gmail.com.", true);
    } finally {
        window.hideLoader?.();
    }
}

loadLatestAnnouncement();
contactForm?.addEventListener("submit", handleContactSubmit);
