export const FALLBACK_PDF_URL = "announcements.pdf?v=20260407";
export const FALLBACK_PPTX_URL = "announcements.pptx?v=20260407";

export function cleanUrl(value) {
    return String(value || "").trim();
}

export function isLocalHost() {
    return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

export function emailKey(email) {
    return String(email || "").trim().toLowerCase();
}

export function getDriveFileId(url) {
    const value = cleanUrl(url);
    if (!value) return "";

    const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
    if (fileMatch) return fileMatch[1];

    const idMatch = value.match(/[?&]id=([^&#]+)/i);
    if (idMatch) return idMatch[1];

    return "";
}

export function makePreviewUrl(url) {
    const value = cleanUrl(url);
    if (!value) return "";

    const id = getDriveFileId(value);
    if (id) return `https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`;

    return value;
}

export function makeDownloadUrl(url) {
    const value = cleanUrl(url);
    if (!value) return "";

    const id = getDriveFileId(value);
    if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;

    return value;
}

export function resolvePublishedUrl(url, fallbackUrl = "") {
    const value = cleanUrl(url);
    if (value) return value;
    return isLocalHost() ? fallbackUrl : "";
}

export function formatUpdatedAt(value) {
    if (!value) return "";

    if (typeof value.toDate === "function") {
        return value.toDate().toLocaleString();
    }

    if (typeof value === "string") return value;

    return "";
}

export function isHttpUrl(url) {
    const value = cleanUrl(url);
    if (!value) return true;

    try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}
