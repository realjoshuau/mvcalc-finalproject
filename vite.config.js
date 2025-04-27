import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
    base: "/mvcalc-finalproject/",
    plugins: [tailwindcss()],
});
