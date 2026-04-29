import type { Config } from "tailwindcss";

const config: Config = {
    content: ["./views/**/*.ejs", "./src/client/**/*.ts", "./public/javascripts/fusion*.js"],
    theme: {
        extend: {},
    },
    plugins: [],
};

export default config;
