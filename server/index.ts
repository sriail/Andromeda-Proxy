import Fastify, {
    FastifyReply,
    FastifyRequest,
    FastifyServerFactory,
    FastifyServerFactoryHandler,
    RawServerDefault
} from "fastify";
import fastifyMiddie from "@fastify/middie";
import fastifyStatic from "@fastify/static";
import { fileURLToPath } from "node:url";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { createBareServer } from "@tomphttp/bare-server-node";

//@ts-ignore this is created at runtime. No types associated w/it
import { handler as astroHandler } from "../dist/server/entry.mjs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

/**
 * Sanitize HTTP header value to prevent InvalidHeaderValue errors
 * Removes control characters that are not allowed in HTTP headers
 */
function sanitizeHeaderValue(value: string): string {
    if (typeof value !== "string") return String(value || "");
    // Remove control characters (except horizontal tab), newlines
    return value
        .replace(/[\x00-\x08\x0A-\x1F\x7F]/g, "")
        .replace(/\r?\n/g, " ")
        .trim();
}

/**
 * Sanitize all headers in a request/response
 */
function sanitizeHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            result[key] = value.map(v => sanitizeHeaderValue(v));
        } else {
            result[key] = sanitizeHeaderValue(value);
        }
    }
    return result;
}

const bareServer = createBareServer("/bare/", {
    connectionLimiter: {
        // Optimized for sites with heavy cookies and complex browser services
        maxConnectionsPerIP: parseInt(process.env.BARE_MAX_CONNECTIONS_PER_IP as string) || 1000,
        windowDuration: parseInt(process.env.BARE_WINDOW_DURATION as string) || 60,
        blockDuration: parseInt(process.env.BARE_BLOCK_DURATION as string) || 30
    }
});

const serverFactory: FastifyServerFactory = (
    handler: FastifyServerFactoryHandler
): RawServerDefault => {
    // Server options with enhanced limits for proxy usage
    const serverOptions: any = {
        // Increase header size limit for sites with heavy cookies
        maxHeaderSize: 65536, // 64KB (increased from 32KB for better compatibility)
        // Enable keep-alive for better connection stability
        keepAlive: true,
        keepAliveTimeout: 65000, // 65 seconds
        // Increase timeout for long-running requests
        requestTimeout: 120000 // 120 seconds
    };
    
    const server = createServer(serverOptions);

    server
        .on("request", (req, res) => {
            try {
                // Add CORS headers for better proxy compatibility
                res.setHeader("Access-Control-Allow-Origin", "*");
                res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
                res.setHeader("Access-Control-Allow-Headers", "*");
                
                // Handle preflight requests
                if (req.method === "OPTIONS") {
                    res.statusCode = 204;
                    res.end();
                    return;
                }
                
                if (bareServer.shouldRoute(req)) {
                    bareServer.routeRequest(req, res);
                } else {
                    handler(req, res);
                }
            } catch (error: any) {
                console.error("Error handling request:", error);
                // Check for header-related errors
                const errorMessage = String(error.message || error);
                if (errorMessage.includes("header") || errorMessage.includes("Header")) {
                    console.warn("Header-related error, attempting recovery");
                }
                if (!res.headersSent) {
                    res.statusCode = 500;
                    res.end("Internal Server Error");
                }
            }
        })
        .on("upgrade", (req, socket, head) => {
            try {
                if (bareServer.shouldRoute(req)) {
                    bareServer.routeUpgrade(req, socket as Socket, head);
                } else if (req.url?.endsWith("/wisp/") || req.url?.endsWith("/adblock/")) {
                    wisp.routeRequest(req, socket as Socket, head);
                } else {
                    // Handle other WebSocket upgrades gracefully
                    socket.destroy();
                }
            } catch (error) {
                console.error("Error handling WebSocket upgrade:", error);
                if (!socket.destroyed) {
                    socket.destroy();
                }
            }
        })
        .on("error", (error: any) => {
            // Handle specific error types
            if (error.code === "ECONNRESET") {
                // Connection reset by peer - normal for proxied connections
                return;
            }
            if (error.code === "EPIPE") {
                // Broken pipe - client disconnected
                return;
            }
            console.error("Server error:", error);
        })
        .on("clientError", (error: any, socket) => {
            // Handle header parse errors gracefully
            if (error.code === "HPE_HEADER_OVERFLOW" || 
                error.code === "HPE_INVALID_HEADER_TOKEN" ||
                String(error.message).includes("header")) {
                console.warn("Client header error (recoverable):", error.code || error.message);
            } else {
                console.error("Client error:", error);
            }
            if (!socket.destroyed) {
                socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
            }
        });

    return server;
};

const app = Fastify({
    logger: process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV === "development",
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true,
    serverFactory: serverFactory,
    // Increase body size limits for sites with heavy data
    bodyLimit: 10485760, // 10MB
    // Improve connection handling
    connectionTimeout: 120000, // 120 seconds
    keepAliveTimeout: 65000, // 65 seconds
    // Enable trust proxy for proper IP handling behind reverse proxies
    trustProxy: true
});

await app.register(fastifyStatic, {
    root: fileURLToPath(new URL("../dist/client", import.meta.url))
});

await app.register(fastifyMiddie);

await app.use(astroHandler);

app.setNotFoundHandler((req, res) => {
    res.redirect("/404");
});

// Add error handler for better error handling
app.setErrorHandler((error: any, request, reply) => {
    // Handle header-related errors gracefully
    const errorMessage = String(error.message || error);
    if (errorMessage.includes("InvalidHeaderValue") || 
        errorMessage.includes("header") ||
        errorMessage.includes("Header")) {
        console.warn("Header error in request:", errorMessage);
        reply.status(400).send({
            error: "Bad Request",
            message: "Invalid header value in request"
        });
        return;
    }
    
    console.error("Fastify error:", error);
    reply.status(error.statusCode || 500).send({
        error: "Internal Server Error",
        message: process.env.NODE_ENV === "development" ? error.message : "An error occurred"
    });
});

const port = parseInt(process.env.PORT as string) || parseInt("8080");

app.listen({ port: port, host: "0.0.0.0" })
    .then(async () => {
        console.log(`Server listening on http://localhost:${port}/`);
        console.log(`Server also listening on http://0.0.0.0:${port}/`);
        console.log(`Connection timeout: 120s, Keep-alive timeout: 65s`);
        console.log(`Max header size: 64KB, Max headers: 200, Body limit: 10MB`);
    })
    .catch((error) => {
        console.error("Failed to start server:", error);
        process.exit(1);
    });
