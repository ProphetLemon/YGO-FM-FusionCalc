interface Bootstrap {
    lang: string;
    messages: Record<string, string>;
}

let cache: Bootstrap | null = null;

function read(): Bootstrap {
    if (cache !== null) return cache;
    const node = document.getElementById("i18n-bootstrap");
    if (!node || node.textContent === null) {
        cache = { lang: "es", messages: {} };
        return cache;
    }
    try {
        cache = JSON.parse(node.textContent) as Bootstrap;
    } catch {
        cache = { lang: "es", messages: {} };
    }
    return cache;
}

export function getLang(): string {
    return read().lang;
}

export function t(key: string, vars?: Record<string, string | number>): string {
    const { messages } = read();
    const raw = messages[key];
    if (raw === undefined) return `[${key}]`;
    if (!vars) return raw;
    return raw.replace(/\{\{(\w+)\}\}/g, (match, name: string) => {
        const v = vars[name];
        return v === undefined ? match : String(v);
    });
}
