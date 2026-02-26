// background service worker for kiosk extension
// we'll read the homepage once when the worker starts up and cache it.
// the service worker may be terminated when idle, but it'll rerun initialization
// whenever it wakes so we don't need to fetch on every click.

let cachedHomepage = "about:home";

async function refreshHomepage() {
    if (browser && browser.browserSettings && browser.browserSettings.homepageOverride) {
        try {
            const result = await browser.browserSettings.homepageOverride.get({});
            cachedHomepage = result.value || "about:home";
        } catch {
            cachedHomepage = "about:home";
        }
    }
}

// refresh when the service worker starts
refreshHomepage();

// respond to requests from content scripts
browser.runtime.onMessage.addListener((message, sender) => {
    if (message && message.action === "getHomepage") {
        // just return the cached value; returning a value (or promise) sends it back
        return Promise.resolve(cachedHomepage);
    }
    // allow other messages to be handled elsewhere
});
