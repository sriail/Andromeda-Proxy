/**
 * CAPTCHA handler for proxy environment
 * Ensures that reCAPTCHA, hCaptcha, and Cloudflare Turnstile work within the proxy
 */

/**
 * Initialize CAPTCHA handlers on page load
 */
export function initializeCaptchaHandlers() {
    if (typeof window === "undefined") return;

    // Ensure global CAPTCHA callbacks are accessible
    if (!window.___grecaptcha_cfg) {
        window.___grecaptcha_cfg = { clients: {} };
    }

    // Monitor for CAPTCHA iframe creation and ensure proper setup
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node instanceof HTMLIFrameElement) {
                    const src = node.src || "";
                    // Check if this is a CAPTCHA iframe
                    if (
                        src.includes("recaptcha") ||
                        src.includes("hcaptcha") ||
                        src.includes("challenges.cloudflare.com") ||
                        src.includes("turnstile")
                    ) {
                        // Ensure the iframe has proper sandbox permissions
                        if (node.sandbox && node.sandbox.length > 0) {
                            node.sandbox.add("allow-same-origin");
                            node.sandbox.add("allow-scripts");
                            node.sandbox.add("allow-forms");
                        }

                        // Ensure credentials are included for CAPTCHA cookies
                        if (node.getAttribute("credentialless") !== null) {
                            node.removeAttribute("credentialless");
                        }
                    }
                }
            });
        });
    });

    // Start observing the document for changes
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    // Request persistent storage for better data retention
    if (navigator.storage && navigator.storage.persist) {
        // Storage persistence is optional, silently fail if not supported
        navigator.storage.persist().catch(() => {});
    }
}

/**
 * Global declaration for reCAPTCHA config
 */
declare global {
    interface Window {
        ___grecaptcha_cfg?: {
            clients: Record<string, any>;
            [key: string]: any;
        };
    }
}
