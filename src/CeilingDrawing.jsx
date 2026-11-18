import { RULES, WALL_LABELS } from './catalog.js';
import { formatMm } from './layout.js';

const REGISTER_COLORS = [
  '#d06a32',
  '#2c6f97',
  '#2f7d4f',
  '#8a5a00',
  '#6d4c9f',
  '#a33b4a',
  '#1f7a78',
  '#4d5d75',
];

const PAPER = '#f4f1ea';
const INK = '#1c2430';

function registerColor(id) {
  return REGISTER_COLORS[(id - 1) % REGISTER_COLORS.length];
}

function membershipMap(plan) {
  const map = new Map();
  if (!plan.activePacking) return map;
  for (const circuit of plan.activePacking.circuits) {
    for (const member of circuit.members) {
      map.set(member.registerId, { ...member, circuitId: circuit.id });
    }
  }
  return map;
}

function doorGeometry(opening, length, width) {
  const leaf = opening.width;
  // The leaf swings out into the margin so it does not cover the ceiling panels.
  if (opening.wall === 'north') {
    return { hx: opening.offset, hy: 0, cx: opening.offset + leaf, cy: 0, ox: opening.offset, oy: -leaf, sweep: 0 };
  }
  if (opening.wall === 'south') {
    return { hx: opening.offset, hy: width, cx: opening.offset + leaf, cy: width, ox: opening.offset, oy: width + leaf, sweep: 1 };
  }
  if (opening.wall === 'west') {
    return { hx: 0, hy: opening.offset, cx: 0, cy: opening.offset + leaf, ox: -leaf, oy: opening.offset, sweep: 1 };
  }
  return { hx: length, hy: opening.offset, cx: length, cy: opening.offset + leaf, ox: length + leaf, oy: opening.offset, sweep: 0 };
}

function openingCut(opening, length, width, thickness) {
  if (opening.wall === 'north') return { x: opening.offset, y: -thickness, w: opening.width, h: thickness };
  if (opening.wall === 'south') return { x: opening.offset, y: width, w: opening.width, h: thickness };
  if (opening.wall === 'west') return { x: -thickness, y: opening.offset, w: thickness, h: opening.width };
  return { x: length, y: opening.offset, w: thickness, h: opening.width };
}

function windowLines(opening, length, width, thickness) {
  const cut = openingCut(opening, length, width, thickness);
  const lines = [];
  if (opening.wall === 'north' || opening.wall === 'south') {
    for (const fraction of [0.35, 0.65]) {
      const y = cut.y + cut.h * fraction;
      lines.push({ x1: cut.x, y1: y, x2: cut.x + cut.w, y2: y });
    }
  } else {
    for (const fraction of [0.35, 0.65]) {
      const x = cut.x + cut.w * fraction;
      lines.push({ x1: x, y1: cut.y, x2: x, y2: cut.y + cut.h });
    }
  }
  return lines;
}

export function CeilingDrawing({ plan, openings = [], labelled = true }) {
  if (!plan?.ok) return null;
  const { length, width, plate } = plan;
  const thickness = RULES.wallThickness;
  const font = Math.max(26, Math.min(length, width) / 26);
  const doorReach = openings.reduce((max, opening) => (
    opening.kind === 'door' ? Math.max(max, opening.width) : max
  ), 0);
  const pad = Math.max(thickness + font * 2.4, doorReach + thickness + font);
  const members = membershipMap(plan);
  const viewBox = `${-pad} ${-pad} ${length + pad * 2} ${width + pad * 2}`;

  return (
    <svg
      className="ceiling"
      viewBox={viewBox}
      role="img"
      aria-label={`Mennyezet, ${formatMm(length)} mm × ${formatMm(width)} mm, ${plan.counts.panels} panel`}
    >
      <rect x={-pad} y={-pad} width={length + pad * 2} height={width + pad * 2} fill={PAPER} />
      <rect x={-thickness} y={-thickness} width={length + thickness * 2} height={thickness} fill="#2c333a" />
      <rect x={-thickness} y={width} width={length + thickness * 2} height={thickness} fill="#2c333a" />
      <rect x={-thickness} y={0} width={thickness} height={width} fill="#2c333a" />
      <rect x={length} y={0} width={thickness} height={width} fill="#2c333a" />
      <rect x={0} y={0} width={length} height={width} fill="#fbfaf6" />
      {length > 200 && width > 200 && (
        <rect
          x={RULES.wallClearance}
          y={RULES.wallClearance}
          width={length - RULES.wallClearance * 2}
          height={width - RULES.wallClearance * 2}
          fill="none"
          stroke="#b7ad9e"
          strokeWidth={Math.max(4, font * 0.06)}
          strokeDasharray={`${font * 0.7} ${font * 0.45}`}
        />
      )}
      {plan.beams.map((beam, index) => (
        <line
          key={`beam-${index}`}
          x1={beam.x1}
          y1={beam.y1}
          x2={beam.x2}
          y2={beam.y2}
          stroke="#c4b8a4"
          strokeWidth={Math.max(6, font * 0.12)}
        />
      ))}
      {plan.panels.map((panel) => {
        const color = registerColor(panel.registerId);
        const member = members.get(panel.registerId);
        return (
          <g key={panel.id}>
            <rect
              x={panel.x}
              y={panel.y}
              width={panel.w}
              height={panel.h}
              fill="#e7edf1"
              stroke={color}
              strokeWidth={Math.max(8, font * 0.14)}
            />
            {panel.grooves.map((groove, index) => (
              <line
                key={`${panel.id}-g-${index}`}
                x1={groove.x1}
                y1={groove.y1}
                x2={groove.x2}
                y2={groove.y2}
                stroke="#b7c3cb"
                strokeWidth={Math.max(4, font * 0.08)}
              />
            ))}
            <polyline
              points={panel.pipe.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={Math.max(7, font * 0.12)}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <rect
              x={panel.x + panel.w / 2 - font * 0.95}
              y={panel.y + panel.h / 2 - font * 0.55}
              width={font * 1.9}
              height={member ? font * 1.15 : font * 0.78}
              fill="rgba(251,250,246,0.9)"
              rx={font * 0.08}
            />
            <text
              x={panel.x + panel.w / 2}
              y={panel.y + panel.h / 2 + (member ? -font * 0.02 : font * 0.16)}
              textAnchor="middle"
              fontSize={font * 0.42}
              fontFamily="Segoe UI, sans-serif"
              fill={INK}
            >
              {`R${panel.registerId}`}
            </text>
            {member && (
              <text
                x={panel.x + panel.w / 2}
                y={panel.y + panel.h / 2 + font * 0.42}
                textAnchor="middle"
                fontSize={font * 0.28}
                fontFamily="Segoe UI, sans-serif"
                fill={color}
              >
                {`K${member.circuitId} E${member.supplyOrder} V${member.returnOrder}`}
              </text>
            )}
          </g>
        );
      })}
      {plan.connectors.map((connector, index) => (
        <line
          key={`join-${index}`}
          x1={connector.x1}
          y1={connector.y1}
          x2={connector.x2}
          y2={connector.y2}
          stroke={registerColor(connector.registerId)}
          strokeWidth={Math.max(7, font * 0.12)}
          strokeLinecap="round"
        />
      ))}
      {plan.markers.map((marker) => (
        <g key={marker.id}>
          <circle
            cx={marker.x}
            cy={marker.y}
            r={36}
            fill={marker.role === 'supply' ? '#d06a32' : '#2c6f97'}
            stroke={INK}
            strokeWidth={4}
          />
          <text
            x={marker.x}
            y={marker.y + 8}
            textAnchor="middle"
            fontSize={22}
            fontFamily="Segoe UI, sans-serif"
            fontWeight="700"
            fill="#fff"
          >
            {marker.label}
          </text>
          <title>
            {`Kör ${marker.circuitId}, ${marker.role === 'supply' ? 'előremenő' : 'visszatérő'}, ${WALL_LABELS[plan.markerWall]}`}
          </title>
        </g>
      ))}
      {openings.map((opening) => {
        const cut = openingCut(opening, length, width, thickness);
        return (
          <g key={opening.id}>
            <rect x={cut.x} y={cut.y} width={cut.w} height={cut.h} fill={PAPER} />
            {opening.kind === 'window' ? (
              windowLines(opening, length, width, thickness).map((line, index) => (
                <line
                  key={`${opening.id}-w-${index}`}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#2c6f97"
                  strokeWidth={Math.max(6, thickness * 0.08)}
                />
              ))
            ) : (
              <DoorGlyph opening={opening} length={length} width={width} />
            )}
          </g>
        );
      })}
      {labelled && (
        <g fill={INK} fontFamily="Segoe UI, sans-serif">
          <text x={length / 2} y={width + pad - font * 0.35} textAnchor="middle" fontSize={font * 0.72}>
            {`Hosszúság ${formatMm(length)} mm`}
          </text>
          <text
            x={-pad + font * 0.55}
            y={width / 2}
            textAnchor="middle"
            fontSize={font * 0.72}
            transform={`rotate(-90 ${-pad + font * 0.55} ${width / 2})`}
          >
            {`Szélesség ${formatMm(width)} mm`}
          </text>
          <text x={0} y={-pad + font * 0.85} fontSize={font * 0.62}>
            {`${plate.name} cm · ${plate.pipeDiameter} mm cső · 390 mm`}
          </text>
        </g>
      )}
    </svg>
  );
}

function DoorGlyph({ opening, length, width }) {
  const door = doorGeometry(opening, length, width);
  return (
    <g fill="none" stroke="#6e4b32" strokeWidth={Math.max(8, opening.width * 0.02)}>
      <path
        d={`M ${door.cx} ${door.cy} A ${opening.width} ${opening.width} 0 0 ${door.sweep} ${door.ox} ${door.oy}`}
        strokeDasharray="28 18"
      />
      <path d={`M ${door.hx} ${door.hy} L ${door.ox} ${door.oy}`} />
    </g>
  );
}

export function registerSwatch(id) {
  return registerColor(id);
}
