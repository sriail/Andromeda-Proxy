import { defineConfig } from "astro/config";
import type { Plugin } from "vite";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import { viteStaticCopy } from "vite-plugin-static-copy";
import playformCompress from "@playform/compress";
import { uvPath } from "@titaniumnetwork-dev/ultraviolet";
import { scramjetPath } from "@mercuryworkshop/scramjet/path";
//@ts-expect-error No types
import { epoxyPath } from "@mercuryworkshop/epoxy-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
//@ts-expect-error No types
import { bareModulePath } from "@mercuryworkshop/bare-as-module3";

const viteWispServer = (): Plugin => {
    return {
        name: "vite-wisp-server",
        configureServer(server) {
            server.httpServer?.on("upgrade", (req, socket, head) => {
                req.url.startsWith("/wisp") || req.url.startsWith("/adblock")
                    ? wisp.routeRequest(req, socket, head)
                    : undefined;
            });
        }
    };
};

export default defineConfig({
    vite: {
        plugins: [
            //@ts-ignore
            tailwindcss(),
            //@ts-ignore
            viteWispServer(),
            //@ts-ignore
            viteStaticCopy({
                targets: [
                    { src: `${uvPath}/**/*`.replace(/\\/g, "/"), dest: "vu", overwrite: false },
                    {
                        src: `${scramjetPath}/**/*`.replace(/\\/g, "/"),
                        dest: "marcs",
                        overwrite: false
                    },
                    {
                        src: `${baremuxPath}/**/*`.replace(/\\/g, "/"),
                        dest: "erab",
                        overwrite: false
                    },
                    {
                        src: `${epoxyPath}/**/*`.replace(/\\/g, "/"),
                        dest: "epoxy",
                        overwrite: false
                    },
                    {
                        src: `${bareModulePath}/**/*`.replace(/\\/g, "/"),
                        dest: "baremod",
                        overwrite: false
                    }
                ]
            })
        ]
    },
    integrations: [
        icon(),
        playformCompress({
            CSS: false,
            HTML: true,
            Image: true,
            JavaScript: true,
            SVG: true
        })
    ],
    output: "server",
    adapter: node({
        mode: "middleware"
    })
});
