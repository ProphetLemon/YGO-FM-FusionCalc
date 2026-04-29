import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./views/**/*.ejs", "./src/client/**/*.ts"],
    theme: {
        extend: {},
    },
    plugins: [],
};

export default config;
