export interface LatestRun {
    // Aborted as soon as the run is superseded or cancelled, so its request can be dropped too.
    readonly signal: AbortSignal;
    isCurrent(): boolean;
}

export interface Latest {
    begin(): LatestRun;
    cancel(): void;
}

// Latest-wins guard for async work: only the run started last may touch the page with its result.
export function createLatest(): Latest {
    let active: AbortController | null = null;
    return {
        begin(): LatestRun {
            active?.abort();
            const controller = new AbortController();
            active = controller;
            return { signal: controller.signal, isCurrent: () => !controller.signal.aborted };
        },
        cancel(): void {
            active?.abort();
            active = null;
        },
    };
}
