importScripts("/vu/uv.bundle.js", "/vu/uv.config.js", "/marcs/scramjet.all.js");
importScripts(__uv$config.sw || "/vu/uv.sw.js");

const uv = new UVServiceWorker();

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const sj = new ScramjetServiceWorker({
    // Enhanced configuration for better cookie and service worker support
    defaultFlags: {
        serviceworkers: true, // Enable service worker support
        captureErrors: true, // Better error handling
        syncxhr: true, // Support synchronous XHR for complex sites
        scramitize: true, // Better domain handling
        cleanErrors: true, // Clean errors to prevent InvalidHeaderValue issues
        strictRewrites: false, // Allow flexible rewrites
        allowFailedIntercepts: true // Continue on failed intercepts
    }
});

/**
 * Sanitize header value to prevent InvalidHeaderValue errors
 * Removes or replaces characters that are not allowed in HTTP headers
 * @param {string} value - The header value to sanitize
 * @returns {string} - Sanitized header value
 */
function sanitizeHeaderValue(value) {
    if (typeof value !== "string") return String(value || "");
    // Remove control characters (except horizontal tab), newlines, and other problematic chars
    // HTTP headers allow only visible ASCII characters and horizontal tab
    return value
        .replace(/[\x00-\x08\x0A-\x1F\x7F]/g, "") // Remove control chars except \t (0x09)
        .replace(/\r?\n/g, " ") // Replace newlines with space
        .trim();
}

/**
 * Create a sanitized Headers object from existing headers
 * @param {Headers} headers - Original headers
 * @returns {Headers} - Sanitized headers
 */
function sanitizeHeaders(headers) {
    const sanitized = new Headers();
    for (const [key, value] of headers.entries()) {
        try {
            const sanitizedValue = sanitizeHeaderValue(value);
            if (sanitizedValue) {
                sanitized.set(key, sanitizedValue);
            }
        } catch (e) {
            // Skip headers that still cause issues after sanitization
            console.warn(`Skipping problematic header: ${key}`, e);
        }
    }
    return sanitized;
}

// Enhanced CAPTCHA and Cloudflare verification support
// List of CAPTCHA and verification domains that need special handling
const CAPTCHA_DOMAINS = [
    "google.com/recaptcha",
    "www.google.com/recaptcha",
    "recaptcha.net",
    "www.recaptcha.net",
    "gstatic.com/recaptcha",
    "hcaptcha.com",
    "newassets.hcaptcha.com",
    "challenges.cloudflare.com",
    "cloudflare.com/cdn-cgi/challenge",
    "turnstile.cloudflare.com"
];

// Domains that use heavy cookies and complex browser services
const HEAVY_COOKIE_DOMAINS = [
    "amazon.com",
    "ebay.com",
    "walmart.com",
    "google.com",
    "youtube.com",
    "facebook.com",
    "instagram.com",
    "twitter.com",
    "linkedin.com",
    "microsoft.com",
    "apple.com",
    "netflix.com",
    "spotify.com"
];

// Helper function to check if URL is CAPTCHA-related
function isCaptchaRequest(url) {
    const urlStr = url.toString().toLowerCase();
    return CAPTCHA_DOMAINS.some((domain) => urlStr.includes(domain));
}

// Helper function to check if URL is from a site with heavy cookies
function isHeavyCookieSite(url) {
    const urlStr = url.toString().toLowerCase();
    return HEAVY_COOKIE_DOMAINS.some((domain) => urlStr.includes(domain));
}

// Helper function to ensure proper CAPTCHA handling
function enhanceCaptchaRequest(request) {
    // Clone the request to ensure all headers and properties are preserved
    const headers = sanitizeHeaders(request.headers);

    // Ensure proper headers for CAPTCHA requests
    if (!headers.has("Accept")) {
        headers.set("Accept", "*/*");
    }

    // Preserve credentials for CAPTCHA cookies
    return new Request(request, {
        headers: headers,
        credentials: "include",
        mode: request.mode === "navigate" ? "same-origin" : request.mode
    });
}

// Enhanced request handler for heavy cookie sites
function enhanceHeavyCookieRequest(request) {
    const headers = sanitizeHeaders(request.headers);

    // Ensure credentials are included for cookie persistence
    return new Request(request, {
        headers: headers,
        credentials: "include",
        cache: "no-cache" // Prevent caching issues with cookie-dependent content
    });
}

self.addEventListener("fetch", function (event) {
    event.respondWith(
        (async () => {
            try {
                await sj.loadConfig();

                const url = event.request.url;
                const isCaptcha = isCaptchaRequest(url);
                const isHeavyCookie = isHeavyCookieSite(url);

                // Safely check if this is a proxied request using optional chaining
                const uvPrefix =
                    (typeof __uv$config !== "undefined" && __uv$config?.prefix) || null;
                const isUvRequest = uvPrefix ? url.startsWith(location.origin + uvPrefix) : false;
                const isSjRequest = sj.route(event);
                const isProxiedRequest = isUvRequest || isSjRequest;

                // Enhanced handling for CAPTCHA and heavy cookie requests
                let request = event.request;
                if (isCaptcha) {
                    request = enhanceCaptchaRequest(event.request);
                } else if (isHeavyCookie) {
                    request = enhanceHeavyCookieRequest(event.request);
                }

                let response;
                try {
                    if (isUvRequest) {
                        response = await uv.fetch(event);
                    } else if (isSjRequest) {
                        response = await sj.fetch(event);
                    } else {
                        response = await fetch(request);
                    }
                } catch (fetchError) {
                    // Handle InvalidHeaderValue and other fetch errors
                    const errorMessage = String(fetchError.message || fetchError);
                    if (errorMessage.includes("InvalidHeaderValue") || 
                        errorMessage.includes("failed to parse header")) {
                        console.warn("Header error, retrying with sanitized request:", url);
                        // Try again with sanitized headers
                        const sanitizedRequest = new Request(event.request.url, {
                            method: event.request.method,
                            headers: sanitizeHeaders(event.request.headers),
                            body: event.request.method !== "GET" && event.request.method !== "HEAD" 
                                ? event.request.body : undefined,
                            mode: "cors",
                            credentials: "include",
                            redirect: "follow"
                        });
                        
                        // Retry with sanitized request
                        response = await fetch(sanitizedRequest);
                    } else {
                        throw fetchError;
                    }
                }

                // Inject interceptor script into proxied HTML responses
                if (isProxiedRequest && response) {
                    response = await injectInterceptorScript(response);
                }

                return response;
            } catch (error) {
                console.error("Service worker fetch error:", error);
                // Return a proper error response instead of failing silently
                return new Response("Service Worker Error", {
                    status: 500,
                    statusText: "Internal Service Worker Error",
                    headers: { "Content-Type": "text/plain" }
                });
            }
        })()
    );
});

// Script to inject into proxied pages to intercept new tab/window attempts
const INTERCEPTOR_SCRIPT = `
<script>
(function() {
    // Intercept window.open to prevent new tabs/windows from opening
    const originalOpen = window.open;
    window.open = function(url, target, features) {
        if (url) {
            console.log('[Proxy Interceptor] Redirecting window.open to same window:', url);
            // Navigate in the current window instead of opening a new one
            // The URL is already proxied at this point, so we can directly navigate
            window.location.href = url;
            
            // Return a Proxy that mimics a Window object for compatibility
            return new Proxy({}, {
                get: function() { return null; },
                set: function() { return true; }
            });
        }
        return null;
    };
    
    // Remove target="_blank" from all links
    function removeTargetBlank() {
        document.querySelectorAll('a[target="_blank"], a[target="_new"]').forEach(function(anchor) {
            anchor.removeAttribute('target');
        });
    }
    
    // Run on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', removeTargetBlank);
    } else {
        removeTargetBlank();
    }
    
    // Watch for dynamically added links
    if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    // Check if it's an Element node (nodeType === 1)
                    if (node.nodeType !== 1) return;
                    
                    if (node.tagName === 'A' && (node.getAttribute('target') === '_blank' || node.getAttribute('target') === '_new')) {
                        node.removeAttribute('target');
                    }
                    if (node.querySelectorAll) {
                        node.querySelectorAll('a[target="_blank"], a[target="_new"]').forEach(function(anchor) {
                            anchor.removeAttribute('target');
                        });
                    }
                });
            });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }
})();
</script>
`;

// Helper function to inject script into HTML responses
async function injectInterceptorScript(response) {
    const contentType = response.headers.get("content-type") || "";

    // Only inject into HTML responses
    if (!contentType.includes("text/html")) {
        return response;
    }

    try {
        const text = await response.text();

        // Check if script was already injected to prevent duplicates
        if (text.includes("[Proxy Interceptor]")) {
            return new Response(text, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers
            });
        }

        // Inject the script just after opening tags
        // Handle both normal opening tags and self-closing tags
        let modifiedHtml = text;
        let injected = false;

        // Try to inject after <head> tag (normal or self-closing)
        if (!injected && /<head(\s[^>]*)?>/i.test(text)) {
            modifiedHtml = text.replace(/<head(\s[^>]*)?>/i, (match) => match + INTERCEPTOR_SCRIPT);
            injected = true;
        }

        // Fallback: inject after <body> tag (normal or self-closing)
        if (!injected && /<body(\s[^>]*)?>/i.test(text)) {
            modifiedHtml = text.replace(/<body(\s[^>]*)?>/i, (match) => match + INTERCEPTOR_SCRIPT);
            injected = true;
        }

        // Last resort: inject after <html> tag (normal or self-closing)
        if (!injected && /<html(\s[^>]*)?>/i.test(text)) {
            modifiedHtml = text.replace(/<html(\s[^>]*)?>/i, (match) => match + INTERCEPTOR_SCRIPT);
            injected = true;
        }

        // Return modified response
        return new Response(modifiedHtml, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    } catch (error) {
        console.error("Error injecting interceptor script:", error);
        return response;
    }
}

// Add error handling for service worker activation
self.addEventListener("activate", function (event) {
    event.waitUntil(
        (async () => {
            try {
                // Claim all clients to ensure the service worker takes control immediately
                await self.clients.claim();
            } catch (error) {
                console.error("Service worker activation error:", error);
            }
        })()
    );
});

// Add error handling for service worker installation
self.addEventListener("install", function (event) {
    // Skip waiting to activate immediately
    self.skipWaiting();
});
