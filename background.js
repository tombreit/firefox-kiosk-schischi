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

for (const event of [
    browser.webNavigation.onCommitted,
    browser.webNavigation.onHistoryStateUpdated,
    browser.webNavigation.onReferenceFragmentUpdated,
]) {
    event.addListener(applyNavigationEvent);
}

browser.tabs.onRemoved.addListener((tabId) => {
    tabNavState.delete(tabId);
});

browser.runtime.onMessage.addListener(async (message, sender) => {
    if (message.action === "goHome") {
        const { homepage } = await browser.storage.session.get("homepage");
        const url = homepage || "about:home";
        await browser.tabs.update(sender.tab.id, { url });
        return;
    }

    if (message.action === "goBack") {
        await browser.tabs.goBack(sender.tab.id);
        return;
    }

    if (message.action === "goForward") {
        await browser.tabs.goForward(sender.tab.id);
        return;
    }

    if (message.action === "getNavState") {
        return getTabNavState(sender.tab.id);
    }
});
