import { RULES } from '../src/catalog.js';
import {
  buildExample,
  buildPlan,
  edgeAdjacent,
  openingFits,
  returnSequence,
  supplySequence,
} from '../src/layout.js';

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
  }
}

function near(actual, expected, epsilon = 1e-6) {
  assert(Math.abs(actual - expected) <= epsilon, `expected ${expected}, got ${actual}`);
}

function panelGap(plan, a, b) {
  if (plan.rowIsHorizontal) {
    if (a.alongIndex !== b.alongIndex) return b.x - (a.x + a.w);
    return b.y - (a.y + a.h);
  }
  if (a.alongIndex !== b.alongIndex) return b.y - (a.y + a.h);
  return b.x - (a.x + a.w);
}

function clearance(plan, panel) {
  return {
    west: panel.x,
    east: plan.length - (panel.x + panel.w),
    north: panel.y,
    south: plan.width - (panel.y + panel.h),
  };
}

const example = buildExample();
assert(example.ok, 'example plan builds');
assert(example.plate.id === 'fem-40x100-10', 'room opens on 40×100 / 10 mm');
assert(example.plate.pipeDiameter === 10, 'in-panel pipe is 10 mm');
assert(example.plate.drawnWidth === 390, 'drawn width is 390');
near(example.counts.panels, 40);
near(example.counts.registers, 7);
near(example.counts.circuits16, 3);
near(example.counts.circuits20, 2);
assert(example.registers.map((register) => register.panels.length).join(',') === '6,6,6,6,6,6,4', 'register lengths');
near(example.coverage, 40 * 390 * 1000 / (6000 * 3600));
assert(example.markerWall === 'north', 'default wall is nearest the first panel');
assert(example.markers.length === 0, 'no markers until the supply size is chosen');
assert(example.sentence.includes('40 panel'), 'sentence names the panel count');
assert(example.sentence.includes('7 regisztert'), 'sentence names the register count');
assert(example.sentence.includes('3 kör kell'), 'sentence names the 16 mm circuit count');
assert(example.sentence.includes('2 kör kell'), 'sentence names the 20 mm circuit count');
assert(!example.sentence.includes('meleg marad'), 'sentence does not claim a warmth result');

const byId = new Map(example.panels.map((panel) => [panel.id, panel]));
const chain = example.chain.map((id) => byId.get(id));
assert(chain.length === 40, 'chain covers every panel');
assert(edgeAdjacent(chain[5], chain[6]), 'the panel after a full register is still beside it');
assert(chain[5].registerId !== chain[6].registerId, 'the next panel starts a new register');
assert(chain[5].registerId === 1 && chain[6].registerId === 2, 'the split falls on the cap of 6');

for (const register of example.registers) {
  assert(register.panels.length <= RULES.registerCap, `register ${register.id} stays within 6`);
  assert(register.pipeLength === null, 'pipe length stays blank');
  for (let index = 1; index < register.panels.length; index += 1) {
    assert(edgeAdjacent(register.panels[index - 1], register.panels[index]), `register ${register.id} is one chain`);
  }
}
assert(example.connectors.length === 40 - 7, 'connectors stay inside registers');

const origin = example.panels.find((panel) => panel.alongIndex === 0 && panel.acrossIndex === 0);
const nextAlong = example.panels.find((panel) => panel.alongIndex === 1 && panel.acrossIndex === 0);
const nextAcross = example.panels.find((panel) => panel.alongIndex === 0 && panel.acrossIndex === 1);
near(panelGap(example, origin, nextAlong), RULES.rowGap);
near(panelGap(example, origin, nextAcross), RULES.beamSpacing - RULES.drawnWidth);
near(example.beams[1].y1 - example.beams[0].y1, RULES.beamSpacing);
near(example.beams[1].y2 - example.beams[0].y2, RULES.beamSpacing);

for (const panel of example.panels) {
  const gap = clearance(example, panel);
  assert(gap.west >= RULES.wallClearance - 1e-6, 'west clearance');
  assert(gap.east >= RULES.wallClearance - 1e-6, 'east clearance');
  assert(gap.north >= RULES.wallClearance - 1e-6, 'north clearance');
  assert(gap.south >= RULES.wallClearance - 1e-6, 'south clearance');
  assert(panel.w === 1000 && panel.h === 390, 'whole 40×100 panel');
  assert(panel.pipe.length >= 2, 'panel has a pipe path');
}

const chosen = buildExample({ supply: 16 });
assert(chosen.markers.length === 6, '16 mm supply draws three pairs of markers');
assert(chosen.activePacking.circuits.length === 3, 'three circuits');
for (const marker of chosen.markers) {
  assert(marker.y > 0 && marker.y < RULES.wallClearance, `${marker.id} sits inside the north clearance`);
  assert(marker.x > 0 && marker.x < chosen.length, `${marker.id} sits on the wall`);
}
const firstCircuit = chosen.activePacking.circuits[0];
assert(supplySequence(firstCircuit).map((member) => member.registerId).join(',') === '1,2,3', 'supply order');
assert(returnSequence(firstCircuit).map((member) => member.registerId).join(',') === '3,2,1', 'Tichelmann return order');
assert(firstCircuit.members[0].returnOrder === 3, 'the first register fed by the supply is the last to return');
assert(chosen.sentence.includes('16 mm-es előremenőnél'), 'chosen supply is named');
assert(!chosen.sentence.includes('20 mm-es előremenőnél'), 'the other count waits until the size is open again');

const wide = buildExample({ supply: 20 });
assert(wide.counts.circuits20 === 2 && wide.markers.length === 4, '20 mm supply uses two circuits');

const turned = buildExample({ rotation: 90 });
near(turned.counts.panels, 42);
near(turned.counts.registers, 7);
near(turned.origins.nAlong, 3);
near(turned.origins.nAcross, 14);
assert(turned.rowIsHorizontal === false, '90° runs the row along the width');

const flipped = buildExample({ rotation: 180 });
const first = byId.get(example.chain[0]);
const flippedFirst = flipped.panels.find((panel) => panel.id === flipped.chain[0]);
assert(first.alongIndex === 0 && first.acrossIndex === 0, '0° starts at the first corner');
assert(flippedFirst.alongIndex === 4 && flippedFirst.acrossIndex === 7, '180° starts at the opposite corner');
assert(flipped.markerWall === 'south', '180° moves the default wall');
assert(flipped.counts.panels === 40 && flipped.counts.registers === 7, '180° keeps the same counts');

const shortPlate = buildPlan({
  length: 6000,
  width: 3600,
  plateId: 'fem-40x50-10',
  rotation: 0,
  supply: null,
  markerWall: 'auto',
});
near(shortPlate.counts.panels, 88);
near(shortPlate.counts.registers, 15);
assert(shortPlate.panels.every((panel) => panel.w === 500 && panel.h === 390), '40×50 panels stay whole');

const tight = buildPlan({
  length: 2230,
  width: 590,
  plateId: 'fem-40x100-10',
  rotation: 0,
  supply: null,
  markerWall: 'auto',
});
near(tight.counts.panels, 2);
const tightPanels = [...tight.panels].sort((a, b) => a.alongIndex - b.alongIndex);
near(Math.min(tightPanels[0].x, tightPanels[1].x), 100);
near(tight.length - Math.max(tightPanels[0].x + tightPanels[0].w, tightPanels[1].x + tightPanels[1].w), 100);

const empty = buildPlan({
  length: 1000,
  width: 2000,
  plateId: 'fem-40x100-10',
  rotation: 0,
  supply: null,
  markerWall: 'auto',
});
near(empty.counts.panels, 0);
near(empty.counts.registers, 0);
near(empty.counts.circuits16, 0);
assert(empty.sentence.includes('egész panel sem fér'), 'empty room is explained');

const one = buildPlan({
  length: 1200,
  width: 590,
  plateId: 'fem-40x100-10',
  rotation: 0,
  supply: null,
  markerWall: 'auto',
});
near(one.counts.panels, 1);
near(one.counts.registers, 1);
near(one.counts.circuits16, 1);
near(one.counts.circuits20, 1);

assert(openingFits([], { wall: 'south', offset: 400, width: 900 }, 6000, 3600) === '', 'a door fits the south wall');
assert(openingFits([], { wall: 'south', offset: 5400, width: 900 }, 6000, 3600) !== '', 'a door cannot hang off the wall');
const door = { id: 'd1', wall: 'south', offset: 400, width: 900 };
assert(openingFits([door], { id: 'd2', wall: 'south', offset: 800, width: 900 }, 6000, 3600) !== '', 'openings cannot overlap');

const huge = buildPlan({
  length: 40000,
  width: 40000,
  plateId: 'fem-40x100-10',
  rotation: 0,
  supply: null,
  markerWall: 'auto',
});
assert(!huge.ok, 'a room past 30 m is refused');

if (failed) {
  console.error(`${failed} check(s) failed`);
  process.exit(1);
}

console.log(JSON.stringify({
  length: example.length,
  width: example.width,
  plate: `${example.plate.name} / ${example.plate.pipeDiameter} mm`,
  panels: example.counts.panels,
  registers: example.counts.registers,
  circuits16: example.counts.circuits16,
  circuits20: example.counts.circuits20,
  coverage: example.coverage,
  wall: example.markerWall,
  registerLengths: example.registers.map((register) => register.panels.length),
}, null, 2));
