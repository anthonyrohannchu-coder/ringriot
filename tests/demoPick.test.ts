import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { pranks } from "../src/lib/pranks";
import { pickStartPrank } from "../src/lib/demoPick";

const paid = pranks.find((p) => p.tier !== "free")!;
const free = pranks.find((p) => p.tier === "free")!;

test("free visitor deep-linked to a Plus/Pro prank lands on a free one", () => {
  const got = pickStartPrank(pranks, "demo", paid.characterId, paid.scenarioId);
  assert.equal(got.tier, "free");
});

test("free visitor deep-linked to a free prank gets exactly that prank", () => {
  const got = pickStartPrank(pranks, "demo", free.characterId, free.scenarioId);
  assert.equal(got.slug, free.slug);
});

test("paying visitor deep-linked to a paid prank gets it", () => {
  const got = pickStartPrank(pranks, "paid", paid.characterId, paid.scenarioId);
  assert.equal(got.slug, paid.slug);
});

test("no link: free visitor starts on a free prank", () => {
  assert.equal(pickStartPrank(pranks, "demo").tier, "free");
});
