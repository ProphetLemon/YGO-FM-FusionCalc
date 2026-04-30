export function readJson<T>(storage: Storage, key: string): T | null {
    const raw = storage.getItem(key);
    if (raw === null) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

export function writeJson<T>(storage: Storage, key: string, value: T): void {
    try {
        storage.setItem(key, JSON.stringify(value));
    } catch {
        // Quota exceeded or storage unavailable; silently ignore.
    }
}
