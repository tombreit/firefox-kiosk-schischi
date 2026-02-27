// inject the panel once the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => createKioskPanel());
} else {
    createKioskPanel();
}
