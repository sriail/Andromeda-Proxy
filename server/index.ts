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

// Helper function to sanitize HTTP header values
// Removes characters that can cause http:Error(invalidHeaderValue)
// NOTE: This is duplicated from public/sw.js because they run in different contexts
// (Node.js server vs. browser service worker) and cannot share code directly
const sanitizeHeaderValue = (value: string): string => {
    if (typeof value !== "string") {
        return String(value);
    }
    // Remove null bytes, carriage returns, line feeds, and control characters
    return value
        .replace(/[\x00\r\n]/g, "")
        .replace(/[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
        .trim();
};

// Helper function to sanitize all headers in a request
const sanitizeRequestHeaders = (req: IncomingMessage): void => {
    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;

        if (Array.isArray(value)) {
            req.headers[key] = value.map((v) => sanitizeHeaderValue(v));
        } else {
            req.headers[key] = sanitizeHeaderValue(value);
        }
    }
};

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
    const server = createServer({
        // Increase header size limit for sites with heavy cookies
        maxHeaderSize: 65536, // 64KB (increased for better compatibility)
        // Enable keep-alive for better connection stability
        keepAlive: true,
        keepAliveTimeout: 65000, // 65 seconds
        // Increase timeout for long-running requests
        requestTimeout: 120000 // 120 seconds
    });

    server
        .on("request", (req: IncomingMessage, res: ServerResponse) => {
            try {
                // Sanitize request headers to prevent invalidHeaderValue errors
                sanitizeRequestHeaders(req);

                if (bareServer.shouldRoute(req)) {
                    bareServer.routeRequest(req, res);
                } else {
                    handler(req, res);
                }
            } catch (error) {
                console.error("Error handling request:", error);
                if (!res.headersSent) {
                    res.statusCode = 500;
                    res.end("Internal Server Error");
                }
            }
        })
        .on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
            try {
                // Sanitize request headers for WebSocket upgrades too
                sanitizeRequestHeaders(req);

                if (bareServer.shouldRoute(req)) {
                    bareServer.routeUpgrade(req, socket, head);
                } else if (req.url?.endsWith("/wisp/") || req.url?.endsWith("/adblock/")) {
                    wisp.routeRequest(req, socket, head);
                } else {
                    // Close socket for unhandled upgrade requests
                    socket.destroy();
                }
            } catch (error) {
                console.error("Error handling WebSocket upgrade:", error);
                socket.destroy();
            }
        })
        .on("error", (error: Error) => {
            console.error("Server error:", error);
        })
        .on("clientError", (error: Error, socket: Socket) => {
            // Suppress common client errors that don't need logging
            const errorMessage = error.message || "";
            if (!errorMessage.includes("ECONNRESET") && !errorMessage.includes("EPIPE")) {
                console.error("Client error:", error.message);
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
app.setErrorHandler((error, request, reply) => {
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
        console.log(`Max header size: 64KB, Body limit: 10MB`);
    })
    .catch((error) => {
        console.error("Failed to start server:", error);
        process.exit(1);
    });
