const params = new URLSearchParams(window.location.search);
const pdfUrl = params.get("url") || "";
const pdfToken = params.get("token") || "";

// Build the shared kiosk panel, pre-seeded with the PDF URL and without
// Navigation API listeners (this page never navigates itself).
createKioskPanel({ initialUrl: pdfUrl, listenToNavigation: false });

// Load the PDF below the panel.
const frame = document.getElementById("pdf-frame");

function showTokenError() {
    const fallbackHref = pdfUrl || "about:blank";
    frame.srcdoc = `<body style="font-family:sans-serif;padding:16px">`
        + `<h3>Unable to load PDF in wrapper</h3>`
        + `<p>The PDF capture token is missing or expired.</p>`
        + `<p><a href="${fallbackHref}">Open original URL directly</a></p>`
        + `</body>`;
}

if (!pdfToken) {
    if (pdfUrl) {
        frame.src = pdfUrl;
    } else {
        showTokenError();
    }
} else {
    browser.runtime.sendMessage({ action: "getCapturedPdf", token: pdfToken })
        .then((result) => {
            if (!result?.ok || !result.buffer) {
                showTokenError();
                return;
            }
            const mime = result.mime || "application/pdf";
            const blob = new Blob([result.buffer], { type: mime });
            frame.src = URL.createObjectURL(blob);
        })
        .catch(() => {
            showTokenError();
        });
}
