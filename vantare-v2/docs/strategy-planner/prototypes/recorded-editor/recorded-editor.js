// Propuesta documental: solo estado en memoria, sin lector, solver ni persistencia.
const sources = {
  imola: { track: 'Imola', car: 'United Autosports #21:ELMS25', category: 'LMP2 ELMS', date: '6 junio 2026', laps: 38, record: 'Referencia inicial de carrera', pit: '54,12 s', fuel: '25,715 L', entry: '2874,12', exit: '2928,24', offset: '25,44 s', crossings: 38 },
  algarve: { track: 'Algarve', car: 'Oreca 07 ELMS Custom Team 2025 #397', category: 'LMP2 ELMS', date: '11 julio 2026', laps: 70, record: 'Grabación parcial · vueltas 101–171', pit: '75,00 s', fuel: '74,725 L', entry: '13513,52', exit: '13588,52', offset: '10104,62 s', crossings: 70 },
};
const state = { view: 'summary', step: 0, reached: 0, mode: 'manual', sim: 'lmu', event: 'custom', combo: 'imola', duration: '', unit: 'minutos', driver: '', weather: 'Por confirmar', include: true, advanced: false, undo: null, copy: false };
const names = ['Modo de preparación', 'Simulador', 'Evento', 'Coche y circuito', 'Reglas de carrera', 'Pilotos', 'Telemetría'];
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
function stepContent() {
  const source = sources[state.combo];
  switch (state.step) {
    case 0: return {
      title: 'Prepara tu próxima carrera', intro: 'Elige cómo empezar. La estrategia se construye con tus sesiones registradas.',
      body: `<div class="choice-grid">${choice('mode', 'manual', 'Manual', 'Empieza por la carrera. Elige el evento, el coche y el circuito; después revisa su telemetría.', 'ajustes', 'Configura tu carrera')}${choice('mode', 'auto', 'Automático', 'Empieza por tus sesiones. Revisa las combinaciones disponibles y prepara la carrera desde sus datos.', 'telemetria', 'Parte de tus sesiones')}</div>
      <div class="explainer"><div><strong>01 · Prepara el evento</strong><p>Simulador, coche, circuito y reglas de carrera.</p></div><div><strong>02 · Revisa los datos</strong><p>Selecciona las sesiones y revisa qué observaciones usar.</p></div><div><strong>03 · Genera la estrategia</strong><p>Un plan con sus datos de origen y supuestos visibles.</p></div></div>`,
    };
    case 1: return {
      title: 'Elige el simulador', intro: 'La primera versión trabaja con sesiones registradas de Le Mans Ultimate.',
      body: `<div class="choice-grid">${choice('sim', 'lmu', 'Le Mans Ultimate', 'Utiliza la telemetría de tus archivos DuckDB para preparar la carrera.', 'vantare', 'LMU · Telemetría registrada')}<section class="panel disabled-option"><span class="section-heading">Más adelante</span><h3>Otros simuladores</h3><p class="muted">Cada simulador incorporará sus propios formatos de telemetría.</p></section></div>`,
    };
    case 2: return {
      title: state.mode === 'manual' ? 'Elige tu evento' : 'Prepara una carrera con tus sesiones',
      intro: state.mode === 'manual' ? 'Define una carrera personalizada o utiliza las reglas de un evento del calendario.' : 'Esta propuesta utiliza las dos combinaciones del banco de desarrollo. No busca archivos nuevos.',
      body: `<div class="choice-grid">${choice('event', 'custom', 'Carrera personalizada', 'Elige la combinación y configura las condiciones de la carrera que quieres preparar.', 'estrategia', 'Reglas a tu medida')}<section class="panel disabled-option"><span class="section-heading">Calendario de Vantare</span><h3>Desde un evento</h3><p class="muted">Aquí podrás elegir un evento compatible con su coche, circuito y reglas.</p>${button('Calendario sin conectar', '', false, true)}</section></div>`,
    };
    case 3: return {
      title: 'Coche y circuito', intro: 'Combinaciones con telemetría real en las fuentes seleccionadas para desarrollo.',
      body: `<div class="choice-grid">${Object.entries(sources).map(([id, item]) => choice('combo', id, item.track, `${esc(item.car)}<br>${item.date} · ${item.laps} vueltas registradas`, 'carreras', item.category)).join('')}</div><p class="form-note">Cada combinación mantiene sus propias observaciones. Algarve contiene una grabación parcial.</p>`,
    };
    case 4: return {
      title: 'Reglas de carrera', intro: 'Define el evento que vas a disputar. La grabación aporta datos, no las reglas de tu nueva carrera.',
      body: panel('Formato y condiciones', `<div class="form-grid"><label class="field">Duración o distancia<input name="duration" type="number" min="1" value="${esc(state.duration)}" placeholder="Por confirmar"></label><label class="field">Unidad<select name="unit">${['minutos', 'vueltas'].map(x => `<option ${state.unit === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><label class="field">Condiciones<select name="weather">${['Por confirmar', 'Seco', 'Mojado', 'Variables'].map(x => `<option ${state.weather === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label><div class="field">Fuel y energía virtual<p class="muted">Capacidad, reserva y aplicabilidad por confirmar.</p></div></div><details class="form-note"><summary>Otras reglas que completará el editor</summary><p>Ventanas de parada, neumáticos, servicio simultáneo, límites de stint y relevos. Todavía no son editables en esta propuesta.</p></details>`),
    };
    case 5: return {
      title: 'Pilotos de la carrera', intro: 'El ritmo observado y las estimaciones entre pilotos se mostrarán por separado.',
      body: panel('Equipo', `<div class="form-grid"><label class="field">Piloto principal<input name="driver" value="${esc(state.driver)}" placeholder="Nombre del piloto" maxlength="120"></label><div><h3>Relevos de resistencia</h3><p class="muted form-note">Podrás asignar un ritmo estimado a otro piloto y ajustarlo. Siempre se indicará que es una estimación.</p></div></div><div class="source-actions">${button('Añadir piloto · pendiente', '', false, true)}</div>`),
    };
    case 6: return {
      title: 'Revisa las sesiones', intro: 'Comprueba las fuentes de esta combinación antes de abrir el borrador.',
      body: panel('Telemetría de la combinación', `<div class="source-title"><span class="choice-icon">${icon('telemetria')}</span><div><h3>${source.track} · ${source.date}</h3><p>${esc(source.car)}</p></div></div><div class="source-meta"><div><b>${source.laps}</b><span>Vueltas registradas</span></div><div><b>1</b><span>Parada completa observada</span></div></div><div class="chips"><span class="chip">${source.category}</span><span class="chip">${source.record}</span></div><p class="form-note">La calidad para ritmo, consumo y desgaste está pendiente de validación.</p><label class="data-row"><span>Conservar también una copia en una carpeta elegida</span><input name="copy" type="checkbox" ${state.copy ? 'checked' : ''}></label><p class="form-note">Preferencia de la propuesta; no copia archivos.</p>`),
    };
  }
}
function observationPanel(source) {
  return panel('Observaciones de la sesión', `<p class="muted">${source.record}. Los incidentes y las vueltas invalidadas aún no están adjudicados.</p><div class="table-scroll"><table><thead><tr><th>Observación</th><th>Valor</th><th>Procedencia</th></tr></thead><tbody><tr><td>Entrada a boxes</td><td>${source.entry} s</td><td>Evento observado</td></tr><tr><td>Salida de boxes</td><td>${source.exit} s</td><td>Evento observado</td></tr><tr><td>Fuel añadido</td><td>${source.fuel}</td><td>Visita completa</td></tr><tr><td>Incidentes</td><td>Sin adjudicar</td><td>Revisión pendiente</td></tr></tbody></table></div><details class="form-note"><summary>Procedencia y correspondencia temporal</summary><p>Banco de desarrollo #1030: ajuste de ${source.offset} por ${source.crossings} cruces de meta, con residuo máximo de 0,04 s. Es un contraste exploratorio; no certifica la precisión del modelo de carrera.</p></details>`);
}
function workspace() {
  if (!['summary', 'advanced'].includes(state.view)) return planPreview(sources[state.combo], state.view);
  const source = sources[state.combo];
  const summary = panel('Tu carrera', row('Condiciones', esc(state.weather)) + row('Piloto principal', esc(state.driver || 'Por confirmar')) + row('Neumáticos, Fuel y energía virtual', 'Reglas pendientes'), button('Editar reglas', 'rules')) + panel('Datos para el cálculo', row('Ritmo representativo', 'Pendiente de validar') + row('Consumo y desgaste', 'Pendiente de validar') + row('Parada completa observada', `${source.pit} · ${source.fuel} añadidos`) + '<p class="form-note">Fuel: suma de incrementos positivos. Una parada observada no determina el coste de todas las estrategias.</p>', button('Revisar datos', 'advanced'));
  return `<div class="page"><div class="breadcrumb"><span>Nueva estrategia</span><span>/</span><b>Borrador</b></div><div class="page-head editor-head"><div><h2 tabindex="-1">${source.track}</h2><p>${esc(source.car)}</p><div class="chips"><span class="chip">LMU</span><span class="chip">${source.category}</span><span class="chip">${state.duration ? `${esc(state.duration)} ${esc(state.unit)}` : 'Duración por confirmar'}</span><span class="chip">Telemetría registrada</span></div></div>${button('Volver a preparación', 'sources')}</div>
    ${planTabs(state.advanced ? 'advanced' : 'summary')}
    <div class="workspace"><div class="stack">${state.advanced ? observationPanel(source) : summary}${panel('Sesión seleccionada', `<div class="source-title"><span class="choice-icon">${icon('telemetria')}</span><div><h3>${source.track} · ${source.date}</h3><p>${state.include ? 'Incluida en este borrador' : 'Excluida de este borrador'} · ${source.laps} vueltas registradas</p></div></div><div class="source-actions">${button(state.include ? 'Excluir del plan' : 'Incluir en el plan', 'toggle-source')}${button('Deshacer', 'undo', false, state.undo === null)}</div><div id="announce" role="status" aria-live="polite" class="status-message"></div>`)}</div>
    <section class="panel result-panel"><div class="panel-head"><h3>Estrategia de carrera</h3></div><div class="result-empty"><div class="result-icon">${icon('estrategia', 36)}</div><h3>Aún sin calcular</h3><p>${state.include ? 'Completa las reglas y valida las observaciones para generar el plan de carrera.' : 'Incluye una fuente compatible para preparar la estrategia.'}</p></div><div class="result-footer">${button('Calcular estrategia', '', true, true)}<div class="source-actions">${button('Guardar revisión', '', false, true)}</div><p>El cálculo y el guardado no están conectados en esta propuesta.</p></div></section></div></div>`;
}
function render(focus = false) {
  document.getElementById('shell').dataset.column = state.step === 7 ? 'closed' : 'open';
  document.getElementById('content').dataset.mode = state.step === 7 ? 'editor' : 'wizard';
  document.getElementById('steps').innerHTML = names.map((name, i) => `<li class="${i < state.step ? 'complete' : ''}"><button data-step="${i}" ${i > state.reached ? 'disabled' : ''} ${i === state.step ? 'aria-current="step"' : ''}><span class="step-n">${i < state.step ? '✓' : i + 1}</span>${name}</button></li>`).join('');
  if (state.step === 7) document.getElementById('content').innerHTML = workspace();
  else {
    const page = stepContent();
    document.getElementById('content').innerHTML = `<div class="page"><div class="breadcrumb"><span>Nueva estrategia</span><span>/</span><b>${names[state.step]}</b></div><div class="page-head"><div><h2 tabindex="-1">${page.title}</h2><p>${page.intro}</p></div></div><div class="wizard-body">${page.body}</div><footer class="wizard-footer">${button('← Atrás', 'prev', false, state.step === 0)}<span class="footer-note">Paso ${state.step + 1} de 7 · Originales intactos</span>${button(state.step === 6 ? 'Abrir borrador →' : 'Continuar →', 'next', true)}</footer></div>`;
  }
  if (focus) { document.getElementById('content').scrollTop = 0; document.querySelector('h2').focus(); }
}
function go(step) { state.step = Math.max(0, Math.min(7, step)); state.reached = Math.max(state.reached, state.step); render(true); }
document.addEventListener('input', event => {
  const target = event.target;
  if (['duration', 'unit', 'weather', 'driver', 'copy'].includes(target.name)) state[target.name] = target.type === 'checkbox' ? target.checked : target.value;
});
document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target || target.disabled) return;
  if (target.dataset.view && ['summary','advanced','plan','stint','pit','calculation','revisions'].includes(target.dataset.view)) { state.view = target.dataset.view; state.advanced = state.view === 'advanced'; render(true); return; }
  if (target.dataset.step !== undefined) { go(Number(target.dataset.step)); return; }
  if (target.dataset.choice) {
    if (target.dataset.choice === 'combo' && state.combo !== target.dataset.value) { state.include = true; state.undo = null; }
    if (['mode', 'combo'].includes(target.dataset.choice)) state[target.dataset.choice] = target.dataset.value;
    render();
    document.querySelector(`[data-choice="${target.dataset.choice}"][data-value="${target.dataset.value}"]`)?.focus();
    return;
  }
  switch (target.dataset.action) {
    case 'next': if ([...document.querySelectorAll('main input')].every(input => input.reportValidity())) go(state.step + 1); break;
    case 'prev': go(state.step - 1); break;
    case 'start': go(0); break;
    case 'rules': go(4); break;
    case 'sources': go(6); break;
    case 'collapse': { const shell = document.getElementById('shell'); shell.dataset.column = shell.dataset.column === 'closed' ? 'open' : 'closed'; break; }
    case 'summary': state.view = 'summary'; state.advanced = false; render(); document.querySelector('[data-view="summary"]').focus(); break;
    case 'advanced': state.view = 'advanced'; state.advanced = true; render(); document.querySelector('[data-view="advanced"]').focus(); break;
    case 'toggle-source': state.undo = state.include; state.include = !state.include; render(); document.querySelector('[data-action="toggle-source"]').focus(); document.getElementById('announce').textContent = 'Selección modificada en la propuesta. Archivo original intacto.'; break;
    case 'undo': if (state.undo !== null) { state.include = state.undo; state.undo = null; render(); document.querySelector('[data-action="toggle-source"]').focus(); document.getElementById('announce').textContent = 'Selección anterior restaurada.'; } break;
  }
});
rail();
render();
