importScripts("/vu/uv.bundle.js", "/vu/uv.config.js", "/marcs/scramjet.all.js");
importScripts(__uv$config.sw || "/vu/uv.sw.js");

const uv = new UVServiceWorker();

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const sj = new ScramjetServiceWorker({
    defaultFlags: {
        serviceworkers: true,
        captureErrors: true,
        syncxhr: true,
        scramitize: true,
        cleanErrors: false,
        strictRewrites: false,
        allowFailedIntercepts: true
    }
});

self.addEventListener("fetch", function (event) {
    event.respondWith(
        (async () => {
            try {
                await sj.loadConfig();

                const url = event.request.url;

                // Check if this is a proxied request
                const uvPrefix =
                    (typeof __uv$config !== "undefined" && __uv$config?.prefix) || null;
                const isUvRequest = uvPrefix ? url.startsWith(location.origin + uvPrefix) : false;
                const isSjRequest = sj.route(event);

                let response;
                if (isUvRequest) {
                    response = await uv.fetch(event);
                } else if (isSjRequest) {
                    response = await sj.fetch(event);
                } else {
                    response = await fetch(event.request);
                }

                return response;
            } catch (error) {
                console.error("Service worker fetch error:", error);
                return new Response("Service Worker Error: " + error.message, {
                    status: 500,
                    statusText: "Internal Service Worker Error",
                    headers: { "Content-Type": "text/plain" }
                });
            }
        })()
    );
});

self.addEventListener("activate", function (event) {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("install", function (event) {
    self.skipWaiting();
});
