import { useMemo, useState } from 'react';
import { PLATES, RULES, WALL_LABELS, WALLS } from './catalog.js';
import { CeilingDrawing, registerSwatch } from './CeilingDrawing.jsx';
import {
  buildPlan,
  formatMm,
  openingFits,
  parseMm,
  returnSequence,
  supplySequence,
} from './layout.js';
import './styles.css';

let openingSerial = 1;

function packingLines(packing) {
  if (!packing?.circuits.length) return ['Nincs kör.'];
  return packing.circuits.map((circuit) => {
    const supply = supplySequence(circuit).map((member) => `R${member.registerId}`).join(' → ');
    const back = returnSequence(circuit).map((member) => `R${member.registerId}`).join(' → ');
    const first = supplySequence(circuit)[0];
    return `Kör ${circuit.id}: előremenő ${supply}. Visszatérő ${back}. Az előremenő először az R${first.registerId} első paneljét táplálja, és ez a regiszter tér vissza utoljára.`;
  });
}

function Sheet({ plan, openings }) {
  const packs = plan.supply ? [[plan.supply, plan.activePacking]] : [[16, plan.packings[16]], [20, plan.packings[20]]];
  return (
    <article className="sheet" id="nyomtatasi-lap">
      <header className="sheet-head">
        <p className="eyebrow">Mennyezetfűtés</p>
        <h2>Nyomtatási lap</h2>
        <p>
          {`Egy szoba, ${formatMm(plan.length)} mm × ${formatMm(plan.width)} mm. `}
          {`${plan.plate.name} cm lemez, ${plan.plate.pipeDiameter} mm cső a lemezben, rajzolt szélesség 390 mm. `}
          {`Gerendaköz 400 mm, hézag a sorban 30 mm, faltávolság legalább 100 mm.`}
        </p>
      </header>
      <div className="sheet-drawing">
        <CeilingDrawing plan={plan} openings={openings} />
      </div>
      <p className="sentence">{plan.sentence}</p>
      <section>
        <h3>Tichelmann-sorrend</h3>
        {packs.map(([size, packing]) => (
          <div key={size}>
            <h4>{`${size} mm előremenő, körönként ${packing.perCircuit} regiszter`}</h4>
            <ul>
              {packingLines(packing).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        ))}
        <p>
          {plan.markers.length
            ? `Az előremenő (E) és a visszatérő (V) jelölés a ${WALL_LABELS[plan.markerWall]} belső oldalán van, a 100 mm-es sávban. A rajz a jelölésnél megáll.`
            : 'A jelölés akkor kerül a falra, ha az előremenő mérete ki van választva. Addig mindkét körszám látszik.'}
        </p>
      </section>
      <section>
        <h3>Regiszterek</h3>
        <ul className="register-list">
          {plan.registers.map((register) => (
            <li key={register.id}>
              <span className="swatch" style={{ background: registerSwatch(register.id) }} />
              {`R${register.id}: ${register.panels.length} panel. Csőhossz a regiszter mellett: nincs adat.`}
            </li>
          ))}
        </ul>
        <p>A csatlakozó csak a regiszteren belül van megrajzolva. A hossza nincs adat.</p>
      </section>
      <section>
        <h3>Ajtók és ablakok</h3>
        {openings.length === 0 ? <p>Ezen a lapon nincs ajtó vagy ablak.</p> : (
          <ul>
            {openings.map((opening) => (
              <li key={opening.id}>
                {`${WALL_LABELS[opening.wall]}, ${opening.kind === 'door' ? 'ajtó' : 'ablak'}, ${formatMm(opening.width)} mm, ${formatMm(opening.offset)} mm-re a fal kezdetétől.`}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3>Adatok és forrásuk</h3>
        <table>
          <thead>
            <tr>
              <th>Adat</th>
              <th>Érték</th>
              <th>Forrás</th>
            </tr>
          </thead>
          <tbody>
            {plan.figures.map((figure) => (
              <tr key={figure.id} className={figure.open ? 'is-open' : ''}>
                <td>{figure.label}</td>
                <td>{figure.value}</td>
                <td>{figure.open ? `rendelés előtt erősítse meg — ${figure.source}` : figure.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </article>
  );
}

export default function App() {
  const [lengthText, setLengthText] = useState('6000');
  const [widthText, setWidthText] = useState('3600');
  const [plateId, setPlateId] = useState('fem-40x100-10');
  const [rotation, setRotation] = useState(0);
  const [supply, setSupply] = useState('');
  const [markerWall, setMarkerWall] = useState('auto');
  const [openings, setOpenings] = useState([]);
  const [draft, setDraft] = useState({ wall: 'south', offset: '400', width: '900' });
  const [openingMessage, setOpeningMessage] = useState('');
  const [zoom, setZoom] = useState(1);

  const length = parseMm(lengthText);
  const width = parseMm(widthText);
  const plan = useMemo(() => {
    if (!length || !width) return null;
    return buildPlan({
      length,
      width,
      plateId,
      rotation,
      supply: supply === '16' ? 16 : supply === '20' ? 20 : null,
      markerWall,
    });
  }, [length, width, plateId, rotation, supply, markerWall]);

  const drawableOpenings = plan?.ok
    ? openings.filter((opening) => openingFits(openings, opening, plan.length, plan.width) === '')
    : [];

  function addOpening(kind) {
    if (!plan?.ok) {
      setOpeningMessage('Előbb érvényes hosszúság és szélesség kell.');
      return;
    }
    const candidate = {
      id: `opening-${openingSerial}`,
      wall: draft.wall,
      kind,
      offset: parseMm(draft.offset) ?? -1,
      width: parseMm(draft.width) ?? (kind === 'door' ? RULES.doorWidth : RULES.windowWidth),
    };
    const reason = openingFits(openings, candidate, plan.length, plan.width);
    if (reason) {
      setOpeningMessage(reason);
      return;
    }
    openingSerial += 1;
    setOpenings((items) => [...items, candidate]);
    setOpeningMessage(kind === 'door' ? 'Ajtó a falon.' : 'Ablak a falon.');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <strong>Mennyezetfűtés</strong>
            <small>Egy szoba</small>
          </div>
        </div>
        <button type="button" onClick={() => window.print()}>Nyomtatási lap</button>
      </header>

      <aside className="editor">
        <section>
          <h2>Szoba mérete</h2>
          <label>
            Hosszúság
            <span className="unit">
              <input
                id="length-mm"
                inputMode="decimal"
                value={lengthText}
                onChange={(event) => setLengthText(event.target.value)}
                aria-label="Hosszúság milliméterben"
              />
              mm
            </span>
          </label>
          <label>
            Szélesség
            <span className="unit">
              <input
                id="width-mm"
                inputMode="decimal"
                value={widthText}
                onChange={(event) => setWidthText(event.target.value)}
                aria-label="Szélesség milliméterben"
              />
              mm
            </span>
          </label>
        </section>

        <section>
          <h2>Lemez és rács</h2>
          <label>
            Lemez
            <select id="plate" value={plateId} onChange={(event) => setPlateId(event.target.value)} aria-label="Lemez">
              {PLATES.map((plate) => (
                <option key={plate.id} value={plate.id}>
                  {`${plate.name} cm, ${plate.pipeDiameter} mm cső${plate.id === 'fem-40x100-10' ? ' (ezzel nyílik)' : ''}`}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setRotation((value) => (value + 90) % 360)}>
            {`Rács forgatása 90° (most ${rotation}°)`}
          </button>
          <p className="note">A szoba a 40×100 cm-es, 10 mm-es lemezzel nyílik. A panel 390 mm széles. A sorban 30 mm a hézag, a gerenda 400 mm-enként áll, és a szélső panel legalább 100 mm-re marad a faltól.</p>
        </section>

        <section>
          <h2>Kör</h2>
          <label>
            Előremenő
            <select id="supply" value={supply} onChange={(event) => setSupply(event.target.value)} aria-label="Előremenő mérete">
              <option value="">Nincs választva</option>
              <option value="16">16 mm, körönként 3 regiszter</option>
              <option value="20">20 mm, körönként 4 regiszter</option>
            </select>
          </label>
          <label>
            Csonkok fala
            <select id="marker-wall" value={markerWall} onChange={(event) => setMarkerWall(event.target.value)} aria-label="A csonkok fala">
              <option value="auto">Automatikus, az első panelhez legközelebb</option>
              {WALLS.map((wall) => <option key={wall} value={wall}>{WALL_LABELS[wall]}</option>)}
            </select>
          </label>
        </section>

        <section>
          <h2>Ajtó és ablak</h2>
          <label>
            Fal
            <select value={draft.wall} onChange={(event) => setDraft({ ...draft, wall: event.target.value })} aria-label="A nyílás fala">
              {WALLS.map((wall) => <option key={wall} value={wall}>{WALL_LABELS[wall]}</option>)}
            </select>
          </label>
          <label>
            Távolság a fal kezdetétől
            <span className="unit">
              <input
                inputMode="decimal"
                value={draft.offset}
                onChange={(event) => setDraft({ ...draft, offset: event.target.value })}
                aria-label="Távolság a fal kezdetétől milliméterben"
              />
              mm
            </span>
          </label>
          <label>
            Nyílás szélessége
            <span className="unit">
              <input
                inputMode="decimal"
                value={draft.width}
                onChange={(event) => setDraft({ ...draft, width: event.target.value })}
                aria-label="Nyílás szélessége milliméterben"
              />
              mm
            </span>
          </label>
          <p className="note">Az északi és a déli fal nyugaton kezdődik, a keleti és a nyugati fal északon. Az ajtó befelé nyílik.</p>
          <div className="row">
            <button type="button" onClick={() => addOpening('door')}>Ajtó</button>
            <button type="button" onClick={() => addOpening('window')}>Ablak</button>
          </div>
          {openingMessage && <p className="note">{openingMessage}</p>}
          <ul className="opening-list">
            {openings.map((opening) => {
              const reason = plan?.ok ? openingFits(openings, opening, plan.length, plan.width) : '';
              return (
                <li key={opening.id}>
                  <span>
                    {`${opening.kind === 'door' ? 'Ajtó' : 'Ablak'}, ${WALL_LABELS[opening.wall]}, ${formatMm(opening.width)} mm`}
                    {reason ? ` — ${reason}` : ''}
                  </span>
                  <button type="button" onClick={() => setOpenings((items) => items.filter((item) => item.id !== opening.id))}>
                    Törlés
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </aside>

      <main className="stage">
        {!plan && <p className="sentence" id="plan-sentence">A hosszúság és a szélesség milliméterben, nullánál nagyobb szám.</p>}
        {plan && !plan.ok && <p className="sentence" id="plan-sentence">{plan.message}</p>}
        {plan?.ok && (
          <>
            <div
              className="counts"
              id="plan-counts"
              data-panels={plan.counts.panels}
              data-registers={plan.counts.registers}
              data-circuits-16={plan.counts.circuits16}
              data-circuits-20={plan.counts.circuits20}
              data-markers={plan.markers.length}
              data-wall={plan.markerWall}
            >
              <span>{`${plan.counts.panels} panel`}</span>
              <span>{`${plan.counts.registers} regiszter`}</span>
              <span>{`16 mm: ${plan.counts.circuits16} kör`}</span>
              <span>{`20 mm: ${plan.counts.circuits20} kör`}</span>
              <span>{`Lefedés ${new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 }).format(plan.coverage * 100)}%`}</span>
            </div>
            <p className="sentence" id="plan-sentence">{plan.sentence}</p>
            <div className="zoom-row">
              <button type="button" onClick={() => setZoom((value) => Math.max(1, Math.round((value - 0.5) * 10) / 10))}>Kisebb</button>
              <button type="button" onClick={() => setZoom((value) => Math.min(4, Math.round((value + 0.5) * 10) / 10))}>Nagyobb</button>
              <span>{`${Math.round(zoom * 100)}%`}</span>
            </div>
            <div className="viewport">
              <div className="viewport-inner" style={{ width: `${zoom * 100}%` }}>
                <CeilingDrawing plan={plan} openings={drawableOpenings} />
              </div>
            </div>
            <Sheet plan={plan} openings={drawableOpenings} />
          </>
        )}
      </main>
    </div>
  );
}
