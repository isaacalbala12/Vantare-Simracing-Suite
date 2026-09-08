// Presentación documental: sin I/O, solver ni resultados simulados.
function planTabs(view) {
  return `<div class="tabs" role="group" aria-label="Área de estrategia">${[
    ['summary', 'Carrera'], ['advanced', 'Datos'], ['plan', 'Plan'], ['revisions', 'Revisiones'],
  ].map(([id, label]) => `<button data-view="${id}" aria-pressed="${id === view || (id === 'plan' && ['stint', 'pit', 'calculation'].includes(view))}">${label}</button>`).join('')}</div>`;
}
function previewButton(label, view) {
  const glyph = view === 'summary' ? 'edit' : view === 'plan' || label.includes('anterior') ? 'back' : label.includes('siguiente') ? 'arrow' : '';
  return `<button class="orbit-btn orbit-btn--ghost" data-view="${view}">${glyph ? detailIcon(glyph) : ''}<span>${label.replace(/[←→]/g, '').trim()}</span></button>`;
}
// Pictogramas locales del esquema, con el mismo trazo que Orbit.
function detailIcon(name) {
  const paths = {
    fuel: '<path d="M4 20V4h9v16M2 20h13M4 10h9M16 5l3 3v9a2 2 0 0 1-4 0v-4h-2M17 6v4h2"/>',
    tyre: '<g transform="rotate(20 12 12)"><ellipse cx="12" cy="12" rx="8" ry="10"/><ellipse cx="12" cy="12" rx="4.5" ry="6.5"/><path d="M12 6v12M8 9l8 6M8 15l8-6M5 7h2M4 12h2M5 17h2M17 7h2M18 12h2M17 17h2"/></g>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2M12 9v5l3 2M18 6l2-2"/>',
    entry: '<path d="M14 3h7v18h-7M2 12h13M10 7l5 5-5 5"/>',
    exit: '<path d="M10 3H3v18h7M9 12h13M17 7l5 5-5 5"/>',
    group: '<circle cx="9" cy="7" r="3"/><circle cx="18" cy="8" r="2.5"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M16 14a5 5 0 0 1 7 5v2"/>',
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 6v7l4 2"/>',
    loss: '<path d="m3 5 6 6 4-2 8 9M15 18h6v-6"/>',
    bars: '<path d="M3 20h18M4 20v-7h3v7M10 20V8h3v12M16 20V3h3v17"/>',
    laps: '<circle cx="12" cy="12" r="9"/><path d="m7 7 10 10M17 7 7 17M6 5l4 1-1 4-3-1zM14 14l4 1-1 4-3-1z"/>',
    chart: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="m6 15 4-5 4 3 4-6"/>',
    edit: '<path d="m4 16 12-12a3 3 0 0 1 4 4L8 20l-5 1zM14 6l4 4"/>',
    back: '<path d="M21 12H3M10 5l-7 7 7 7"/>',
    refresh: '<path d="M21 7v5h-5M3 17v-5h5M5 7a8 8 0 0 1 13-2l3 7M3 12l3 7a8 8 0 0 0 13-2"/>',
    car: '<path d="m3 15 1-6h3l2-3h7l3 5 2 1v5h-3M6 17h9M3 15H2v-4h3M9 9h7"/><circle cx="6" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
    document: '<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 12h8M8 16h8"/>',
    helmet: '<path d="M2 15C2 7 6 3 12 3s10 4 10 10l-2 5H5l-3 3zM3 12h11l6-3M14 12l6 2v3M3 15h11v3M2 21h13l5-3"/>',
    gauge: '<path d="M4 20a10 10 0 1 1 16 0M12 3v3M4 7l2 2M2 14h3M20 7l-2 2M22 14h-3M12 14l5-6"/><circle cx="12" cy="14" r="2"/>',
    wrench: '<path d="m14 4 1 4 4 1 2-4a6 6 0 0 1-7 8L6 21a3 3 0 0 1-4-4l8-8a6 6 0 0 1 8-7z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
    arrow: '<path d="M3 12h18M14 5l7 7-7 7"/>',
    target: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m11 13 9-10M16 3h4v4"/>',
  };
  const orbit = {energy: 'launcher', driver: 'cuenta', pace: 'telemetria', pit: 'ajustes'};
  return orbit[name] ? icon(orbit[name], 22) : `<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
function previewTimeline(view) {
  if (view === 'stint') return `<section class="stint-strip panel" aria-label="Desarrollo de la carrera">
    <div class="strip-heading"><h3>Desarrollo de la carrera</h3><span>Esquema de navegación, no resultado calculado</span>${detailIcon('info')}</div>
    <div class="stint-segments"><span>···</span><span></span><button data-view="stint" aria-pressed="true">Stint seleccionado<i class="stint-start"></i><i class="stint-finish">${detailIcon('arrow')}</i></button><button data-view="pit" aria-label="Ver parada siguiente">···</button><span>···</span></div>
    <div class="segment-labels"><span>Inicio del stint</span><span>Fin del stint</span></div>
  </section>`;
  return `<section class="race-strip" aria-label="Desarrollo de la carrera"><div class="pit-track">
    <button data-view="stint" aria-label="Ver stint anterior"><span>Stint anterior</span><i></i></button>
    <button data-view="pit" aria-pressed="${view === 'pit'}"><span>Parada${view === 'pit' ? ' seleccionada' : ''}</span><i>${detailIcon('wrench')}</i></button>
    <button data-view="stint" aria-label="Ver stint siguiente"><span>Stint siguiente</span><i></i></button>
  </div><div class="timeline-notes"><p>Esquema de navegación, no resultado calculado</p><p>Esquema de navegación, no resultado calculado</p></div></section>`;
}
function detailPanel(title, body, subtitle = '', extra = '') {
  return `<section class="panel ${extra}"><div class="panel-head"><h3>${title}</h3>${subtitle ? `<p>${subtitle}</p>` : ''}</div><div class="panel-body">${body}</div></section>`;
}
function previewTable(headings, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headings.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function serviceLabel(name, label) {
  return `<span class="service-label">${detailIcon(name)}<span>${label}</span></span>`;
}
function detailRow(name, label, value, pending = false) {
  return `<div class="detail-row">${detailIcon(name)}<span>${label}</span><b class="${pending ? 'pending-value' : ''}">${value}</b></div>`;
}
function detailMetric(name, label, value = '—') {
  return `<div class="detail-metric">${detailIcon(name)}<div><span>${label}</span><strong>${value}</strong></div></div>`;
}
function serviceSequence() {
  return `<div class="pit-flow">
    <div class="flow-transit">${detailIcon('entry')}<span>Tránsito de entrada</span></div><span class="flow-link" aria-hidden="true">⇢</span>
    <fieldset class="parallel-services"><legend>Servicios en paralelo</legend><div>${serviceLabel('fuel', 'Combustible')}${serviceLabel('tyre', 'Neumáticos')}${serviceLabel('helmet', 'Piloto')}</div><div class="parallel-bracket" aria-hidden="true"></div></fieldset>
    <span class="flow-link" aria-hidden="true">⇢</span><div class="flow-transit">${detailIcon('exit')}<span>Tránsito de salida</span></div>
    </div><p class="diagram-caption">Esquema: simultaneidad según reglamento</p><p class="diagram-note">${detailIcon('info')}Los tiempos simultáneos no se suman como servicios consecutivos.</p>`;
}
function pitDetail() {
  return `<div class="detail-grid pit-grid"><div class="stack">
    <div class="detail-metrics">${detailMetric('entry', 'Entrada prevista')}${detailMetric('exit', 'Salida prevista')}${detailMetric('clock', 'Tiempo en boxes', '— s')}</div>
    ${detailPanel('Operaciones previstas', previewTable(['Servicio', 'Acción', 'Duración', 'Origen'], [
      [serviceLabel('fuel', 'Combustible'), 'Según cálculo', '— s', 'Datos'],
      [serviceLabel('energy', 'Energía virtual'), 'Según reglamento', '—', 'Reglas'],
      [serviceLabel('tyre', 'Neumáticos'), 'Según cálculo', '— s', 'Datos'],
      [serviceLabel('helmet', 'Cambio de piloto'), 'Según cálculo', '— s', 'Reglas'],
    ]), 'Detalle de las operaciones que se realizarán en esta parada.')}
    ${detailPanel('Secuencia del servicio', serviceSequence(), 'Representación en esquema de la secuencia de la parada.', 'service-panel')}
  </div><div class="stack">
    ${detailPanel('Por qué parar aquí', '<p class="section-note">Factores que explican la elección de esta parada en la estrategia.</p><div class="inset-rows">' +
      detailRow('target', 'Recurso limitante', 'Disponible tras calcular.', true) +
      detailRow('document', 'Ventana reglamentaria', 'Disponible tras calcular.', true) +
      detailRow('group', 'Relevo', 'Disponible tras calcular.', true) +
      detailRow('bars', 'Margen al entrar', 'Disponible tras calcular.', true) + '</div>')}
    ${detailPanel('Tiempo y coste', '<div class="inset-rows">' + detailRow('clock', 'Tiempo detenido', '— s') +
      detailRow('time', 'Tiempo total en boxes', '— s') + detailRow('loss', 'Pérdida frente a seguir en pista', '— s') + '</div>' +
      `<p class="diagram-note">${detailIcon('info')}El coste incluye tránsito y servicio, según el modelo disponible.</p>` +
      `<div class="source-actions neighbor-actions">${previewButton('← Ver stint anterior', 'stint')}${previewButton('Ver stint siguiente →', 'stint')}</div>`, 'Estimación del tiempo en boxes y su impacto en la carrera.')}
  </div></div>`;
}
function constraintCard(name, title, description) {
  return `<div class="constraint-card">${detailIcon(name)}<div><strong>${title}</strong><p>${description}</p></div><span>Por determinar</span></div>`;
}
function stintDetail() {
  return `<div class="detail-grid stint-grid"><div class="stack">
    ${detailPanel('Piloto y ritmo', `<div class="pilot-band">${detailMetric('helmet', 'Piloto asignado', esc(state.driver || 'Pendiente del cálculo'))}${detailMetric('gauge', 'Ritmo previsto', '— s/vuelta')}${detailMetric('document', 'Procedencia', `<span class="origin-pill">Por confirmar ${detailIcon('info')}</span>`)}</div>`)}
    ${detailPanel('Recursos del stint', `<div class="resource-kpis">${detailMetric('laps', 'Vueltas')}${detailMetric('clock', 'Duración')}${detailMetric('tyre', 'Compuesto')}</div>` + previewTable(['Recurso', 'Inicio', 'Final', 'Reserva'], [
      [serviceLabel('fuel', 'Combustible'), '— L', '— L', '— L'],
      [serviceLabel('energy', 'Energía virtual'), '— %', '— %', '— %'],
      [serviceLabel('tyre', 'Neumáticos'), '—', '—', '—'],
    ]), '', 'resource-panel')}
    ${detailPanel('Evolución prevista', '<div class="curve-tabs" role="group" aria-label="Recurso de la curva"><button data-curve="Fuel" aria-pressed="true">Fuel</button><button data-curve="Energía virtual" aria-pressed="false">Energía virtual</button><button data-curve="Desgaste" aria-pressed="false">Desgaste</button></div><div class="plot-wrap"><span class="axis-y">Nivel</span><div class="plot-empty">' + detailIcon('chart') + '<span>Curva disponible tras calcular.</span></div><span class="axis-x">Vueltas (esquema)</span></div>', '', 'curve-panel')}
  </div><div class="stack">
    ${detailPanel('Qué condiciona este stint', '<p class="section-note">El límite activo se identificará al calcular.</p>' +
      constraintCard('fuel', 'Límite de combustible', 'Condicionado por capacidad del depósito, consumo y margen requerido.') +
      constraintCard('energy', 'Límite de energía virtual', 'Condicionado por la estrategia de recuperación y despliegue.') +
      constraintCard('tyre', 'Neumáticos y piloto', 'Condicionado por la vida del compuesto y el ritmo previsto del piloto.') +
      constraintCard('document', 'Datos de origen', 'Proviene del simulador, categoría y circuito seleccionados.') +
      `<p class="constraint-note">${detailIcon('info')}El límite activo se identificará al calcular.</p><button class="next-stint" data-view="pit">${detailIcon('arrow')}<span><strong>Ver parada siguiente</strong><small>Consulta el detalle de la siguiente parada programada.</small></span></button>`)}
  </div></div>`;
}
function planPreview(source, view) {
  const title = {plan: 'Tu plan de carrera', stint: 'Detalle del stint', pit: 'Detalle de la parada', calculation: 'Proceso de cálculo', revisions: 'Revisiones del plan'}[view];
  const intro = {plan: 'Recorre la estrategia y comprende cada decisión.', stint: 'Consulta el detalle del stint seleccionado en el plan de carrera.', pit: 'Revisa el detalle de la operación seleccionada en el plan de carrera.', calculation: 'De los datos revisados a un plan de carrera verificable.', revisions: 'El contexto y las decisiones de cada plan, juntos.'}[view];
  let body = '';
  if (view === 'plan') body = `${previewTimeline(view)}<div class="plan-metrics">${[
    ['clock', 'Tiempo previsto'], ['pit', 'Paradas'], ['fuel', 'Fuel inicial'], ['energy', 'Energía virtual'], ['target', 'Margen de llegada'],
  ].map(([name, label]) => detailMetric(name, label)).join('')}</div><div class="detail-grid">${panel('Detalle del plan', '<p class="section-note">Selecciona Stint o Parada para recorrer el detalle. El motor todavía no está conectado.</p>' + previewButton('Ver proceso de cálculo', 'calculation'))}${panel('Por qué este plan', row('Objetivo', 'Tras calcular') + row('Restricciones', 'Tras calcular') + row('Supuestos y límites', 'Tras calcular'))}</div>`;
  if (view === 'stint') body = previewTimeline(view) + stintDetail();
  if (view === 'pit') body = previewTimeline(view) + pitDetail();
  if (view === 'calculation') body = `<div class="detail-grid">${panel('Etapas previstas', '<ol class="calculation-stages"><li>Comprobar datos y reglas</li><li>Evaluar planes factibles</li><li>Seleccionar el mejor plan</li><li>Verificar la carrera completa</li></ol><p class="section-note">Vista del proceso previsto. No hay un cálculo ejecutándose ni resultados simulados.</p>')}${panel('Entradas y supuestos', row('Evento y reglas', 'Revisión elegida') + row('Sesiones y correcciones', 'Revisión elegida') + row('Incidentes imprevistos', 'Fuera del cálculo inicial') + row('Fuel / energía virtual', 'Comprobaciones separadas'))}</div>`;
  if (view === 'revisions') body = panel('Todavía no hay revisiones guardadas', '<p class="section-note">El guardado no está conectado. Cada revisión conservará las reglas, fuentes, correcciones y resultado utilizados. La recarga descarta este borrador demostrativo.</p>');
  return `<div class="page plan-page view-${view}">${planTabs(view)}
    <header class="detail-hero"><h2 tabindex="-1">${title}</h2><p>${intro}</p></header>
    ${body}<footer class="wizard-footer"><span class="muted">${detailIcon('info')}Los archivos de telemetría originales nunca se sobrescriben.</span><div class="source-actions">${previewButton('← Volver al plan', 'plan')}${previewButton('Editar datos y reglas', 'summary')}<button class="orbit-btn orbit-btn--primary" disabled title="Disponible al conectar el motor">${detailIcon('refresh')}<span>Calcular estrategia</span></button></div></footer></div>`;
}
