import { BareMuxConnection } from "@mercuryworkshop/bare-mux";
import { StoreManager } from "./storage";
import { initializeCaptchaHandlers } from "./captcha-handler";

const createScript = (src: string, defer?: boolean) => {
    const script = document.createElement("script") as HTMLScriptElement;
    script.src = src;
    if (defer) script.defer = defer;
    return document.body.appendChild(script);
};

/**
 * This class automatically sets up and handles lots of stuff for us.
 *
 * It registers/fixes errors with SW reg
 * It creates our bareMux worker
 * And other stuff.
 *
 * @example
 * import { SW } from "@utils/proxy.ts";
 * const handler = new SW();
 * //Consume the methods
 * // Or if an instance is already running
 * import { SW } from "@utils/proxy.ts";
 * const handler = SW.getInstance();
 * //Consume the methods
 */
class SW {
    #baremuxConn?: BareMuxConnection;
    #scramjetController?: ScramjetController;
    #serviceWorker?: ServiceWorkerRegistration;
    #storageManager: StoreManager<"radius||settings">;
    #ready: Promise<void>;
    static #instance = new Set();

    static *getInstance() {
        for (const val of SW.#instance.keys()) {
            yield val as SW;
        }
    }

    /**
     * Async method to get the SW instance, waiting for it to be available
     */
    static async getInstanceAsync(): Promise<SW> {
        // Check immediately first
        if (SW.#instance.size !== 0) {
            return SW.getInstance().next().value! as SW;
        }
        // Wait for instance to be available
        return new Promise((resolve) => {
            const i = setInterval(() => {
                if (SW.#instance.size !== 0) {
                    clearInterval(i);
                    resolve(SW.getInstance().next().value! as SW);
                }
            }, 10);
        });
    }

    /**
     * Returns a promise that resolves when the SW instance is ready to use
     */
    ready(): Promise<void> {
        return this.#ready;
    }

    search(input: string, template: string) {
        try {
            return new URL(input).toString();
        } catch (_) {}

        try {
            const url = new URL(`http://${input}`);
            if (url.hostname.includes(".")) return url.toString();
        } catch (_) {}

        return template.replace("%s", encodeURIComponent(input));
    }

    encodeURL(string: string): string {
        const proxy = this.#storageManager.getVal("proxy") as "uv" | "sj";
        const input = this.search(string, this.#storageManager.getVal("searchEngine"));
        return proxy === "uv"
            ? `${__uv$config.prefix}${__uv$config.encodeUrl!(input)}`
            : this.#scramjetController!.encodeUrl(input);
    }

    async setTransport(transport?: "epoxy" | "libcurl", get?: boolean) {
        console.log("Setting transport");
        const routingMode = this.#storageManager.getVal("routingMode") || "wisp";
        const wispServer = (): string => {
            const wispServerVal = this.#storageManager.getVal("wispServer");
            if (this.#storageManager.getVal("adBlock") === "true") {
                return wispServerVal.replace("/wisp/", "/adblock/");
            }
            return wispServerVal;
        };
        const bareServer = (): string => {
            return (
                (location.protocol === "https:" ? "https://" : "http://") + location.host + "/bare/"
            );
        };
        if (get) return this.#storageManager.getVal("transport");
        this.#storageManager.setVal(
            "transport",
            transport || this.#storageManager.getVal("transport") || "epoxy"
        );

        if (routingMode === "bare") {
            // Use bare server transport
            await this.#baremuxConn!.setTransport("/baremod/index.mjs", [bareServer()]);
        } else {
            // Use wisp server transport (default)
            // Using safe transport wrappers that sanitize headers to prevent InvalidHeaderValue errors
            switch (transport) {
                case "epoxy": {
                    await this.#baremuxConn!.setTransport("/epoxy-safe/index.mjs", [
                        { wisp: wispServer() }
                    ]);
                    break;
                }
                case "libcurl": {
                    await this.#baremuxConn!.setTransport("/libcurl-safe/index.mjs", [
                        { wisp: wispServer() }
                    ]);
                    break;
                }
                default: {
                    await this.#baremuxConn!.setTransport("/epoxy-safe/index.mjs", [
                        { wisp: wispServer() }
                    ]);
                    break;
                }
            }
        }
    }

    async routingMode(mode?: "wisp" | "bare", set?: true) {
        this.#storageManager.setVal(
            "routingMode",
            mode || this.#storageManager.getVal("routingMode") || "wisp"
        );
        if (set) await this.setTransport();
    }

    async wispServer(wispServer?: string, set?: true) {
        console.log(wispServer?.replace("/wisp/", "/adblock/"));
        this.#storageManager.setVal(
            "wispServer",
            wispServer ||
                this.#storageManager.getVal("wispServer") ||
                (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/wisp/"
        );
        if (set) await this.setTransport();
    }

    constructor() {
        SW.#instance.add(this);
        this.#storageManager = new StoreManager("radius||settings");
        const checkScripts = (): Promise<void> => {
            return new Promise((resolve) => {
                // Check immediately first
                if (
                    typeof __uv$config !== "undefined" &&
                    typeof $scramjetLoadController !== "undefined"
                ) {
                    resolve();
                    return;
                }
                // Then poll at reasonable intervals to reduce CPU usage
                const t = setInterval(() => {
                    if (
                        typeof __uv$config !== "undefined" &&
                        typeof $scramjetLoadController !== "undefined"
                    ) {
                        clearInterval(t);
                        resolve();
                    }
                }, 10); // Check every 10ms instead of as fast as possible
            });
        };
        createScript("/vu/uv.bundle.js", true);
        createScript("/vu/uv.config.js", true);
        createScript("/marcs/scramjet.all.js", true);

        this.#ready = checkScripts().then(async () => {
            this.#baremuxConn = new BareMuxConnection("/erab/worker.js");
            await this.setTransport();

            // Load the ScramjetController class from the factory function
            const { ScramjetController } = $scramjetLoadController();

            this.#scramjetController = new ScramjetController({
                prefix: "/~/scramjet/",
                files: {
                    wasm: "/marcs/scramjet.wasm.wasm",
                    all: "/marcs/scramjet.all.js",
                    sync: "/marcs/scramjet.sync.js"
                },
                flags: {
                    rewriterLogs: false,
                    // Enhanced flags for optimal support of complex browser services
                    serviceworkers: true, // Enable service worker support
                    captureErrors: true, // Capture errors for better debugging
                    cleanErrors: false, // Keep error messages for debugging
                    strictRewrites: false, // Allow flexible rewrites for complex sites
                    syncxhr: true, // Enable synchronous XHR for complex callbacks
                    scramitize: true, // Enable advanced domain handling
                    allowFailedIntercepts: true // Continue on failed intercepts for better compatibility
                }
            });
            if ("serviceWorker" in navigator) {
                await this.#scramjetController.init();
                navigator.serviceWorker.ready.then(async (reg) => {
                    console.log("SW ready to go!");
                    this.#serviceWorker = reg;

                    // Initialize CAPTCHA handlers for automatic verification support
                    initializeCaptchaHandlers();
                });
                navigator.serviceWorker.register("/sw.js", { scope: "/" });
            } else {
                throw new Error(
                    "Your browser is not supported! This website uses Service Workers heavily."
                );
            }
        });
    }
}

export { SW };
