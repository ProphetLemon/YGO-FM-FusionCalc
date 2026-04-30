export const MIN_HAND_SIZE = 2;
export const MAX_HAND_SIZE = 5;

export function canAddSlot(count: number): boolean {
    return count < MAX_HAND_SIZE;
}

export function canRemoveSlot(count: number): boolean {
    return count > MIN_HAND_SIZE;
}

export function getValidIds(
    values: readonly string[],
    idsByNameLower: ReadonlyMap<string, number>
): number[] {
    return values
        .map((v) => idsByNameLower.get(v.trim().toLowerCase()))
        .filter((id): id is number => id !== undefined);
}
