// Propuesta documental: solo estado en memoria, sin lector, solver ni persistencia.
const sources = {
  imola: { track: 'Imola', car: 'United Autosports #21:ELMS25', category: 'LMP2 ELMS', date: '6 junio 2026', laps: 38, record: 'Referencia inicial de carrera', pit: '54,12 s', fuel: '25,715 L', entry: '2874,12', exit: '2928,24', offset: '25,44 s', crossings: 38 },
  algarve: { track: 'Algarve', car: 'Oreca 07 ELMS Custom Team 2025 #397', category: 'LMP2 ELMS', date: '11 julio 2026', laps: 70, record: 'Grabación parcial · vueltas 101–171', pit: '75,00 s', fuel: '74,725 L', entry: '13513,52', exit: '13588,52', offset: '10104,62 s', crossings: 70 },
};
const state = { view: 'summary', step: 0, reached: 0, mode: 'manual', sim: 'lmu', event: 'custom', combo: 'imola', duration: '', unit: 'minutos', driver: '', weather: 'Por confirmar', include: true, advanced: false, undo: null, copy: false };
// Enlaces revisables del prototipo; la recarga sigue descartando el borrador.
const previewView = location.hash.slice(1);
if (['summary', 'advanced', 'plan', 'stint', 'pit', 'calculation', 'revisions'].includes(previewView)) {
  state.step = 7; state.reached = 7; state.view = previewView; state.advanced = previewView === 'advanced';
}
if (/^step-[0-6]$/.test(previewView)) { state.step = [1, 2].includes(Number(previewView.slice(-1))) ? 3 : Number(previewView.slice(-1)); state.reached = state.step; }
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const icon = (name, size = 22) => `<svg aria-hidden="true" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><use href="../../../../frontend/src/assets/orbit-icons.svg#i-${name}"/></svg>`;
const button = (label, action, primary = false, disabled = false) => `<button type="button" class="orbit-btn orbit-btn--${primary ? 'primary' : 'ghost'}" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const panel = (title, body, action = '') => `<section class="panel"><div class="panel-head"><h3>${title}</h3>${action}</div><div class="panel-body">${body}</div></section>`;
const row = (label, value) => `<div class="data-row"><span>${label}</span><b>${value}</b></div>`;
function choice(key, value, title, copy, glyph, foot) {
  const selected = state[key] === value;
  return `<button type="button" class="choice" aria-pressed="${selected}" data-choice="${key}" data-value="${value}">
    <span class="choice-top"><span class="choice-icon">${icon(glyph)}</span><span class="radio-mark" aria-hidden="true">${selected ? '✓' : ''}</span></span>
    <strong>${title}</strong><span class="choice-copy">${copy}</span><span class="choice-bottom"><b>${foot}</b><span>${selected ? 'Seleccionado' : 'Seleccionar'}</span></span></button>`;
}
function rail() {
  const items = [['vantare', 'Inicio'], ['studio', 'Overlays Studio'], ['launcher', 'Launcher'], ['carreras', 'Carreras'], ['estrategia', 'Estrategia'], ['ingeniero', 'Ingeniero'], ['telemetria', 'Telemetría'], ['roadmap', 'Roadmap']];
  document.getElementById('rail').innerHTML = items.map(([name, label]) => `<button class="orbit-rail__button" aria-label="${label}" ${name === 'estrategia' ? 'aria-current="page" data-action="start"' : 'disabled'}>${icon(name, 23)}</button>`).join('') + `<div class="orbit-rail__bottom"><button class="orbit-rail__button" aria-label="Alternar columna de preparación" data-action="collapse">${icon('panel')}</button><button class="orbit-rail__button" aria-label="Ajustes fuera de esta propuesta" disabled>${icon('ajustes')}</button><button class="orbit-rail__button" aria-label="Cuenta fuera de esta propuesta" disabled>${icon('cuenta')}</button></div>`;
}
function stepContent() { return wizardScreen(); }
function workspace() {
  return ['stint', 'pit'].includes(state.view) ? planPreview(sources[state.combo], state.view) : editorScreen();
}
function render(focus = false) {
  history.replaceState(null, '', state.step === 7 ? `#${state.view}` : `#step-${state.step}`);
  document.getElementById('shell').dataset.column = state.step === 7 ? 'closed' : 'open';
  document.getElementById('shell').dataset.view = state.step === 7 ? state.view : 'wizard';
  document.querySelector('.orbit-topbar__tt').innerHTML = state.step === 7
    ? `<h1>Estrategia</h1><span class="header-slash">/</span><strong>${sources[state.combo].track}</strong><span class="lmu-badge">LMU</span><span class="category-badge">${detailIcon('car')}${sources[state.combo].category}</span>`
    : '<span class="orbit-topbar__eyebrow">ESTRATEGIA</span><span>/</span><h1>Nueva estrategia</h1>';

  document.getElementById('content').dataset.mode = state.step === 7 ? 'editor' : 'wizard';
    document.querySelector('.orbit-column__context').innerHTML = wizardContext();
  document.getElementById('content').innerHTML = state.step === 7 ? workspace() : wizardPage();
  if (focus) { document.getElementById('content').scrollTop = 0; document.querySelector('h2').focus(); }
}
function go(step) { state.step = Math.max(0, Math.min(7, step)); state.reached = Math.max(state.reached, state.step); render(true); }
document.addEventListener('input', event => {
  const target = event.target;
  if (target.name === 'combo') { state.combo = target.value; state.include = true; state.undo = null; render(); return; }
  if (['duration', 'unit', 'weather', 'driver', 'copy', 'temperature', 'fuelReserve', 'energyReserve', 'coDriver', 'estimatedPace'].includes(target.name)) state[target.name] = target.type === 'checkbox' ? target.checked : target.value;
});
document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  if (target.dataset.family) { state.family = target.dataset.family; render(); return; }
  if (target.dataset.curve) {
    document.querySelectorAll('[data-curve]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === target)));
    document.querySelector('.plot-empty span').textContent = `${target.dataset.curve}: curva disponible tras calcular.`;
    return;
  }

  if (target.dataset.view && ['summary','advanced','plan','stint','pit','calculation','revisions'].includes(target.dataset.view)) { state.step = 7; state.reached = 7; state.view = target.dataset.view; state.advanced = state.view === 'advanced'; render(true); return; }
  if (target.dataset.step !== undefined) { go(Number(target.dataset.step)); return; }
  if (target.dataset.choice) {
    if (target.dataset.choice === 'combo' && state.combo !== target.dataset.value) { state.include = true; state.undo = null; }
    if (['mode', 'combo'].includes(target.dataset.choice)) state[target.dataset.choice] = target.dataset.value;
    render();
    document.querySelector(`[data-choice="${target.dataset.choice}"][data-value="${target.dataset.value}"]`)?.focus();
    return;
  }
  switch (target.dataset.action) {
    case 'next': if ([...document.querySelectorAll('main input')].every(input => input.reportValidity())) go(state.step === 0 ? 3 : state.step + 1); break;
    case 'prev': go(state.step === 3 ? 0 : state.step - 1); break;
    case 'start': go(0); break;
    case 'change-circuit': document.querySelector('[name=combo]').focus(); break;
    case 'pilots': go(5); break;
    case 'event': go(3); break;
    case 'rules': go(4); break;
    case 'sources': go(6); break;
    case 'collapse': { const shell = document.getElementById('shell'); shell.dataset.column = shell.dataset.column === 'closed' ? 'open' : 'closed'; break; }
    case 'summary': state.view = 'summary'; state.advanced = false; render(); document.querySelector('[data-view="summary"]').focus(); break;
    case 'advanced': state.step = 7; state.reached = 7; state.view = 'advanced'; state.advanced = true; render(); document.querySelector('[data-view="advanced"]').focus(); break;
    case 'toggle-source': state.undo = state.include; state.include = !state.include; render(); document.querySelector('[data-action="toggle-source"]:not(:disabled)').focus(); document.getElementById('announce').textContent = 'Selección modificada en la propuesta. Archivo original intacto.'; break;
    case 'undo': if (state.undo !== null) { state.include = state.undo; state.undo = null; render(); document.querySelector('[data-action="toggle-source"]:not(:disabled)').focus(); document.getElementById('announce').textContent = 'Selección anterior restaurada.'; } break;
  }
});
rail();
render();
