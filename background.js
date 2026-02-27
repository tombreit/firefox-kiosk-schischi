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

const tabNavState = new Map();
const tabHomeUrl = new Map(); // tabId -> startup URL (kiosk launch URL)
const TAB_HOME_KEY_PREFIX = "tabHomeUrl:";

function tabHomeStorageKey(tabId) {
    return `${TAB_HOME_KEY_PREFIX}${tabId}`;
}

async function persistTabHomeUrl(tabId, url) {
    try {
        await browser.storage.session.set({ [tabHomeStorageKey(tabId)]: url });
    } catch {
        // best-effort only
    }
}

async function removePersistedTabHomeUrl(tabId) {
    try {
        await browser.storage.session.remove(tabHomeStorageKey(tabId));
    } catch {
        // best-effort only
    }
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
    } catch {
        // best-effort only
    }
}

seedTabHomeUrlsFromOpenTabs();

function ensureTabState(tabId) {
    if (!tabNavState.has(tabId)) {
        tabNavState.set(tabId, { entries: [], index: -1 });
    }
    return tabNavState.get(tabId);
}

function findClosestIndex(entries, currentIndex, url) {
    let closestIndex = -1;
    let closestDistance = Infinity;

    for (let i = 0; i < entries.length; i += 1) {
        if (entries[i] !== url) continue;
        const distance = Math.abs(i - currentIndex);
        if (distance < closestDistance) {
            closestDistance = distance;
            closestIndex = i;
        }
    }

    return closestIndex;
}

function applyNavigationEvent(details) {
    if (details.frameId !== 0) return;

    rememberTabHomeUrl(details.tabId, details.url);

    const state = ensureTabState(details.tabId);
    const qualifiers = details.transitionQualifiers || [];
    const isBackForward = qualifiers.includes("forward_back");

    if (state.index === -1) {
        state.entries = [details.url];
        state.index = 0;
        return;
    }

    if (isBackForward) {
        const previousUrl = state.entries[state.index - 1];
        const nextUrl = state.entries[state.index + 1];

        if (previousUrl === details.url) {
            state.index -= 1;
            return;
        }

        if (nextUrl === details.url) {
            state.index += 1;
            return;
        }

        const targetIndex = findClosestIndex(state.entries, state.index, details.url);
        if (targetIndex !== -1) {
            state.index = targetIndex;
            return;
        }
    }

    if (state.entries[state.index] === details.url) {
        return;
    }

    state.entries = state.entries.slice(0, state.index + 1);
    state.entries.push(details.url);
    state.index = state.entries.length - 1;
}

function getTabNavState(tabId) {
    const state = ensureTabState(tabId);
    return {
        canGoBack: state.index > 0,
        canGoForward: state.index >= 0 && state.index < state.entries.length - 1,
    };
}

function getWrappedPdfUrl(url) {
    if (!url || !url.startsWith(WRAPPER_PAGE)) return null;
    try {
        return new URL(url).searchParams.get("url");
    } catch {
        return null;
    }
}

function findSmartBackTarget(state) {
    if (!state || state.index <= 0) return null;
    const currentUrl = state.entries[state.index];
    const wrappedPdfUrl = getWrappedPdfUrl(currentUrl);

    let targetIndex = state.index - 1;
    while (targetIndex >= 0) {
        const candidate = state.entries[targetIndex];
        const isWrapper = candidate.startsWith(WRAPPER_PAGE);
        const isWrappedPdf = wrappedPdfUrl && candidate === wrappedPdfUrl;
        if (!isWrapper && !isWrappedPdf) {
            return candidate;
        }
        targetIndex -= 1;
    }

    return null;
}

for (const event of [
    browser.webNavigation.onCommitted,
    browser.webNavigation.onHistoryStateUpdated,
    browser.webNavigation.onReferenceFragmentUpdated,
]) {
    event.addListener(applyNavigationEvent);
}

browser.tabs.onRemoved.addListener((tabId) => {
    tabNavState.delete(tabId);
    tabHomeUrl.delete(tabId);
    removePersistedTabHomeUrl(tabId);
    pendingNewTabs.delete(tabId);
    for (const [token, entry] of capturedPdfByToken.entries()) {
        if (entry.tabId === tabId) {
            capturedPdfByToken.delete(token);
        }
    }
});

// ---------------------------------------------------------------------------
// Force new tabs/windows back into the opener tab (safety net for cases that
// bypass the content-script click interception, e.g. middle-click).
// ---------------------------------------------------------------------------
const pendingNewTabs = new Map(); // newTabId -> openerTabId

browser.tabs.onCreated.addListener((tab) => {
    if (!tab.openerTabId) return;
    // If the URL is already known and real, redirect immediately.
    if (tab.url && tab.url !== 'about:blank' && !tab.url.startsWith('about:')) {
        browser.tabs.update(tab.openerTabId, { url: tab.url });
        browser.tabs.remove(tab.id);
    } else {
        // URL not yet known – wait for it via onUpdated.
        pendingNewTabs.set(tab.id, tab.openerTabId);
    }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (!pendingNewTabs.has(tabId)) return;
    const url = changeInfo.url;
    if (!url || url === 'about:blank' || url.startsWith('about:')) return;
    const openerTabId = pendingNewTabs.get(tabId);
    pendingNewTabs.delete(tabId);
    browser.tabs.update(openerTabId, { url });
    browser.tabs.remove(tabId);
});

browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === "goHome") {
        const tabId = sender.tab?.id;

        let url = typeof tabId === "number" ? tabHomeUrl.get(tabId) : null;

        if (!url && typeof tabId === "number") {
            url = await getPersistedTabHomeUrl(tabId);
            if (url) {
                tabHomeUrl.set(tabId, url);
            }
        }

        // If this tab currently shows the PDF wrapper and we lost in-memory state
        // (service worker restart), recover from wrapper's `url` query parameter.
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
            } catch {
                // ignore and continue to fallback
            }
        }

        if (!url) {
            const { homepage } = await browser.storage.session.get("homepage");
            url = homepage || "about:home";
        }

        await browser.tabs.update(sender.tab.id, { url });
        return;
    }

    if (message.action === "goBack") {
        const state = ensureTabState(sender.tab.id);
        const smartTarget = findSmartBackTarget(state);
        if (smartTarget) {
            await browser.tabs.update(sender.tab.id, { url: smartTarget });
        } else {
            await browser.tabs.goBack(sender.tab.id);
        }
        return;
    }

    if (message.action === "goForward") {
        await browser.tabs.goForward(sender.tab.id);
        return;
    }

    if (message.action === "getNavState") {
        return getTabNavState(sender.tab.id);
    }

    if (message.action === "getCapturedPdf") {
        pruneCapturedPdfs();
        const token = message.token;
        if (!token || !capturedPdfByToken.has(token)) {
            return { ok: false, error: "missing_or_expired_token" };
        }
        const entry = capturedPdfByToken.get(token);
        capturedPdfByToken.delete(token);
        return {
            ok: true,
            buffer: entry.buffer,
            mime: entry.mime,
            url: entry.url,
        };
    }
});

// ---------------------------------------------------------------------------
// PDF interception: capture the original top-level PDF response and then move
// to the wrapper page with a token. This preserves browser navigation semantics
// (cookies/referer/fetch-metadata/user activation) for stateful PDF endpoints.
// ---------------------------------------------------------------------------
const WRAPPER_PAGE = browser.runtime.getURL("wrapper/wrapper.html");
const CAPTURED_PDF_TTL_MS = 2 * 60 * 1000;
const capturedPdfByToken = new Map(); // token -> { buffer, mime, url, tabId, createdAt }

function pruneCapturedPdfs() {
    const now = Date.now();
    for (const [token, entry] of capturedPdfByToken.entries()) {
        if ((now - entry.createdAt) > CAPTURED_PDF_TTL_MS) {
            capturedPdfByToken.delete(token);
        }
    }
}

function generateToken() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

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

function extractContentType(responseHeaders) {
    for (const header of responseHeaders || []) {
        if (header.name.toLowerCase() === "content-type") {
            return (header.value || "").split(";")[0].trim().toLowerCase();
        }
    }
    return "";
}

browser.webRequest.onHeadersReceived.addListener(
    (details) => {
        if (details.tabId < 0) return {};

        const looksLikePdf = isPdfUrl(details.url);
        const servesAsPdf = hasPdfContentType(details.responseHeaders);

        if (!looksLikePdf && !servesAsPdf) {
            return {};
        }

        const mime = extractContentType(details.responseHeaders) || (looksLikePdf ? "application/pdf" : "");

        let filter;
        try {
            filter = browser.webRequest.filterResponseData(details.requestId);
        } catch {
            const fallbackWrapperUrl = WRAPPER_PAGE
                + "?url=" + encodeURIComponent(details.url);
            return { redirectUrl: fallbackWrapperUrl };
        }

        const chunks = [];
        let totalLength = 0;

        filter.ondata = (event) => {
            chunks.push(event.data);
            totalLength += event.data.byteLength;
            filter.write(event.data);
        };

        filter.onstop = async () => {
            filter.disconnect();

            const merged = new Uint8Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                merged.set(new Uint8Array(chunk), offset);
                offset += chunk.byteLength;
            }

            const token = generateToken();
            capturedPdfByToken.set(token, {
                buffer: merged.buffer,
                mime,
                url: details.url,
                tabId: details.tabId,
                createdAt: Date.now(),
            });
            pruneCapturedPdfs();

            const wrapperUrl = WRAPPER_PAGE
                + "?token=" + encodeURIComponent(token)
                + "&url=" + encodeURIComponent(details.url);

            try {
                await browser.tabs.update(details.tabId, { url: wrapperUrl });
            } catch {
                capturedPdfByToken.delete(token);
            }
        };

        filter.onerror = () => {
            try {
                filter.disconnect();
            } catch {
                // no-op
            }
        };

        return {};
    },
    { urls: ["<all_urls>"], types: ["main_frame"] },
    ["blocking", "responseHeaders"]
);
