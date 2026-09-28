import React, {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import fixture from '../../shared/fixture.json';
import './style.css';

const params = new URLSearchParams(location.search);
const overlay = params.get('mode') === 'overlay';
document.documentElement.classList.toggle('overlay', overlay);

function Standings({showGap, tick}) {
  return <section className="standings" aria-label="Clasificación LMU">
    <header><b>VANTARE</b><span>STANDINGS</span><i style={{opacity: .35 + (tick % 10) / 20}} /></header>
    <div className={`table ${showGap ? '' : 'compact'}`}>
      <div className="row labels"><span>POS</span><span>PILOTO</span><span>CLASE</span>{showGap && <span>INTERVALO</span>}</div>
      {fixture.scene.rows.map(row => <div className={`row ${row.player ? 'player' : ''}`} key={row.position}>
        <strong>{row.position}</strong><span>{row.driver}</span><em>{row.vehicleClass.replace('_ELMS','')}</em>{showGap && <span>{row.gapSeconds.toFixed(3)}</span>}
      </div>)}
    </div>
  </section>;
}

function App() {
  const [showGap, setShowGap] = useState(params.get('showGap') !== '0');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let timer;
    const update = () => {
      clearInterval(timer);
      if (!document.hidden) timer = setInterval(() => setTick(v => (v + 1) % 1000), 50);
    };
    update(); document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  if (overlay) return <Standings showGap={showGap} tick={tick}/>;
  return <main className="control"><h1>Vantare UI bakeoff</h1><p>Referencia Wails · React · WebView2</p>
    <label>Nombre de sesión<input defaultValue="Barcelona · LMU" aria-label="Nombre de sesión"/></label>
    <label className="check"><input type="checkbox" checked={showGap} onChange={e => setShowGap(e.target.checked)}/> Mostrar intervalo</label>
    <Standings showGap={showGap} tick={tick}/>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
