// background service worker for kiosk extension
// reads the configured homepage once on startup and stores it in session storage
// so content scripts can retrieve it without message passing.

async function refreshHomepage() {
    let homepage = "about:home";
    try {
        const result = await browser.browserSettings.homepageOverride.get({});
        homepage = result.value || "about:home";
    } catch {
        // homepageOverride unavailable, keeping default
    }
    await browser.storage.session.set({ homepage });
}

refreshHomepage();
