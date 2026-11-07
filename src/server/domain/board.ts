import {
    MAX_CHAIN_STATES,
    TOP_N,
    compareCandidates,
    exploreHandStates,
    toChainResult,
} from "./chain-search.js";
import type { Candidate } from "./chain-search.js";
import { isMonster, toCardSummary } from "./cards.js";
import { expand, sortRituals } from "./rituals.js";
import { terrainAttack, type TerrainId } from "../../shared/terrains.js";
import { getCardById, getEquipsForCard, getFusionResult, getRitualRecipes } from "../data/store.js";
import type {
    BoardZone,
    CalculatorResponse,
    Card,
    ChainResult,
    ChainSearchResponse,
    EquipExpanded,
    FusionExpanded,
    RitualData,
    RitualExpanded,
    SlotRef,
} from "../../shared/types.js";

export interface BoardInput {
    handIds: readonly number[];
    monsterIds: readonly number[];
    spellIds: readonly number[];
    // The field terrain the answer is ranked on; absent or null ranks by the printed ATK.
    terrain?: TerrainId | null;
}

interface Slot {
    card: Card;
    ref: SlotRef;
}

const EQUIP_TYPE = 23;

// Unknown ids leave no slot, but the others keep the index they have in the array the client sent.
function slotsOf(zone: BoardZone, ids: readonly number[]): Slot[] {
    const slots: Slot[] = [];
    ids.forEach((id, index) => {
        const card = getCardById(id);
        if (card) slots.push({ card, ref: { zone, index } });
    });
    return slots;
}

function isEquipCard(card: Card): boolean {
    return card.Type === EQUIP_TYPE;
}

// R1, R2: a hand card fuses with another hand card or with a monster-zone card; field cards never fuse with
// each other and the spell/trap zone takes no part.
function findBoardFusions(
    hand: readonly Slot[],
    field: readonly Slot[],
    terrain: TerrainId | null | undefined
): FusionExpanded[] {
    const fusions: FusionExpanded[] = [];
    const tryFuse = (first: Slot, second: Slot): void => {
        const resultId = getFusionResult(first.card.Id, second.card.Id);
        const result = resultId === undefined ? undefined : getCardById(resultId);
        if (!result) return;
        fusions.push({
            card1: toCardSummary(first.card),
            card2: toCardSummary(second.card),
            result: toCardSummary(result),
            from: [first.ref, second.ref],
        });
    };
    hand.forEach((first, i) => {
        for (const second of hand.slice(i + 1)) tryFuse(first, second);
    });
    for (const first of hand) {
        for (const second of field) tryFuse(first, second);
    }
    // Array.sort is stable, so ties keep the hand-before-field order above. On a terrain the order follows the
    // ATK the result has there; the summaries keep the printed values.
    const attackOf = (fusion: FusionExpanded): number =>
        terrainAttack(fusion.result.attack, fusion.result.type, terrain);
    return fusions.sort((a, b) => attackOf(b) - attackOf(a));
}

// R5: card1 is always the Equip card. One in the hand can target the hand or the monster zone, one in the
// spell/trap zone only the monster zone.
function findBoardEquips(
    hand: readonly Slot[],
    field: readonly Slot[],
    spells: readonly Slot[]
): EquipExpanded[] {
    const equips: EquipExpanded[] = [];
    const collect = (equip: Slot, targets: readonly Slot[]): void => {
        const equippable = getEquipsForCard(equip.card.Id);
        for (const target of targets) {
            if (target.ref === equip.ref || !isMonster(target.card)) continue;
            if (!equippable.includes(target.card.Id)) continue;
            equips.push({
                card1: toCardSummary(equip.card),
                card2: toCardSummary(target.card),
                from: [equip.ref, target.ref],
            });
        }
    };
    for (const equip of hand) {
        if (isEquipCard(equip.card)) collect(equip, [...hand, ...field]);
    }
    for (const equip of spells) {
        if (isEquipCard(equip.card)) collect(equip, field);
    }
    return equips;
}

// R4: the ritual card comes from the hand or the spell/trap zone, the 3 materials from the monster zone only.
// Each requirement takes its own monster slot, so an id a recipe lists twice must be on the field twice.
function findBoardRituals(
    ritualSlots: readonly Slot[],
    field: readonly Slot[],
    terrain: TerrainId | null | undefined
): RitualExpanded[] {
    const rituals: RitualExpanded[] = [];
    for (const recipe of getRitualRecipes()) {
        const from = placeRecipe(recipe, ritualSlots, field);
        const ritual = from ? expand(recipe) : null;
        if (from && ritual) rituals.push({ ...ritual, from });
    }
    return terrain ? sortRitualsOnTerrain(rituals, terrain) : sortRituals(rituals);
}

// The order of `sortRituals` with the ATK the result has on the terrain.
export function sortRitualsOnTerrain(rituals: RitualExpanded[], terrain: TerrainId): RitualExpanded[] {
    const attackOf = (ritual: RitualExpanded): number =>
        terrainAttack(ritual.result.attack, ritual.result.type, terrain);
    return rituals.sort((a, b) => attackOf(b) - attackOf(a) || a.result.id - b.result.id);
}

function placeRecipe(
    recipe: RitualData,
    ritualSlots: readonly Slot[],
    field: readonly Slot[]
): RitualExpanded["from"] | null {
    const ritualCard = ritualSlots.find((slot) => slot.card.Id === recipe.RitualCard);
    if (!ritualCard) return null;
    const free = [...field];
    const materials: SlotRef[] = [];
    for (const id of [recipe.Card1, recipe.Card2, recipe.Card3]) {
        const at = free.findIndex((slot) => slot.card.Id === id);
        const slot = free[at];
        if (!slot) return null;
        free.splice(at, 1);
        materials.push(slot.ref);
    }
    return { ritualCard: ritualCard.ref, materials };
}

export function findBoardCombinations(board: BoardInput): CalculatorResponse {
    const hand = slotsOf("hand", board.handIds);
    const field = slotsOf("monster", board.monsterIds);
    const spells = slotsOf("spell", board.spellIds);
    return {
        fusions: findBoardFusions(hand, field, board.terrain),
        equips: findBoardEquips(hand, field, spells),
        rituals: findBoardRituals([...hand, ...spells], field, board.terrain),
    };
}

interface BoardCandidate {
    candidate: Candidate;
    fieldIndex?: number;
}

// Index in monsterIds of each distinct known monster; the first copy wins, as a copy gives the same chains.
function distinctFieldMonsters(monsterIds: readonly number[]): Array<{ id: number; index: number }> {
    const seen = new Set<number>();
    const monsters: Array<{ id: number; index: number }> = [];
    monsterIds.forEach((id, index) => {
        const card = getCardById(id);
        if (!card || !isMonster(card) || seen.has(id)) return;
        seen.add(id);
        monsters.push({ id, index });
    });
    return monsters;
}

// Fewer steps win. On a tie the earlier search wins: the hand-only one, then the lower field index.
function mergeCandidates(searches: readonly BoardCandidate[][]): BoardCandidate[] {
    const best = new Map<number, BoardCandidate>();
    for (const found of searches) {
        for (const entry of found) {
            const known = best.get(entry.candidate.last.result);
            if (!known || entry.candidate.steps < known.candidate.steps) {
                best.set(entry.candidate.last.result, entry);
            }
        }
    }
    return [...best.values()];
}

function toBoardChain({ candidate, fieldIndex }: BoardCandidate): ChainResult {
    const chain = toChainResult(candidate);
    return fieldIndex === undefined ? chain : { ...chain, fieldIndex };
}

// The ATK the final card of a candidate has on the terrain; the printed one without a terrain.
function candidateAttack(entry: BoardCandidate, terrain: TerrainId | null | undefined): number {
    const result = getCardById(entry.candidate.last.result);
    return result ? terrainAttack(entry.candidate.attack, result.Type, terrain) : entry.candidate.attack;
}

// The order of `compareCandidates` with the ATK on the terrain, so the top is chosen after the adjustment.
function compareOnTerrain(
    terrain: TerrainId | null | undefined
): (a: BoardCandidate, b: BoardCandidate) => number {
    return (a: BoardCandidate, b: BoardCandidate): number =>
        candidateAttack(b, terrain) - candidateAttack(a, terrain) ||
        a.candidate.steps - b.candidate.steps ||
        a.candidate.last.result - b.candidate.last.result;
}

// R3, D4: hand-only chains, plus chains whose first material is one monster of the monster zone. With a
// terrain the top chains are those with the highest ATK there, which can differ from the printed ranking.
export function findBoardChains(
    board: BoardInput,
    maxStates: number = MAX_CHAIN_STATES
): ChainSearchResponse {
    const hand = board.handIds.filter((id) => getCardById(id) !== undefined);
    const handOnly = exploreHandStates(hand, maxStates);
    const searches: BoardCandidate[][] = [
        [...handOnly.candidates.values()].map((candidate) => ({ candidate })),
    ];
    let truncated = handOnly.truncated;

    for (const { id, index } of distinctFieldMonsters(board.monsterIds)) {
        const fromField = exploreHandStates([id, ...hand], maxStates, true);
        truncated ||= fromField.truncated;
        searches.push(
            [...fromField.candidates.values()].map((candidate) => ({ candidate, fieldIndex: index }))
        );
    }

    const chains = mergeCandidates(searches)
        .sort(
            board.terrain
                ? compareOnTerrain(board.terrain)
                : (a, b) => compareCandidates(a.candidate, b.candidate)
        )
        .slice(0, TOP_N)
        .map(toBoardChain);
    return { chains, truncated };
}
