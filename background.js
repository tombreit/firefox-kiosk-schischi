// ---------------------------------------------------------------------------
// Firefox Kiosk Schischi – background script
//
// Responsibilities:
//   1. Resolve and cache the homepage URL
//   2. Remember per-tab "home" URL (first real URL the tab visited)
//   3. Handle goBack / goHome messages from the panel
//   4. Intercept PDF responses → redirect to wrapper page with toolbar
//   5. Suppress new tabs (force navigation into opener tab)
//   6. Navigate home after idle timeout
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 1. Homepage resolution
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 2. Per-tab home URL tracking
// ---------------------------------------------------------------------------

const tabHomeUrl = new Map(); // tabId -> first real URL the tab visited
const TAB_HOME_KEY_PREFIX = "tabHomeUrl:";

function tabHomeStorageKey(tabId) {
    return `${TAB_HOME_KEY_PREFIX}${tabId}`;
}

async function persistTabHomeUrl(tabId, url) {
    try {
        await browser.storage.session.set({ [tabHomeStorageKey(tabId)]: url });
    } catch { /* best-effort */ }
}

async function removePersistedTabHomeUrl(tabId) {
    try {
        await browser.storage.session.remove(tabHomeStorageKey(tabId));
    } catch { /* best-effort */ }
}

async function getPersistedTabHomeUrl(tabId) {
    try {
        const key = tabHomeStorageKey(tabId);
        const result = await browser.storage.session.get(key);
        const url = result[key];
        return isUsableHomeUrl(url) ? url : null;
    } catch {
        return null;
    }
}

function isUsableHomeUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return !(
        lower === "about:blank"
        || lower.startsWith("about:")
        || lower.startsWith("moz-extension:")
        || lower.startsWith("blob:")
        || lower.startsWith("data:")
        || lower.startsWith("javascript:")
    );
}

function rememberTabHomeUrl(tabId, url) {
    if (tabId < 0) return;
    if (tabHomeUrl.has(tabId)) return;
    if (!isUsableHomeUrl(url)) return;
    tabHomeUrl.set(tabId, url);
    persistTabHomeUrl(tabId, url);
}

async function seedTabHomeUrlsFromOpenTabs() {
    try {
        const tabs = await browser.tabs.query({});
        for (const tab of tabs) {
            if (typeof tab.id !== "number") continue;
            rememberTabHomeUrl(tab.id, tab.url);
        }
    } catch { /* best-effort */ }
}

seedTabHomeUrlsFromOpenTabs();

// Also remember the home URL whenever a tab completes a top-level navigation.
// Also relay load state to the content script for the loading indicator.
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
        rememberTabHomeUrl(tabId, changeInfo.url);
    }
    if (changeInfo.status !== undefined) {
        browser.tabs.sendMessage(tabId, {
            action: "setLoading",
            loading: changeInfo.status === "loading",
        }).catch(() => {}); // tab may not have a content script (e.g. about:blank)
    }
});

// ---------------------------------------------------------------------------
// 3. PDF interception
//
// Firefox's built-in PDF viewer (resource://pdf.js/) blocks content script
// injection, so the kiosk toolbar wouldn't appear on PDF pages.  We redirect
// PDF responses to a wrapper extension page that displays the PDF in an
// iframe with the toolbar above it.
//
// Using { redirectUrl } in onHeadersReceived (instead of filterResponseData +
// tabs.update) makes this a transparent redirect: the wrapper page occupies
// the same session-history slot as the PDF URL.  This means tabs.goBack()
// from the wrapper goes straight to the page that linked to the PDF AND
// preserves that page's scroll position.
//
// The wrapper's iframe re-fetches the PDF via a sub_frame request, which is
// not intercepted (our filter only matches main_frame).
// ---------------------------------------------------------------------------

const WRAPPER_PAGE = browser.runtime.getURL("wrapper/wrapper.html");

function isPdfUrl(url) {
    try {
        const path = new URL(url).pathname.toLowerCase();
        return path.endsWith(".pdf");
    } catch {
        return false;
    }
}

function hasPdfContentType(responseHeaders) {
    for (const header of responseHeaders || []) {
        if (header.name.toLowerCase() === "content-type") {
            const value = header.value.toLowerCase();
            if (value.includes("application/pdf") || value.includes("application/x-pdf")) {
                return true;
            }
        }
    }
    return false;
}

browser.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (details.tabId < 0) return {};
        if (!isPdfUrl(details.url) && !hasPdfContentType(details.responseHeaders)) return {};

        const wrapperUrl = WRAPPER_PAGE
            + "?url=" + encodeURIComponent(details.url);
        return { redirectUrl: wrapperUrl };
    },
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["blocking", "responseHeaders"]
);

// ---------------------------------------------------------------------------
// 4. Suppress new tabs / windows
// ---------------------------------------------------------------------------

const pendingNewTabs = new Map(); // newTabId -> openerTabId

browser.tabs.onCreated.addListener((tab) => {
    if (!tab.openerTabId) return;
    if (tab.url && tab.url !== "about:blank" && !tab.url.startsWith("about:")) {
        browser.tabs.update(tab.openerTabId, { url: tab.url });
        browser.tabs.remove(tab.id);
    } else {
        pendingNewTabs.set(tab.id, tab.openerTabId);
    }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!pendingNewTabs.has(tabId)) return;
    const url = changeInfo.url;
    if (!url || url === "about:blank" || url.startsWith("about:")) return;
    const openerTabId = pendingNewTabs.get(tabId);
    pendingNewTabs.delete(tabId);
    browser.tabs.update(openerTabId, { url });
    browser.tabs.remove(tabId);
});

// ---------------------------------------------------------------------------
// 5. Tab cleanup
// ---------------------------------------------------------------------------

browser.tabs.onRemoved.addListener((tabId) => {
    tabHomeUrl.delete(tabId);
    removePersistedTabHomeUrl(tabId);
    pendingNewTabs.delete(tabId);
});

// ---------------------------------------------------------------------------
// 6. Message handler
// ---------------------------------------------------------------------------

async function resolveHomeUrl(tabId) {
    // 1. In-memory per-tab home URL
    let url = typeof tabId === "number" ? tabHomeUrl.get(tabId) : null;

    // 2. Persisted per-tab home URL (survives background restart)
    if (!url && typeof tabId === "number") {
        url = await getPersistedTabHomeUrl(tabId);
        if (url) tabHomeUrl.set(tabId, url);
    }

    // 3. If currently on the PDF wrapper, recover from query parameter
    if (!url && typeof tabId === "number") {
        try {
            const tab = await browser.tabs.get(tabId);
            if (tab.url && tab.url.startsWith(WRAPPER_PAGE)) {
                const wrappedUrl = new URL(tab.url).searchParams.get("url");
                if (isUsableHomeUrl(wrappedUrl)) {
                    url = wrappedUrl;
                    tabHomeUrl.set(tabId, wrappedUrl);
                    persistTabHomeUrl(tabId, wrappedUrl);
                }
            }
        } catch { /* ignore */ }
    }

    // 4. Global homepage fallback
    if (!url) {
        const { homepage } = await browser.storage.session.get("homepage");
        url = homepage || "about:home";
    }

    return url;
}

browser.runtime.onMessage.addListener(async (message, sender) => {
    const tabId = sender.tab?.id;

    if (message.action === "goHome") {
        const url = await resolveHomeUrl(tabId);
        await browser.tabs.update(tabId, { url });
        return;
    }

    if (message.action === "goBack") {
        // tabs.goBack() performs a real history traversal, which preserves
        // scroll position on the previous page.  Because the PDF wrapper is
        // loaded via a transparent redirect (redirectUrl in onHeadersReceived)
        // rather than tabs.update(), the wrapper occupies the same history
        // slot as the PDF URL.  So goBack() goes straight past the PDF to the
        // page that linked to it.
        await browser.tabs.goBack(tabId);
        return;
    }
});

// ---------------------------------------------------------------------------
// 7. Idle timeout – navigate home after inactivity
// ---------------------------------------------------------------------------

const IDLE_TIMEOUT_SECONDS = 5 * 60; // 5 minutes

browser.idle.setDetectionInterval(IDLE_TIMEOUT_SECONDS);

browser.idle.onStateChanged.addListener(async (newState) => {
    if (newState !== "idle") return;
    try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        for (const tab of tabs) {
            if (typeof tab.id !== "number") continue;
            const url = await resolveHomeUrl(tab.id);
            await browser.tabs.update(tab.id, { url });
        }
    } catch { /* best-effort */ }
});
