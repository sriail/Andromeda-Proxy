/**
 * Safe Libcurl Transport Wrapper
 *
 * This wrapper sanitizes HTTP headers before passing them to the underlying
 * libcurl transport to prevent InvalidHeaderValue errors caused by invalid
 * characters (control characters, newlines, etc.) in header values.
 */

import LibcurlTransport from "/libcurl/index.mjs";

/**
 * Sanitize a header value by removing invalid characters.
 * HTTP header values must be valid ASCII with no control characters (except HTAB).
 * @param {string} value - The header value to sanitize
 * @returns {string} - The sanitized header value
 */
function sanitizeHeaderValue(value) {
    if (typeof value !== "string") {
        value = String(value);
    }
    // Remove null bytes, newlines, carriage returns, and other control characters
    // except for horizontal tab (0x09) which is allowed in HTTP headers
    // Valid header value characters: 0x09 (HTAB), 0x20-0x7E (visible ASCII + space), 0x80-0xFF (obs-text)
    return value.replace(/[\x00-\x08\x0A-\x1F\x7F]/g, "");
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
 * Safe Libcurl Transport that sanitizes headers before passing to the underlying transport
 */
class SafeLibcurlTransport {
    constructor(opts) {
        this.innerTransport = new LibcurlTransport(opts);
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
                            typeof value === "string" ? value.replace(/[^\x20-\x7E]/g, "") : value;
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

export default SafeLibcurlTransport;
