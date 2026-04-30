export function qs<T extends Element = Element>(selector: string, root: ParentNode = document): T | null {
    return root.querySelector<T>(selector);
}

export function qsa<T extends Element = Element>(selector: string, root: ParentNode = document): T[] {
    return Array.from(root.querySelectorAll<T>(selector));
}

export function clear(el: Element): void {
    while (el.firstChild) el.removeChild(el.firstChild);
}
