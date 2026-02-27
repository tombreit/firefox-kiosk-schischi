/**
 * createKioskPanel – builds and injects the kiosk navigation panel.
 *
 * @param {object}  options
 * @param {string}  [options.initialUrl]           – URL shown in the bar on first render.
 *                                                   Defaults to window.location.href.
 * @param {boolean} [options.listenToNavigation]   – Whether to hook the Navigation API to
 *                                                   update state on SPA / in-page navigations.
 *                                                   Set false for static extension pages (e.g.
 *                                                   the PDF wrapper) where the page never
 *                                                   navigates itself.  Defaults to true.
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

    // Forward button
    const btnForward = document.createElement("button");
    btnForward.title = "Forward";
    btnForward.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M13.22 19.03a.75.75 0 0 1 0-1.06L18.19 13H3.75a.75.75 0 0 1 0-1.5h14.44l-4.97-4.97a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l6.25 6.25a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0Z"></path></svg>`;
    btnForward.addEventListener("click", () => browser.runtime.sendMessage({ action: "goForward" }));
    panel.appendChild(btnForward);

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

    // Update URL bar text and back/forward button enabled state
    async function updateNavState(destUrl) {
        try {
            const state = await browser.runtime.sendMessage({ action: "getNavState" });
            btnBack.disabled = !state?.canGoBack;
            btnForward.disabled = !state?.canGoForward;
        } catch {
            btnBack.disabled = false;
            btnForward.disabled = false;
        }
        if (destUrl) {
            urlBar.textContent = destUrl;
            urlBar.title = destUrl;
        }
    }
    updateNavState();

    if (listenToNavigation) {
        navigation.addEventListener('navigate', (e) => setTimeout(() => updateNavState(e.destination.url), 0));
    }

    // Suppress right-click context menu on the page (belt-and-suspenders with --kiosk)
    document.addEventListener('contextmenu', (e) => e.preventDefault(), true);

    // Force links that would open a new tab/window to navigate in the current tab instead.
    // We rewrite the target attribute rather than calling preventDefault so the browser
    // handles the navigation natively, preserving the user-activation gesture.  Without
    // user activation, Firefox's Bounce Tracking Protection can block the navigation.
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a[target]');
        if (!anchor) return;
        const target = anchor.getAttribute('target');
        // _self / _top / _parent already stay in the current browsing context
        if (!target || target === '_self' || target === '_top' || target === '_parent') return;
        anchor.setAttribute('target', '_self');
        // Let the click continue – browser now opens in the current tab.
    }, true);
}
