const params = new URLSearchParams(window.location.search);
const pdfUrl = params.get("url") || "";

// Build the shared kiosk panel, pre-seeded with the original PDF URL and
// without Navigation API listeners (this page never navigates itself).
createKioskPanel({ initialUrl: pdfUrl, listenToNavigation: false });

// Display the PDF inside the iframe.  The iframe request is a sub_frame type,
// so it bypasses our main_frame-only PDF interception and loads normally via
// Firefox's built-in PDF viewer.
const frame = document.getElementById("pdf-frame");
if (pdfUrl) {
    frame.src = pdfUrl;
}
