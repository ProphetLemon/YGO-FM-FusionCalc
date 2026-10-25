// The two hand slots a fusion row was made from. A row only carries card ids: the server pairs the filled
// slots in hand order (i < j, empty slots skipped), so card1 comes first in the hand and card2 after it.
// The first slot holding card1 and the first one after it holding card2 are always a pair the server saw:
// a later card1 would only have fewer slots left for card2. Null when the hand has no such pair, for
// example because it changed after the results were drawn.
export function findFusionSlots(
    slotIds: ReadonlyArray<number | null>,
    card1Id: number,
    card2Id: number
): [number, number] | null {
    const first = slotIds.indexOf(card1Id);
    if (first === -1) return null;
    const second = slotIds.indexOf(card2Id, first + 1);
    return second === -1 ? null : [first, second];
}
