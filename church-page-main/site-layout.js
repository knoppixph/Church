(() => {
    const navItems = [
        ["church_HOME.html", "Home"],
        ["announcement.html", "Announcements"],
        ["leaderboard.html", "Leaderboard"]
    ];

    function isActive(href) {
        const path = window.location.pathname.toLowerCase();
        return path.endsWith(href.toLowerCase()) || (href === "church_HOME.html" && path.endsWith("/"));
    }

    function renderHeader() {
        const target = document.querySelector("[data-site-header]");
        if (!target) return;

        const items = document.body.classList.contains("admin-page") || document.body.classList.contains("messages-page")
            ? [...navItems, ["admin.html", "Admin"], ["admin-messages.html", "Inbox"]]
            : navItems;
        const nav = items
            .map(([href, label]) => `<li><a href="${href}"${isActive(href) ? ' aria-current="page"' : ""}>${label}</a></li>`)
            .join("");

        target.outerHTML = `
            <header class="site-header">
                <div class="shell masthead">
                    <img src="CHURCH_LOGO.png" alt="Church Logo" class="logo-badge">
                    <div class="brand-block">
                        <p class="brand-slogan">
                            <span class="brand-slogan-top">Jesus Christ</span>
                            <span class="brand-slogan-bottom">Is Our True Religion International Ministry</span>
                        </p>
                    </div>
                    <img src="g12_logo.jpg" alt="G12 Logo" class="logo-badge">
                </div>
                <nav class="shell main-nav" aria-label="Primary">
                    <ul>${nav}</ul>
                </nav>
            </header>`;
    }

    function renderFooter() {
        const target = document.querySelector("[data-site-footer]");
        if (!target) return;

        const year = new Date().getFullYear();
        target.outerHTML = `
            <footer class="site-footer">
                <div class="shell footer-grid">
                    <div class="footer-brand">
                        <img src="CHURCH_LOGO.png" alt="Church Logo" class="footer-logo">
                        <h4>JCIOTRIM</h4>
                        <p>Jesus Christ Is Our True Religion International Ministry</p>
                    </div>
                    <div>
                        <h4>Connect</h4>
                        <p><a class="footer-action" href="https://www.facebook.com/jciotrim" target="_blank" rel="noopener noreferrer">Facebook: JCIOTRIM</a></p>
                        <p><a class="footer-action" href="mailto:jciotrim@gmail.com">Email: jciotrim@gmail.com</a></p>
                    </div>
                    <div>
                        <h4>Visit</h4>
                        <p><a class="footer-action map-link" href="https://maps.app.goo.gl/aEq7nhKFkA9rVEP46" target="_blank" rel="noopener noreferrer">Google Maps: #009 Doon St. Maysan Valenzuela City</a></p>
                    </div>
                    <div>
                        <h4>Site</h4>
                        <p><a class="footer-action" href="admin.html" aria-label="Admin page for announcements">Admin</a></p>
                        <p class="copyright">&copy; ${year} JCIOTRIM. All rights reserved.</p>
                    </div>
                </div>
            </footer>`;
    }

    renderHeader();
    renderFooter();
})();
