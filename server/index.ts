import Fastify, {
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
import { createServer } from "node:http";
import { Socket } from "node:net";

const bareServer = createBareServer("/bare/");

const serverFactory: FastifyServerFactory = (
    handler: FastifyServerFactoryHandler
): RawServerDefault => {
    const server = createServer({
        maxHeaderSize: 32768,
        keepAlive: true,
        keepAliveTimeout: 65000,
        requestTimeout: 120000
    });

    server
        .on("request", (req, res) => {
            if (bareServer.shouldRoute(req)) {
                bareServer.routeRequest(req, res);
            } else {
                handler(req, res);
            }
        })
        .on("upgrade", (req, socket, head) => {
            if (bareServer.shouldRoute(req)) {
                bareServer.routeUpgrade(req, socket as Socket, head);
            } else if (req.url?.endsWith("/wisp/") || req.url?.endsWith("/adblock/")) {
                wisp.routeRequest(req, socket as Socket, head);
            }
        })
        .on("error", (error) => {
            console.error("Server error:", error);
        });

    return server;
};

const app = Fastify({
    logger: process.env.LOG_LEVEL === "debug",
    ignoreDuplicateSlashes: true,
    ignoreTrailingSlash: true,
    serverFactory: serverFactory,
    bodyLimit: 10485760,
    connectionTimeout: 120000,
    keepAliveTimeout: 65000,
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

const port = parseInt(process.env.PORT || "8080");

app.listen({ port: port, host: "0.0.0.0" })
    .then(() => {
        console.log(`Server listening on http://localhost:${port}/`);
    })
    .catch((error) => {
        console.error("Failed to start server:", error);
        process.exit(1);
    });
