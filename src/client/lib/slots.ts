import { MAX_HAND_SIZE } from "../../shared/limits.js";

export const MIN_HAND_SIZE = 5;

export function canAddSlot(count: number): boolean {
    return count < MAX_HAND_SIZE;
}

export function canRemoveSlot(count: number): boolean {
    return count > MIN_HAND_SIZE;
}

// The card id of every slot, in slot order; null for a slot that is empty or holds a name the index lacks.
export function getSlotIds(
    values: readonly string[],
    idsByNameLower: ReadonlyMap<string, number>
): Array<number | null> {
    return values.map((v) => idsByNameLower.get(v.trim().toLowerCase()) ?? null);
}

export function getValidIds(
    values: readonly string[],
    idsByNameLower: ReadonlyMap<string, number>
): number[] {
    return getSlotIds(values, idsByNameLower).filter((id): id is number => id !== null);
}
