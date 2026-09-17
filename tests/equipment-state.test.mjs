import assert from "node:assert/strict";
import test from "node:test";
import { changeEquipment, emptyWardrobe, equipSavedItem } from "../app/equipment-state.ts";

const fit = {
  scale: 1.42, scaleX: 0.68, scaleY: 1.83, rotation: -23, x: 31.75, y: -12.5,
  warpPoints: [{ id: "left-leg", x: 0.25, y: 0.72, dx: 0.073, dy: -0.012 }, { id: "waist", x: 0.5, y: 0.2, dx: 0, dy: 0 }],
};

test("unequip and re-equip restores every transform and deformation coordinate exactly", () => {
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
  assert.equal(state.equipped.legs.scaleX, 1);
  assert.deepEqual(state.equipped.legs.warpPoints, []);
  state = changeEquipment(state, current => ({ ...current, legs: { ...current.legs, scaleX: 1.25, y: 19 } }));
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
  state = changeEquipment(state, current => ({ ...current, torso: { ...current.torso, scaleY: 0.9, warpPoints: [] } }));
  state = changeEquipment(state, current => ({ ...current, torso: undefined }));
  state = equipSavedItem(state, "torso", "shirt");
  assert.equal(state.equipped.torso.scaleY, 0.9);
  assert.deepEqual(state.equipped.torso.warpPoints, []);
  assert.equal(before.equipped.torso.scaleY, fit.scaleY);
  assert.deepEqual(before.equipped.torso.warpPoints, fit.warpPoints);
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
  assert.deepEqual(state.equipped.head.warpPoints, fit.warpPoints);
  assert.equal(state.equipped.accessory.scale, 0.5);
  assert.deepEqual(state.equipped.accessory.warpPoints, []);
  const fresh = equipSavedItem(emptyWardrobe(), "head", "drawing");
  assert.equal(fresh.equipped.head.scale, 1);
  assert.deepEqual(fresh.equipped.head.warpPoints, []);
});
