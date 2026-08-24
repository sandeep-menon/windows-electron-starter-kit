import { resolve } from "path";
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    main: {
        define: {
            __GH_TOKEN_RO__: JSON.stringify(process.env.GH_TOKEN_RO ?? "")
        },
        build: {
            externalizeDeps: {
                exclude: ["electron-store"]
            }
        }
    },
    preload: {
        build: {
            externalizeDeps: {
                exclude: ["@electron-toolkit/preload", "electron-log"]
            }
        }
    },
    renderer: {
        resolve: {
            alias: {
                "@renderer": resolve("src/renderer/src"),
                "@": resolve("src/renderer/src")
            }
        },
        plugins: [react(), tailwindcss()]
    }
});
