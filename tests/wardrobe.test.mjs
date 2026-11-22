import assert from "node:assert/strict";
import test from "node:test";
import {
  addItemWarpPoint, changeEquipment, emptyWardrobe, equipSavedItem, isWardrobe,
  moveItemWarpPoint, removeItemWarpPoint, unequip, updateItem,
} from "../features/character/wardrobe.ts";

const fit = {
  scale: 1.42, rotation: -23, x: 31.75, y: -12.5,
};

test("unequip and re-equip restores every transform exactly", () => {
  let state = equipSavedItem(emptyWardrobe(), "legs", "trousers");
  state = changeEquipment(state, current => ({ ...current, legs: { ...current.legs, ...fit } }));
  const expected = structuredClone(state.equipped.legs);
  state = changeEquipment(state, current => ({ ...current, legs: undefined }));
  assert.equal(state.equipped.legs, undefined);
  state = equipSavedItem(state, "legs", "trousers");
  assert.deepEqual(state.equipped.legs, expected);
});

test("replacing an item also saves it and each item keeps its own fit", () => {
  let state = equipSavedItem(emptyWardrobe(), "legs", "trousers-a");
  state = changeEquipment(state, current => ({ ...current, legs: { ...current.legs, ...fit } }));
  const expectedA = structuredClone(state.equipped.legs);
  state = equipSavedItem(state, "legs", "trousers-b");
  assert.equal(state.equipped.legs.scale, 1);
  state = changeEquipment(state, current => ({ ...current, legs: { ...current.legs, scale: 1.25, y: 19 } }));
  const expectedB = structuredClone(state.equipped.legs);
  state = equipSavedItem(state, "legs", "trousers-a");
  assert.deepEqual(state.equipped.legs, expectedA);
  state = equipSavedItem(state, "legs", "trousers-b");
  assert.deepEqual(state.equipped.legs, expectedB);
});

test("re-equipping an already worn item does not reset it; latest edits are remembered", () => {
  let state = equipSavedItem(emptyWardrobe(), "torso", "shirt");
  state = changeEquipment(state, current => ({ ...current, torso: { ...current.torso, ...fit } }));
  assert.equal(equipSavedItem(state, "torso", "shirt"), state);
  const before = structuredClone(state);
  state = changeEquipment(state, current => ({ ...current, torso: { ...current.torso, scale: 0.9 } }));
  state = changeEquipment(state, current => ({ ...current, torso: undefined }));
  state = equipSavedItem(state, "torso", "shirt");
  assert.equal(state.equipped.torso.scale, 0.9);
  assert.equal(before.equipped.torso.scale, fit.scale);
});

test("the same drawing has independent fits in different slots; a new session starts fresh", () => {
  let state = equipSavedItem(emptyWardrobe(), "head", "drawing");
  state = changeEquipment(state, current => ({ ...current, head: { ...current.head, ...fit } }));
  state = equipSavedItem(state, "accessory", "drawing");
  state = changeEquipment(state, current => ({ ...current, accessory: { ...current.accessory, scale: 0.5 } }));
  state = changeEquipment(state, current => ({ ...current, head: undefined, accessory: undefined }));
  state = equipSavedItem(state, "head", "drawing");
  state = equipSavedItem(state, "accessory", "drawing");
  assert.equal(state.equipped.head.scale, fit.scale);
  assert.equal(state.equipped.accessory.scale, 0.5);
  const fresh = equipSavedItem(emptyWardrobe(), "head", "drawing");
  assert.equal(fresh.equipped.head.scale, 1);
});

test("a stored wardrobe is accepted only in the current shape", () => {
  let state = equipSavedItem(emptyWardrobe(), "torso", "shirt");
  state = changeEquipment(state, current => ({
    ...current,
    torso: { ...current.torso, warp: [{ id: "p", x: 10, y: 20, dx: 3, dy: -4, radius: 70 }] },
  }));
  assert.equal(isWardrobe(JSON.parse(JSON.stringify(state))), true);
  assert.equal(isWardrobe(emptyWardrobe()), true);
  for (const broken of [
    null, [], { equipped: {} },
    { equipped: { hat: { drawingId: "a", scale: 1, rotation: 0, x: 0, y: 0 } }, saved: {} },
    { equipped: { torso: { drawingId: "a", scale: "1", rotation: 0, x: 0, y: 0 } }, saved: {} },
    // Warp points from before they carried a radius.
    { equipped: { torso: { drawingId: "a", scale: 1, rotation: 0, x: 0, y: 0, warp: [{ id: "p", x: 0.1, y: 0.2, dx: 0, dy: 0 }] } }, saved: {} },
  ]) assert.equal(isWardrobe(broken), false, JSON.stringify(broken));
});

test("item edits and warp points go through the wardrobe and are remembered per drawing", () => {
  let state = equipSavedItem(emptyWardrobe(), "torso", "shirt");
  state = updateItem(state, "torso", () => ({ x: 12, y: -4 }));
  state = addItemWarpPoint(state, "torso", { x: 50, y: 60 }, 80, "p1");
  state = moveItemWarpPoint(state, "torso", "p1", { x: 40, y: 55 });
  assert.deepEqual(state.equipped.torso.warp, [{ id: "p1", x: 50, y: 60, dx: -10, dy: -5, radius: 80 }]);
  assert.equal(state.equipped.torso.x, 12);

  // A crowded point and an empty slot leave the state untouched.
  assert.equal(addItemWarpPoint(state, "torso", { x: 41, y: 55 }, 80, "p2"), state);
  assert.equal(updateItem(state, "legs", () => ({ x: 1 })), state);

  state = unequip(state, "torso");
  assert.equal(state.equipped.torso, undefined);
  state = equipSavedItem(state, "torso", "shirt");
  assert.equal(state.equipped.torso.warp.length, 1, "the fit, warp included, comes back on re-equip");

  state = removeItemWarpPoint(state, "torso", "p1");
  assert.deepEqual(state.equipped.torso.warp, []);
});
