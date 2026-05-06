import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, FIRESTORE_PATHS } from "./firebase-config.js";
import {
    FALLBACK_PDF_URL,
    FALLBACK_PPTX_URL,
    formatUpdatedAt,
    makeDownloadUrl,
    makePreviewUrl,
    resolvePublishedUrl
} from "./firebase-utils.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const pdfFrame = document.getElementById("announcementPdfFrame");
const pdfLink = document.getElementById("announcementPdfLink");
const pptxLink = document.getElementById("announcementPptxLink");
const statusEl = document.getElementById("announcementStatus");
const updatedEl = document.getElementById("announcementUpdatedAt");

function setStatus(message, isError = false) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = isError ? "#f29b9b" : "";
}

function updateButton(anchor, url, enabledText, disabledText) {
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

async function loadAnnouncements() {
    setStatus("Loading announcements...");

    try {
        const ref = doc(db, FIRESTORE_PATHS.site, FIRESTORE_PATHS.announcements);
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};

        const pdfUrl = resolvePublishedUrl(data.pdfUrl, FALLBACK_PDF_URL);
        const pptxUrl = resolvePublishedUrl(data.pptxUrl, FALLBACK_PPTX_URL);

        if (pdfFrame) {
            if (pdfUrl) {
                pdfFrame.hidden = false;
                pdfFrame.src = `${makePreviewUrl(pdfUrl)}#page=1&zoom=page-fit&toolbar=0&navpanes=0&scrollbar=1`;
            } else {
                pdfFrame.hidden = true;
                pdfFrame.removeAttribute("src");
            }
        }

        updateButton(pdfLink, pdfUrl, "Open PDF", "PDF not published");
        updateButton(pptxLink, pptxUrl, "Open PPTX", "PPTX not published");

        const updated = formatUpdatedAt(data.updatedAt);
        if (updatedEl) updatedEl.textContent = updated ? `Updated: ${updated}` : "";
        setStatus(pdfUrl || pptxUrl ? "Announcements ready." : "No announcement links have been published yet.");
    } catch (err) {
        console.error(err);
        setStatus("Announcements could not load from Firebase.", true);
    }
}

loadAnnouncements();
