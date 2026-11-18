import {
  EXAMPLE_ROOM,
  RULES,
  WALL_LABELS,
  plateById,
} from './catalog.js';

const GROOVE_CENTERS = [45, 145, 245, 345];
const MAX_ROOM_MM = 30000;

export function parseMm(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  if (!Number.isFinite(number) || number <= 0) return null;
  return number;
}

export function fitCount(roomSpan, panelSpan, pitch, clearance) {
  const available = roomSpan - 2 * clearance;
  if (!(available >= panelSpan) || pitch <= 0) return 0;
  return Math.floor((available - panelSpan) / pitch + 1e-9) + 1;
}

export function facingEdge(from, to) {
  if (to.alongIndex === from.alongIndex + 1 && to.acrossIndex === from.acrossIndex) return 'along-end';
  if (to.alongIndex === from.alongIndex - 1 && to.acrossIndex === from.acrossIndex) return 'along-start';
  if (to.acrossIndex === from.acrossIndex + 1 && to.alongIndex === from.alongIndex) return 'across-end';
  if (to.acrossIndex === from.acrossIndex - 1 && to.alongIndex === from.alongIndex) return 'across-start';
  return null;
}

export function oppositeEdge(edge) {
  switch (edge) {
    case 'along-start': return 'along-end';
    case 'along-end': return 'along-start';
    case 'across-start': return 'across-end';
    case 'across-end': return 'across-start';
    default: return 'along-end';
  }
}

export function edgeAdjacent(a, b) {
  const along = Math.abs(a.alongIndex - b.alongIndex);
  const across = Math.abs(a.acrossIndex - b.acrossIndex);
  return (along === 1 && across === 0) || (along === 0 && across === 1);
}

function edgeCenter(edge, along, across) {
  switch (edge) {
    case 'along-start': return [across / 2, 0];
    case 'along-end': return [across / 2, along];
    case 'across-start': return [0, along / 2];
    case 'across-end': return [across, along / 2];
    default: return [across / 2, along / 2];
  }
}

/** One press-in path from the inlet edge to the outlet edge. */
export function pipeLocalPoints(inletEdge, outletEdge, along, across) {
  const inlet = edgeCenter(inletEdge, along, across);
  const outlet = edgeCenter(outletEdge, along, across);
  const oppositeAlong = (
    (inletEdge === 'along-start' && outletEdge === 'along-end')
    || (inletEdge === 'along-end' && outletEdge === 'along-start')
  );
  const oppositeAcross = (
    (inletEdge === 'across-start' && outletEdge === 'across-end')
    || (inletEdge === 'across-end' && outletEdge === 'across-start')
  );

  if (oppositeAlong) {
    const stations = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const acrossPoints = [across / 2, GROOVE_CENTERS[0], GROOVE_CENTERS[3], GROOVE_CENTERS[1], GROOVE_CENTERS[2], across / 2];
    return stations.map((t, index) => [
      acrossPoints[index],
      inlet[1] + (outlet[1] - inlet[1]) * t,
    ]);
  }

  if (oppositeAcross) {
    const stations = [0, 0.25, 0.5, 0.75, 1];
    const alongPoints = [along / 2, along * 0.22, along * 0.78, along * 0.36, along / 2];
    return stations.map((t, index) => [
      inlet[0] + (outlet[0] - inlet[0]) * t,
      alongPoints[index],
    ]);
  }

  return [inlet, [across / 2, along / 2], outlet];
}

function localToWorld(panel, u, v, rowIsHorizontal) {
  if (rowIsHorizontal) return { x: panel.x + v, y: panel.y + u };
  return { x: panel.x + u, y: panel.y + v };
}

function chainOrder(nAlong, nAcross, reverseStart) {
  const order = [];
  for (let acrossStep = 0; acrossStep < nAcross; acrossStep += 1) {
    const across = reverseStart ? nAcross - 1 - acrossStep : acrossStep;
    const reverseAlong = (acrossStep % 2 === 1) !== reverseStart;
    for (let alongStep = 0; alongStep < nAlong; alongStep += 1) {
      const along = reverseAlong ? nAlong - 1 - alongStep : alongStep;
      order.push({ along, across });
    }
  }
  return order;
}

function circuitCount(registerCount, perCircuit) {
  if (registerCount <= 0) return 0;
  return Math.ceil(registerCount / perCircuit);
}

function packCircuits(registers, supply) {
  const perCircuit = RULES.supplyRegisters[supply];
  const circuits = [];
  for (let start = 0; start < registers.length; start += perCircuit) {
    const group = registers.slice(start, start + perCircuit);
    circuits.push({
      id: circuits.length + 1,
      supply,
      perCircuit,
      members: group.map((register, index) => ({
        registerId: register.id,
        supplyOrder: index + 1,
        returnOrder: group.length - index,
      })),
    });
  }
  return { supply, perCircuit, circuits };
}

function nearestWall(panel, length, width) {
  if (!panel) return 'north';
  const cx = panel.x + panel.w / 2;
  const cy = panel.y + panel.h / 2;
  const ranked = [
    ['north', cy],
    ['south', width - cy],
    ['west', cx],
    ['east', length - cx],
  ].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
  return ranked[0][0];
}

function markerPoint(wall, distance, length, width) {
  const inset = RULES.wallClearance / 2;
  if (wall === 'north') return { x: distance, y: inset };
  if (wall === 'south') return { x: distance, y: width - inset };
  if (wall === 'west') return { x: inset, y: distance };
  return { x: length - inset, y: distance };
}

function placeMarkers(circuits, wall, length, width) {
  const span = wall === 'north' || wall === 'south' ? length : width;
  const slots = circuits.length * 2;
  if (!slots || span <= 0) return [];
  const margin = Math.min(220, Math.max(70, span * 0.08));
  const usable = Math.max(span - margin * 2, 0);
  const at = (index) => (
    slots === 1 ? span / 2 : margin + (usable * index) / (slots - 1)
  );
  return circuits.flatMap((circuit, index) => ([
    {
      id: `supply-${circuit.id}`,
      circuitId: circuit.id,
      role: 'supply',
      label: `E${circuit.id}`,
      ...markerPoint(wall, at(index * 2), length, width),
    },
    {
      id: `return-${circuit.id}`,
      circuitId: circuit.id,
      role: 'return',
      label: `V${circuit.id}`,
      ...markerPoint(wall, at(index * 2 + 1), length, width),
    },
  ]));
}

function percent(value) {
  return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(value * 100);
}

function sentenceFor(counts, coverage) {
  if (counts.panels === 0) {
    return 'Ebbe a méretbe egy egész panel sem fér. A szélső panel és a fal között legalább 100 mm marad, és a terv csak egész panelt rajzol. A darabszám a panelek elhelyezését mutatja. A szoba melegen tartását egy későbbi ellenőrzés vizsgálja.';
  }
  const covered = `A fűthető mennyezet ${percent(coverage)}%-a fedett.`;
  const fit = `Ezen a mennyezeten ${counts.panels} panel fér el. Egy regiszter legfeljebb ${RULES.registerCap} egymás melletti panelt fog össze, ezért a szoba ${counts.registers} regisztert használ. ${covered}`;
  const reason = 'A darabszám azt mutatja, hogyan férnek el a panelek és hogyan csoportosulnak. A szoba melegen tartását egy későbbi ellenőrzés vizsgálja.';
  return `${fit} ${reason}`;
}

function circuitText(counts, supply) {
  if (counts.panels === 0) return '';
  if (supply === 16 || supply === 20) return activeSentence(supply, counts);
  return `16 mm-es előremenőnél körönként 3 regiszter ajánlott, ezért ${counts.circuits16} kör kell. 20 mm-es előremenőnél körönként 4 regiszter ajánlott, ezért ${counts.circuits20} kör kell.`;
}

function activeSentence(supply, counts) {
  const circuits = supply === 16 ? counts.circuits16 : counts.circuits20;
  const per = RULES.supplyRegisters[supply];
  return `A választott ${supply} mm-es előremenőnél körönként ${per} regiszter ajánlott, ezért a szoba ${circuits} kört használ.`;
}

function figuresFor(input, plate, markerWall, markerWallChosen) {
  const plateValue = `${plate.name} cm, ${plate.pipeDiameter} mm cső, rajzolt szélesség ${plate.drawnWidth} mm`;
  return [
    { id: 'length', label: 'Hosszúság', value: `${formatMm(input.length)} mm`, source: 'a háztulajdonos döntése', open: false },
    { id: 'width', label: 'Szélesség', value: `${formatMm(input.width)} mm`, source: 'a háztulajdonos döntése', open: false },
    { id: 'plate', label: 'Lemez', value: plateValue, source: input.plateId === 'fem-40x100-10' ? 'a szoba ezzel a lemezzel nyílik' : 'a háztulajdonos döntése', open: false },
    { id: 'rotation', label: 'Rács iránya', value: `${input.rotation}°`, source: 'a háztulajdonos döntése', open: false },
    { id: 'beams', label: 'Gerendaköz', value: `${RULES.beamSpacing} mm`, source: 'a háztulajdonos szabálya', open: false },
    { id: 'gap', label: 'Hézag a sorban', value: `${RULES.rowGap} mm`, source: 'a háztulajdonos szabálya', open: false },
    { id: 'clearance', label: 'Faltávolság', value: `legalább ${RULES.wallClearance} mm`, source: 'a háztulajdonos szabálya', open: false },
    { id: 'cap', label: 'Regiszterkorlát', value: `${RULES.registerCap} panel`, source: 'a háztulajdonos döntése', open: false },
    { id: 'supply', label: 'Előremenő méret', value: input.supply ? `${input.supply} mm` : 'nincs választva', source: input.supply ? 'a háztulajdonos döntése' : 'a háztulajdonos még nem döntött', open: !input.supply },
    { id: 'wall', label: 'Csonkok fala', value: WALL_LABELS[markerWall], source: markerWallChosen ? 'a háztulajdonos döntése' : 'a fal az első panelhez legközelebb', open: false },
    { id: 'pipe-length', label: 'Csőhossz a lemezben', value: 'nincs adat', source: 'a forrás nem adja meg', open: true },
    { id: 'connector', label: 'Csatlakozó hossza', value: 'nincs adat', source: 'a forrás nem adja meg', open: true },
    { id: 'drop', label: 'Hőmérséklet-esés', value: 'nincs alkalmazva', source: 'nincs megerősített érték', open: true },
    { id: 'flow', label: 'Köri térfogatáram', value: 'nincs alkalmazva', source: 'nincs megerősített érték', open: true },
    { id: 'band', label: 'Fél–dupla kiegyenlítés', value: 'nincs alkalmazva', source: 'nincs megerősített érték', open: true },
  ];
}

export function formatMm(value) {
  return new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(value);
}

function invalid(message, input) {
  return {
    ok: false,
    message,
    input,
    panels: [],
    registers: [],
    beams: [],
    connectors: [],
    markers: [],
    chain: [],
    counts: { panels: 0, registers: 0, circuits16: 0, circuits20: 0 },
    coverage: 0,
    sentence: message,
    activeSentence: '',
    packings: { 16: packCircuits([], 16), 20: packCircuits([], 20) },
    activePacking: null,
    figures: [],
    plate: null,
  };
}

export function wallSpan(wall, length, width) {
  return wall === 'north' || wall === 'south' ? length : width;
}

export function openingFits(openings, candidate, length, width) {
  const span = wallSpan(candidate.wall, length, width);
  if (!candidate.wall || !(candidate.width >= 200) || !(candidate.offset >= 0)) {
    return 'Az ajtó vagy az ablak nem fér a falra.';
  }
  if (candidate.offset + candidate.width > span + 1e-6) {
    return 'Az ajtó vagy az ablak lelóg a falról.';
  }
  const hit = openings.some((opening) => (
    opening.id !== candidate.id
    && opening.wall === candidate.wall
    && candidate.offset < opening.offset + opening.width - 1
    && candidate.offset + candidate.width > opening.offset + 1
  ));
  if (hit) return 'A nyílás takar egy másikat ezen a falon.';
  return '';
}

/**
 * Lay out one flat rectangular room.
 * Length is east–west, width is north–south, both in millimetres.
 * Rotation 0 and 180 run each row along the length. 90 and 270 run each row along the width.
 */
export function buildPlan(input) {
  const length = Number(input.length);
  const width = Number(input.width);
  const rotation = [0, 90, 180, 270].includes(Number(input.rotation)) ? Number(input.rotation) : 0;
  const supply = input.supply === 16 || input.supply === 20 ? input.supply : null;
  const plate = plateById(input.plateId);
  const request = { ...input, length, width, rotation, supply, plateId: plate?.id };

  if (!plate) return invalid('A lemez nem szerepel a katalógusban.', request);
  if (!(length > 0) || !(width > 0)) {
    return invalid('A hosszúság és a szélesség milliméterben, nullánál nagyobb szám.', request);
  }
  if (length > MAX_ROOM_MM || width > MAX_ROOM_MM) {
    return invalid('A méret legfeljebb 30 000 mm lehet ezen a lapon.', request);
  }

  const rowIsHorizontal = rotation === 0 || rotation === 180;
  const reverseStart = rotation === 180 || rotation === 270;
  const roomAlong = rowIsHorizontal ? length : width;
  const roomAcross = rowIsHorizontal ? width : length;
  const rowPitch = plate.length + RULES.rowGap;
  const nAlong = fitCount(roomAlong, plate.length, rowPitch, RULES.wallClearance);
  const nAcross = fitCount(roomAcross, RULES.drawnWidth, RULES.beamSpacing, RULES.wallClearance);

  const spanAlong = nAlong === 0 ? 0 : (nAlong - 1) * rowPitch + plate.length;
  const spanAcross = nAcross === 0 ? 0 : (nAcross - 1) * RULES.beamSpacing + RULES.drawnWidth;
  const originAlong = (roomAlong - spanAlong) / 2;
  const originAcross = (roomAcross - spanAcross) / 2;
  const beamInset = (RULES.beamSpacing - RULES.drawnWidth) / 2;

  const byKey = new Map();
  const panels = [];
  for (let acrossIndex = 0; acrossIndex < nAcross; acrossIndex += 1) {
    for (let alongIndex = 0; alongIndex < nAlong; alongIndex += 1) {
      const along = originAlong + alongIndex * rowPitch;
      const across = originAcross + acrossIndex * RULES.beamSpacing;
      const panel = {
        id: `p-${alongIndex}-${acrossIndex}`,
        alongIndex,
        acrossIndex,
        x: rowIsHorizontal ? along : across,
        y: rowIsHorizontal ? across : along,
        w: rowIsHorizontal ? plate.length : RULES.drawnWidth,
        h: rowIsHorizontal ? RULES.drawnWidth : plate.length,
      };
      panels.push(panel);
      byKey.set(`${alongIndex}:${acrossIndex}`, panel);
    }
  }

  const chain = chainOrder(nAlong, nAcross, reverseStart)
    .map((slot) => byKey.get(`${slot.along}:${slot.across}`))
    .filter(Boolean);

  const registers = [];
  let current = [];
  const flush = () => {
    if (!current.length) return;
    registers.push({ id: registers.length + 1, panels: current });
    current = [];
  };
  for (const panel of chain) {
    const previous = current[current.length - 1];
    if (previous && (current.length >= RULES.registerCap || !edgeAdjacent(previous, panel))) flush();
    current.push(panel);
  }
  flush();

  const registerByPanel = new Map();
  for (const register of registers) {
    register.panels.forEach((panel, index) => {
      registerByPanel.set(panel.id, { register, index });
    });
  }

  for (const register of registers) {
    register.panels.forEach((panel, index) => {
      const previous = register.panels[index - 1] ?? null;
      const next = register.panels[index + 1] ?? null;
      let inletEdge;
      let outletEdge;
      if (!previous && !next) {
        inletEdge = 'along-start';
        outletEdge = 'along-end';
      } else if (!previous) {
        outletEdge = facingEdge(panel, next);
        inletEdge = oppositeEdge(outletEdge);
      } else if (!next) {
        inletEdge = facingEdge(panel, previous);
        outletEdge = oppositeEdge(inletEdge);
      } else {
        inletEdge = facingEdge(panel, previous);
        outletEdge = facingEdge(panel, next);
      }
      panel.registerId = register.id;
      panel.indexInRegister = index;
      panel.inletEdge = inletEdge;
      panel.outletEdge = outletEdge;
      panel.pipe = pipeLocalPoints(inletEdge, outletEdge, plate.length, RULES.drawnWidth)
        .map(([u, v]) => localToWorld(panel, u, v, rowIsHorizontal));
      panel.inlet = panel.pipe[0];
      panel.outlet = panel.pipe[panel.pipe.length - 1];
      panel.grooves = GROOVE_CENTERS.map((u) => {
        const start = localToWorld(panel, u, 0, rowIsHorizontal);
        const end = localToWorld(panel, u, plate.length, rowIsHorizontal);
        return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
      });
    });
    register.panelIds = register.panels.map((panel) => panel.id);
    register.pipeLength = null;
    register.connectors = register.panels.slice(1).map((panel, index) => {
      const previous = register.panels[index];
      return {
        registerId: register.id,
        x1: previous.outlet.x,
        y1: previous.outlet.y,
        x2: panel.inlet.x,
        y2: panel.inlet.y,
      };
    });
  }

  const connectors = registers.flatMap((register) => register.connectors);
  const beams = [];
  if (nAcross > 0 && nAlong > 0) {
    const alongStart = originAlong;
    const alongEnd = originAlong + spanAlong;
    for (let index = 0; index <= nAcross; index += 1) {
      const across = originAcross - beamInset + index * RULES.beamSpacing;
      const start = localToWorld({ x: 0, y: 0 }, across, alongStart, rowIsHorizontal);
      const end = localToWorld({ x: 0, y: 0 }, across, alongEnd, rowIsHorizontal);
      beams.push({ x1: start.x, y1: start.y, x2: end.x, y2: end.y });
    }
  }

  const counts = {
    panels: panels.length,
    registers: registers.length,
    circuits16: circuitCount(registers.length, RULES.supplyRegisters[16]),
    circuits20: circuitCount(registers.length, RULES.supplyRegisters[20]),
  };
  const roomArea = length * width;
  const coverage = roomArea > 0 ? (panels.length * RULES.drawnWidth * plate.length) / roomArea : 0;
  const packings = {
    16: packCircuits(registers, 16),
    20: packCircuits(registers, 20),
  };
  const activePacking = supply ? packings[supply] : null;
  const firstPanel = chain[0] ?? null;
  const markerWallChosen = input.markerWall && input.markerWall !== 'auto';
  const markerWall = markerWallChosen ? input.markerWall : nearestWall(firstPanel, length, width);
  const markers = activePacking ? placeMarkers(activePacking.circuits, markerWall, length, width) : [];
  const baseSentence = sentenceFor(counts, coverage);
  const chosen = circuitText(counts, supply);

  return {
    ok: true,
    message: '',
    input: request,
    plate,
    length,
    width,
    rotation,
    rowIsHorizontal,
    supply,
    panels,
    registers,
    chain: chain.map((panel) => panel.id),
    beams,
    connectors,
    counts,
    coverage,
    sentence: chosen ? `${baseSentence} ${chosen}` : baseSentence,
    baseSentence,
    activeSentence: chosen,
    packings,
    activePacking,
    markerWall,
    markerWallChosen,
    markers,
    figures: figuresFor(request, plate, markerWall, markerWallChosen),
    origins: { originAlong, originAcross, spanAlong, spanAcross, nAlong, nAcross, rowPitch },
  };
}

export function buildExample(overrides = {}) {
  return buildPlan({ ...EXAMPLE_ROOM, ...overrides });
}

export function returnSequence(circuit) {
  return [...circuit.members].sort((a, b) => a.returnOrder - b.returnOrder);
}

export function supplySequence(circuit) {
  return [...circuit.members].sort((a, b) => a.supplyOrder - b.supplyOrder);
}
