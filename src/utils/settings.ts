import { StoreManager } from "./storage";
import { BareMuxConnection } from "@mercuryworkshop/bare-mux";
import { SW } from "@utils/proxy.ts";
import { SearchEngines } from "./types";
/**
 * The settings class
 * Initializes it's own StorageManager, and handles everything within the class itself
 *
 * @example
 * // Create a new Settings instance (needs to be done only once)
 * import { Settings } from "@utils/settings.ts";
 * const settings = new Settings();
 * //Consume any of the methods with:
 * settings.methodName();
 *
 * // Most of the time, you'll want to get the running instance this can be done with
 * import { Settings } from "@utils/settings.ts";
 * const settings = await Settings.getInstance();
 * //Consume any of the methods with:
 * settings.methodName();
 */
class Settings {
    // Our own internal StorageManager so things never interfere
    #storageManager: StoreManager<"radius||settings">;
    static #instance = new Set();
    #mediaQuery: MediaQueryList | null = null;

    /**
     * Method to get the current or other Settings instance(s)
     *
     *
     * @example
     * const settings = await Settings.getInstance();
     * // Consume the other methods
     */
    static async getInstance() {
        function* get() {
            for (const instance of Settings.#instance.keys()) {
                yield instance!;
            }
        }

        const ready = (): Promise<boolean> => {
            return new Promise((resolve) => {
                // Check immediately first
                if (Settings.#instance.size !== 0) {
                    resolve(true);
                    return;
                }
                // Then poll at intervals
                const i = setInterval(() => {
                    if (Settings.#instance.size !== 0) {
                        clearInterval(i);
                        resolve(true);
                    }
                }, 50); // Reduced from 100ms to 50ms for faster response
            });
        };

        await ready();
        return get().next().value! as Settings;
    }

    /**
     * Get the current effective theme based on theme mode
     * @returns 'light' or 'dark'
     */
    #getEffectiveTheme(): 'light' | 'dark' {
        const themeMode = this.#storageManager.getVal("themeMode") || "dark";
        if (themeMode === "system") {
            return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
        }
        return themeMode as 'light' | 'dark';
    }

    /**
     * Apply the current theme mode to the document
     */
    #applyThemeMode() {
        const themeMode = this.#storageManager.getVal("themeMode") || "dark";
        const customTheme = this.#storageManager.getVal("theme");
        
        // Remove all theme classes first
        document.documentElement.classList.remove("light", "dark");
        
        // If there's a custom theme set (not "default"), use it
        if (customTheme && customTheme !== "default") {
            document.documentElement.className = customTheme;
            // Add theme mode class for logo/favicon switching
            const effectiveTheme = this.#getEffectiveTheme();
            document.documentElement.classList.add(effectiveTheme);
        } else {
            // Apply theme mode (light/dark/system)
            const effectiveTheme = this.#getEffectiveTheme();
            document.documentElement.className = effectiveTheme;
        }
        
        // Update favicon based on effective theme
        this.#updateFavicon();
    }

    /**
     * Update the favicon based on the current theme
     */
    #updateFavicon() {
        const effectiveTheme = this.#getEffectiveTheme();
        const faviconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
        if (faviconLink) {
            // Light favicon for dark theme, dark favicon for light theme
            faviconLink.href = effectiveTheme === "dark" ? "/favicon-light.png" : "/favicon-dark.png";
        }
    }

    /**
     * Sets the theme mode (light, dark, or system)
     *
     * @example
     * settings.themeMode('light') // Light theme
     * settings.themeMode('dark') // Dark theme
     * settings.themeMode('system') // Follow system preference
     */
    themeMode(mode?: 'light' | 'dark' | 'system') {
        if (mode) {
            this.#storageManager.setVal("themeMode", mode);
        }
        this.#applyThemeMode();
        
        // Set up system preference listener if mode is 'system'
        if (mode === 'system' || this.#storageManager.getVal("themeMode") === "system") {
            if (!this.#mediaQuery) {
                this.#mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
                this.#mediaQuery.addEventListener("change", () => {
                    if (this.#storageManager.getVal("themeMode") === "system") {
                        this.#applyThemeMode();
                    }
                });
            }
        }
    }

    /**
     * Sets the theme either to the current theme OR to a new one
     *
     * @example
     * // Retrieve the Settings instance
     * const settings = await Settings.getInstance();
     *
     * // Consume the method
     * settings.theme() // Whatever value is in localstorage at the time
     * settings.theme('theme name') // A new theme based off of the class name
     */
    theme(theme?: string) {
        this.#storageManager.setVal("theme", theme || this.#storageManager.getVal("theme"));
        // Apply both custom theme and theme mode
        this.#applyThemeMode();
    }

    proxy(prox?: "uv" | "sj") {
        // Only set if a value is explicitly passed, or if no value exists in storage
        if (prox !== undefined) {
            this.#storageManager.setVal("proxy", prox);
        } else {
            const existingValue = this.#storageManager.getVal("proxy");
            if (!existingValue) {
                this.#storageManager.setVal("proxy", "uv");
            }
        }
    }

    searchEngine(engine?: string) {
        // Only set if a value is explicitly passed, or if no value exists in storage
        if (engine !== undefined) {
            this.#storageManager.setVal("searchEngine", engine);
        } else {
            const existingValue = this.#storageManager.getVal("searchEngine");
            if (!existingValue) {
                this.#storageManager.setVal("searchEngine", SearchEngines.DuckDuckGo);
            }
        }
    }

    cloak(location: string) {
        return {
            aboutBlank: () => {
                const win = window.open();
                if (!win) return;
                window.location.replace(location);
                const iframe = win.document.createElement("iframe") as HTMLIFrameElement;
                win.document.body.setAttribute("style", "margin: 0; height: 100vh; width: 100%;");
                iframe.setAttribute("style", "border: none; width: 100%; height: 100%; margin: 0;");
                iframe.src = window.location.href;
                win.document.body.appendChild(iframe);
            },
            blob: () => {
                const win = window.open();
                if (!win) return;
                window.location.replace(location);
                const content = `
                    <!DOCTYPE html>
                    <html>
                        <head>
                            <style type="text/css">
                                body, html {
                                    margin: 0;
                                    padding: 0;
                                    height: 100%;
                                    width: 100%;
                                    overflow: hidden;
                                }
                            </style>
                        </head>
                        <body>
                            <iframe style="border: none; width: 100%; height: 100%;" src="${window.location.href}"></iframe>
                        </body>
                    </html>
                `;
                const blob = new Blob([content], { type: "text/html" });
                const url = URL.createObjectURL(blob);
                win.location.href = url;
            }
        };
    }

    adBlock(enabled?: boolean) {
        if (enabled === true || enabled === false) {
            this.#storageManager.setVal("adBlock", enabled.valueOf().toString());
        } else {
            // Only set default if no value exists in storage
            const existingValue = this.#storageManager.getVal("adBlock");
            if (!existingValue) {
                this.#storageManager.setVal("adBlock", "true");
            }
        }
    }

    async *#init() {
        // Initialize theme mode first
        yield this.themeMode();
        // Then apply any custom theme
        yield this.theme(this.#storageManager.getVal("theme") || "default");
    }

    constructor() {
        this.#storageManager = new StoreManager("radius||settings");
        Settings.#instance.add(this);
        (async () => {
            for await (const _ of this.#init());
        })();
    }
}

export { Settings };
