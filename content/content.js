function createPanel() {

    if (document.getElementById("kiosk-panel")) return;

    const panel = document.createElement("div");
    panel.id = "kiosk-panel";
    document.documentElement.appendChild(panel);

    // Back button
    const button_back = document.createElement("button");
    button_back.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M10.78 19.03a.75.75 0 0 1-1.06 0l-6.25-6.25a.75.75 0 0 1 0-1.06l6.25-6.25a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L5.81 11.5h14.44a.75.75 0 0 1 0 1.5H5.81l4.97 4.97a.75.75 0 0 1 0 1.06Z"></path></svg>`;
    button_back.onclick = () => browser.runtime.sendMessage({ action: "goBack" });
    panel.appendChild(button_back);

    // Forward button
    const button_next = document.createElement("button");
    button_next.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M13.22 19.03a.75.75 0 0 1 0-1.06L18.19 13H3.75a.75.75 0 0 1 0-1.5h14.44l-4.97-4.97a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l6.25 6.25a.75.75 0 0 1 0 1.06l-6.25 6.25a.75.75 0 0 1-1.06 0Z"></path></svg>`;
    button_next.onclick = () => browser.runtime.sendMessage({ action: "goForward" });
    panel.appendChild(button_next);

    // Home button
    const button_home = document.createElement("button");
    button_home.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path d="M11.03 2.59a1.501 1.501 0 0 1 1.94 0l7.5 6.363a1.5 1.5 0 0 1 .53 1.144V19.5a1.5 1.5 0 0 1-1.5 1.5h-5.75a.75.75 0 0 1-.75-.75V14h-2v6.25a.75.75 0 0 1-.75.75H4.5A1.5 1.5 0 0 1 3 19.5v-9.403c0-.44.194-.859.53-1.144ZM12 3.734l-7.5 6.363V19.5h5v-6.25a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v6.25h5v-9.403Z"></path></svg>`;
    button_home.onclick = () => {
        browser.runtime.sendMessage({ action: "goHome" });
    };
    panel.appendChild(button_home);

    // Read-only URL bar
    const urlBar = document.createElement("div");
    urlBar.id = "kiosk-url-bar";
    urlBar.textContent = window.location.href;
    panel.appendChild(urlBar);

    // update URL bar and button state on navigation
    async function updateNavState(destUrl) {
        try {
            const state = await browser.runtime.sendMessage({ action: "getNavState" });
            button_back.disabled = !state?.canGoBack;
            button_next.disabled = !state?.canGoForward;
        } catch {
            button_back.disabled = false;
            button_next.disabled = false;
        }
        urlBar.textContent = destUrl || window.location.href;
    }
    updateNavState();
    navigation.addEventListener('navigate', (e) => setTimeout(() => updateNavState(e.destination.url), 0));

    // suppress right-click context menu on the page (belt-and-suspenders with --kiosk)
    document.addEventListener('contextmenu', e => e.preventDefault(), true);
}

// inject the panel once the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
} else {
    createPanel();
}
