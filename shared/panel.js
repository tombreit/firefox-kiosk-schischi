/**
 * createKioskPanel – builds and injects the kiosk navigation panel.
 *
 * @param {object}  options
 * @param {string}  [options.initialUrl]           – URL shown in the bar on first render.
 *                                                   Defaults to window.location.href.
 * @param {boolean} [options.listenToNavigation]   – Whether to hook the Navigation API to
 *                                                   update the URL bar on SPA navigations.
 *                                                   Set false for static extension pages
 *                                                   (e.g. the PDF wrapper).  Defaults to true.
 */
function createKioskPanel({ initialUrl = null, listenToNavigation = true } = {}) {

    if (document.getElementById("kiosk-panel")) return;

    const panel = document.createElement("div");
    panel.id = "kiosk-panel";
    document.documentElement.appendChild(panel);

    // Back button
    const btnBack = document.createElement("button");
    btnBack.title = "Back";
    btnBack.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M10.78 19.03a.75.75 0 0 1-1.06 0l-6.25-6.25a.75.75 0 0 1 0-1.06l6.25-6.25a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L5.81 11.5h14.44a.75.75 0 0 1 0 1.5H5.81l4.97 4.97a.75.75 0 0 1 0 1.06Z"></path></svg>`;
    btnBack.addEventListener("click", () => browser.runtime.sendMessage({ action: "goBack" }));
    panel.appendChild(btnBack);

    // Home button
    const btnHome = document.createElement("button");
    btnHome.title = "Home";
    btnHome.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M11.03 2.59a1.501 1.501 0 0 1 1.94 0l7.5 6.363a1.5 1.5 0 0 1 .53 1.144V19.5a1.5 1.5 0 0 1-1.5 1.5h-5.75a.75.75 0 0 1-.75-.75V14h-2v6.25a.75.75 0 0 1-.75.75H4.5A1.5 1.5 0 0 1 3 19.5v-9.403c0-.44.194-.859.53-1.144ZM12 3.734l-7.5 6.363V19.5h5v-6.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v6.25h5v-9.403Z"></path></svg>`;
    btnHome.addEventListener("click", () => browser.runtime.sendMessage({ action: "goHome" }));
    panel.appendChild(btnHome);

    // Read-only URL bar
    const urlBar = document.createElement("div");
    urlBar.id = "kiosk-url-bar";
    const resolvedInitialUrl = initialUrl || window.location.href;
    urlBar.textContent = resolvedInitialUrl;
    urlBar.title = resolvedInitialUrl;
    panel.appendChild(urlBar);

    // Update URL bar on SPA / in-page navigations via the Navigation API.
    if (listenToNavigation && typeof navigation !== "undefined") {
        navigation.addEventListener("navigate", (e) => {
            setTimeout(() => {
                urlBar.textContent = e.destination.url;
                urlBar.title = e.destination.url;
            }, 0);
        });
    }

    // Suppress right-click context menu (belt-and-suspenders with --kiosk)
    document.addEventListener("contextmenu", (e) => e.preventDefault(), true);

    // Block keyboard shortcuts that could escape the kiosk.
    // --kiosk already blocks most of these, but defense-in-depth.
    const BLOCKED_SHORTCUTS = new Set([
        "ctrl+t",       // new tab
        "ctrl+n",       // new window
        "ctrl+shift+n", // private window
        "ctrl+w",       // close tab
        "ctrl+shift+w", // close window
        "ctrl+l",       // focus address bar
        "ctrl+k",       // focus search bar
        "ctrl+shift+i", // developer tools
        "ctrl+shift+j", // browser console
        "ctrl+shift+c", // inspector
        "ctrl+u",       // view source
        "f12",          // developer tools
        "f11",          // toggle fullscreen (could exit kiosk)
        "f6",           // focus address bar
        "alt+home",     // Firefox home (bypass our home)
        "alt+d",        // focus address bar
        "alt+f4",       // close window
    ]);

    document.addEventListener("keydown", (e) => {
        const parts = [];
        if (e.ctrlKey || e.metaKey) parts.push("ctrl");
        if (e.altKey) parts.push("alt");
        if (e.shiftKey) parts.push("shift");
        parts.push(e.key.toLowerCase());
        const combo = parts.join("+");

        if (BLOCKED_SHORTCUTS.has(combo)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // Force links that would open a new tab/window to navigate in the
    // current tab instead.  We rewrite the target attribute rather than
    // calling preventDefault so the browser handles the navigation natively,
    // preserving the user-activation gesture (needed for Bounce Tracking
    // Protection).
    document.addEventListener("click", (e) => {
        const anchor = e.target.closest("a[target]");
        if (!anchor) return;
        const target = anchor.getAttribute("target");
        if (!target || target === "_self" || target === "_top" || target === "_parent") return;
        anchor.setAttribute("target", "_self");
    }, true);
}
