(() => {
    const loader = document.querySelector(".site-loader");
    const minimumMs = 450;
    let visibleSince = performance.now();
    let hideTimer = 0;

    function setBusy(isBusy) {
        document.documentElement.setAttribute("aria-busy", String(isBusy));
    }

    function showLoader() {
        if (!loader) return;
        window.clearTimeout(hideTimer);
        visibleSince = performance.now();
        document.body.classList.remove("is-loaded");
        loader.hidden = false;
        setBusy(true);
    }

    function hideLoader() {
        if (!loader) return;
        const elapsed = performance.now() - visibleSince;
        const delay = Math.max(0, minimumMs - elapsed);

        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => {
            document.body.classList.add("is-loaded");
            setBusy(false);
            window.setTimeout(() => {
                if (document.body.classList.contains("is-loaded")) {
                    loader.hidden = true;
                }
            }, 380);
        }, delay);
    }

    function isInternalPageLink(anchor) {
        if (!anchor || anchor.target || anchor.hasAttribute("download")) return false;
        if (anchor.hasAttribute("data-no-loader")) return false;

        const href = anchor.getAttribute("href") || "";
        if (!href || href === "#" || href.startsWith("#")) return false;
        if (/^(mailto:|tel:|javascript:)/i.test(href)) return false;

        const url = new URL(anchor.href, window.location.href);
        if (url.origin !== window.location.origin) return false;

        const path = url.pathname.toLowerCase();
        return path.endsWith(".html") || path.endsWith("/");
    }

    function pageTransitionLoader(event) {
        const anchor = event.target.closest("a");
        if (!isInternalPageLink(anchor)) return;

        const url = new URL(anchor.href, window.location.href);
        const current = new URL(window.location.href);
        if (url.pathname === current.pathname && url.hash && url.hash !== current.hash) return;

        event.preventDefault();
        showLoader();
        window.setTimeout(() => {
            window.location.href = anchor.href;
        }, 180);
    }

    window.showLoader = showLoader;
    window.hideLoader = hideLoader;
    window.pageTransitionLoader = pageTransitionLoader;

    document.addEventListener("click", pageTransitionLoader);

    showLoader();
    if (document.readyState === "complete") {
        hideLoader();
    } else {
        window.addEventListener("load", hideLoader, { once: true });
        window.setTimeout(hideLoader, 3500);
    }
})();
