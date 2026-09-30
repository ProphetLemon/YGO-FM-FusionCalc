// The part of the Web Storage API these helpers use, so a test can hand in a plain fake.
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

// Merely reading window.localStorage or window.sessionStorage throws when the browser blocks site data.
export function browserStorage(area: "localStorage" | "sessionStorage"): Storage | null {
    try {
        return window[area];
    } catch {
        return null;
    }
}

export function readJson<T>(storage: StorageLike | null, key: string): T | null {
    if (storage === null) return null;
    try {
        const raw = storage.getItem(key);
        return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
        // Storage that cannot be read, or a value that is not JSON: there is nothing to use.
        return null;
    }
}

export function writeJson<T>(storage: StorageLike | null, key: string, value: T): void {
    if (storage === null) return;
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // Quota exceeded or storage unavailable; silently ignore.
    }
}
