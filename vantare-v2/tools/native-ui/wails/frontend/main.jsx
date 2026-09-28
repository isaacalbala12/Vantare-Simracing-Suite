import React, {useEffect, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';

const mode = new URLSearchParams(location.search).get('mode') || 'control';
document.documentElement.classList.toggle('overlay', mode === 'overlay');

function fieldText(field, suffix = '') {
  if (!field || field.v === undefined || field.q === 'missing' || field.q === 'invalid') return '—';
  return String(field.v) + suffix;
}

function numberText(field, suffix = '') {
  if (!field || (field.q !== 'fresh' && field.q !== 'stale')) return '—';
  return String(field.v === undefined ? 0 : field.v) + suffix;
}

function Standings({rows, playerId, compact = false}) {
  return <section className={'standings ' + (compact ? 'compact' : '')}>
    <h2>STANDINGS · {rows.length} coches</h2>
    <div className="rows">
      {rows.map((row, index) => <div className={'standing-row ' + (row.id === playerId ? 'player' : '')} key={row.id || index}>
        <strong>{row.position}</strong><span>{row.driver || row.id}</span><small>{row.classId || '—'}</small><small>{row.laps}</small>
      </div>)}
    </div>
  </section>;
}

function Editor({rows, relative}) {
  const [title, setTitle] = useState('STANDINGS');
  const [count, setCount] = useState(8);
  const [opacity, setOpacity] = useState(90);
  const [accent, setAccent] = useState('Turquesa');
  const [showRelative, setShowRelative] = useState(true);
  const color = accent === 'Ámbar' ? '#efb955' : accent === 'Blanco' ? '#e8f0f4' : '#5fe1ee';
  const reset = () => { setTitle('STANDINGS'); setCount(8); setOpacity(90); setAccent('Turquesa'); setShowRelative(true); };
  return <aside className="editor">
    <h2>EDITOR · BORRADOR LOCAL</h2>
    <label>Título del overlay<input value={title} maxLength={32} onChange={event => setTitle(event.target.value)}/></label>
    <label>Filas visibles: {count}<input type="range" min="4" max="10" value={count} onChange={event => setCount(Number(event.target.value))}/></label>
    <label>Opacidad: {opacity}%<input type="range" min="40" max="100" step="5" value={opacity} onChange={event => setOpacity(Number(event.target.value))}/></label>
    <label>Color de acento<select value={accent} onChange={event => setAccent(event.target.value)}>
      <option>Turquesa</option><option>Ámbar</option><option>Blanco</option>
    </select></label>
    <label className="toggle"><input type="checkbox" checked={showRelative} onChange={event => setShowRelative(event.target.checked)}/> Mostrar Relative</label>
    <h3>VISTA PREVIA</h3>
    <div className="preview"><div style={{opacity: opacity / 100}}>
      <b style={{color}}>{title}</b>
      {rows.slice(0, count).map((row, index) => <div className="preview-row" key={row.id || index}>{row.position}　{row.driver || row.id}</div>)}
      {showRelative && <b style={{color}}>RELATIVE · {relative.length} coches</b>}
    </div></div>
    <button onClick={reset}>Restablecer borrador</button>
  </aside>;
}

function App() {
  const [update, setUpdate] = useState(null);
  const [status, setStatus] = useState('connecting');
  const reported = useRef(new Set());
  useEffect(() => {
    const stream = new EventSource('/telemetry/overlay-v2/projection');
    stream.addEventListener('telemetry:overlay-v2:snapshot', event => {
      try {
        const received = JSON.parse(event.data);
        if (received.frame?.contract !== 2) { setStatus('invalid Go snapshot'); return; }
        setUpdate(received);
        setStatus(received.source?.state || 'live');
      } catch { setStatus('invalid Go snapshot'); }
    });
    stream.onerror = () => setStatus('reconnecting');
    return () => stream.close();
  }, []);
  const frame = update?.frame || {};
  const rows = frame.standings || [];
  const relative = frame.relative || [];
  const player = frame.player || {};
  const session = frame.session || {};
  useEffect(() => {
    if (!update || !new URLSearchParams(location.search).has('expectRows') ||
        !Number.isInteger(update.revision) || reported.current.has(update.revision)) return;
    reported.current.add(update.revision);
    requestAnimationFrame(() => fetch('/native-trial/ready', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({rows: rows.length}),
    }));
  }, [update, rows.length]);
  if (mode === 'overlay') return <div className="overlay-shell">
    <header><b>VANTARE</b><span>{fieldText(session.track)}</span></header>
    <Standings rows={rows.slice(0, 10)} playerId={player.id} compact/>
  </div>;
  return <main className={'app ' + (mode === 'editor' ? 'editing' : '')}>
    <header className="top"><b>VANTARE</b><span>Native Go trial</span><em>{status.toUpperCase()}</em></header>
    <div className="cards">
      <div><small>CIRCUITO</small><strong>{fieldText(session.track)}</strong></div>
      <div><small>PILOTO · VELOCIDAD</small><strong>{numberText(player.speed, ' m/s')}</strong></div>
      <div><small>MOTOR · MARCHA</small><strong>{numberText(player.rpm, ' rpm')} · {numberText(player.gear)}</strong></div>
    </div>
    <div className="panels">
      <Standings rows={rows} playerId={player.id}/>
      <section className="relative"><h2>RELATIVE</h2><div className="relative-rows">
        {relative.map((row, index) => <div key={row.id || index}>{row.position}　{row.name || row.id}</div>)}
      </div><footer>Sesión: {frame.sessionId || ''}</footer></section>
      {mode === 'editor' && <Editor rows={rows} relative={relative}/>}
    </div>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
