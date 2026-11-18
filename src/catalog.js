/** FEM 4-groove plates this version can lay out. The room opens on the first record. */

export const DEFAULT_PLATE_ID = 'fem-40x100-10';

/** Homeowner placement and grouping rules. They sit beside the catalog. */
export const RULES = {
  beamSpacing: 400,
  drawnWidth: 390,
  rowGap: 30,
  wallClearance: 100,
  registerCap: 6,
  supplyRegisters: { 16: 3, 20: 4 },
  wallThickness: 150,
  doorWidth: 900,
  windowWidth: 1200,
};

const GROOVED = {
  family: 'hornyolt lemez',
  nominalWidth: 400,
  drawnWidth: RULES.drawnWidth,
  gridSpacing: RULES.beamSpacing,
  pipePath: 'press-in',
  pipeLength: null,
  grooveCount: 4,
  material: 'horganyzott acél',
  seriesMax: null,
};

export const PLATES = [
  {
    ...GROOVED,
    id: 'fem-40x100-10',
    name: '40×100',
    pipeDiameter: 10,
    length: 1000,
    nominalArea: 0.4,
  },
  {
    ...GROOVED,
    id: 'fem-40x50-10',
    name: '40×50',
    pipeDiameter: 10,
    length: 500,
    nominalArea: 0.2,
  },
  {
    ...GROOVED,
    id: 'fem-40x100-16',
    name: '40×100',
    pipeDiameter: 16,
    length: 1000,
    nominalArea: 0.4,
  },
];

export function plateById(id) {
  return PLATES.find((plate) => plate.id === id) ?? null;
}

export const WALLS = ['north', 'east', 'south', 'west'];

export const WALL_LABELS = {
  north: 'északi fal',
  east: 'keleti fal',
  south: 'déli fal',
  west: 'nyugati fal',
};

/** The example used to check the drawing. Length runs east–west, width north–south. */
export const EXAMPLE_ROOM = {
  length: 6000,
  width: 3600,
  plateId: DEFAULT_PLATE_ID,
  rotation: 0,
  supply: null,
  markerWall: 'auto',
};
