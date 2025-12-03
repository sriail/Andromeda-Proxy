/**
 * Safe Epoxy Transport Wrapper
 *
 * This wrapper sanitizes HTTP headers before passing them to the underlying
 * epoxy transport to prevent InvalidHeaderValue errors caused by invalid
 * characters (control characters, newlines, etc.) in header values.
 */

import EpoxyTransport, { epoxyInfo } from "/epoxy/index.mjs";

// Primary sanitization: Remove control characters except HTAB (0x09)
// Keeps: HTAB (0x09), printable ASCII (0x20-0x7E), and extended ASCII (0x80-0xFF)
const PRIMARY_SANITIZE_PATTERN = /[\x00-\x08\x0A-\x1F\x7F]/g;

// Strict fallback sanitization: Only allow printable ASCII (0x20-0x7E)
// Used when primary sanitization still fails (removes extended ASCII as well)
const STRICT_SANITIZE_PATTERN = /[^\x20-\x7E]/g;

/**
 * Sanitize a header value by removing invalid control characters.
 * Preserves HTAB (0x09), printable ASCII (0x20-0x7E), and extended ASCII (0x80-0xFF).
 * @param {string} value - The header value to sanitize
 * @returns {string} - The sanitized header value
 */
function sanitizeHeaderValue(value) {
    if (typeof value !== "string") {
        value = String(value);
    }
    return value.replace(PRIMARY_SANITIZE_PATTERN, "");
}

/**
 * Sanitize all headers in a headers object
 * @param {Record<string, string | string[]>} headers - Headers object to sanitize
 * @returns {Record<string, string | string[]>} - Sanitized headers object
 */
function sanitizeHeaders(headers) {
    if (!headers || typeof headers !== "object") {
        return headers;
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(headers)) {
        // Sanitize the header name (remove invalid characters)
        const sanitizedKey = sanitizeHeaderValue(key);

        // Skip empty header names
        if (!sanitizedKey || sanitizedKey.trim() === "") {
            continue;
        }

        if (Array.isArray(value)) {
            sanitized[sanitizedKey] = value.map((v) => sanitizeHeaderValue(v));
        } else {
            sanitized[sanitizedKey] = sanitizeHeaderValue(value);
        }
    }
    return sanitized;
}

/**
 * Safe Epoxy Transport that sanitizes headers before passing to the underlying transport
 */
class SafeEpoxyTransport {
    constructor(opts) {
        this.innerTransport = new EpoxyTransport(opts);
        this.ready = false;
    }

    async init() {
        await this.innerTransport.init();
        this.ready = this.innerTransport.ready;
    }

    async meta() {
        return this.innerTransport.meta();
    }

    async request(remote, method, body, headers, signal) {
        // Sanitize headers before passing to the inner transport
        const sanitizedHeaders = sanitizeHeaders(headers);

        try {
            return await this.innerTransport.request(
                remote,
                method,
                body,
                sanitizedHeaders,
                signal
            );
        } catch (error) {
            // If still getting InvalidHeaderValue, try with minimal headers
            if (error && error.message && error.message.includes("InvalidHeaderValue")) {
                console.warn("Header sanitization failed, retrying with minimal headers:", error);
                const minimalHeaders = {};
                // Only keep essential headers with extra sanitization
                for (const [key, value] of Object.entries(sanitizedHeaders || {})) {
                    const lowerKey = key.toLowerCase();
                    // Keep only safe headers
                    if (
                        [
                            "accept",
                            "accept-language",
                            "content-type",
                            "content-length",
                            "user-agent"
                        ].includes(lowerKey)
                    ) {
                        minimalHeaders[key] =
                            typeof value === "string"
                                ? value.replace(STRICT_SANITIZE_PATTERN, "")
                                : value;
                    }
                }
                return await this.innerTransport.request(
                    remote,
                    method,
                    body,
                    minimalHeaders,
                    signal
                );
            }
            throw error;
        }
    }

    connect(url, protocols, requestHeaders, onopen, onmessage, onclose, onerror) {
        // Sanitize headers before passing to the inner transport
        const sanitizedHeaders = sanitizeHeaders(requestHeaders);

        return this.innerTransport.connect(
            url,
            protocols,
            sanitizedHeaders,
            onopen,
            onmessage,
            onclose,
            onerror
        );
    }
}

export { epoxyInfo };
export default SafeEpoxyTransport;
