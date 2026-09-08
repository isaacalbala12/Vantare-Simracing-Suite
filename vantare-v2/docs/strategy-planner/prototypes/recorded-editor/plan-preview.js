// Presentación documental: sin I/O, solver ni resultados simulados.
function planTabs(view) {
  return `<div class="tabs" role="group" aria-label="Área de estrategia">${[
    ['summary', 'Carrera'], ['advanced', 'Datos'], ['plan', 'Plan'], ['revisions', 'Revisiones'],
  ].map(([id, label]) => `<button data-view="${id}" aria-pressed="${id === view || (id === 'plan' && ['stint', 'pit', 'calculation'].includes(view))}">${label}</button>`).join('')}</div>`;
}
function previewButton(label, view) {
  return `<button class="orbit-btn orbit-btn--ghost" data-view="${view}">${label}</button>`;
}
// Pictogramas locales del esquema, con el mismo trazo que Orbit.
function detailIcon(name) {
  const paths = {
    fuel: '<path d="M4 20V4h9v16M2 20h13M4 10h9M16 5l3 3v9a2 2 0 0 1-4 0v-4h-2M17 6v4h2"/>',
    tyre: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M9 2h6M12 5V2M12 9v5l3 2M18 6l2-2"/>',
    entry: '<path d="M14 3h7v18h-7M2 12h13M10 7l5 5-5 5"/>',
    exit: '<path d="M10 3H3v18h7M9 12h13M17 7l5 5-5 5"/>',
    target: '<circle cx="11" cy="13" r="8"/><circle cx="11" cy="13" r="4"/><path d="m11 13 9-10M16 3h4v4"/>',
  };
  const orbit = {energy: 'launcher', driver: 'cuenta', rules: 'carreras', pace: 'telemetria', pit: 'ajustes'};
  return orbit[name] ? icon(orbit[name], 22) : `<svg aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}
function previewTimeline(view) {
  return `<section class="race-strip" aria-label="Desarrollo de la carrera">
    <div class="race-track">
      <button data-view="stint" aria-pressed="${view === 'stint'}"><span>Stint</span><i>${detailIcon('pace')}</i></button>
      <button data-view="pit" aria-pressed="${view === 'pit'}"><span>Parada${view === 'pit' ? ' seleccionada' : ''}</span><i>${detailIcon('pit')}</i></button>
      <div class="race-end"><span>Llegada</span><i></i></div>
    </div>
    <p>Esquema de navegación · sin resultado calculado</p>
  </section>`;
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
    <div class="flow-transit">${detailIcon('entry')}<span>Entrada a boxes</span></div>
    <span class="flow-link" aria-hidden="true">→</span>
    <fieldset class="parallel-services"><legend>Servicios en paralelo</legend><div>
      ${serviceLabel('fuel', 'Combustible')}${serviceLabel('tyre', 'Neumáticos')}${serviceLabel('driver', 'Piloto')}
    </div></fieldset>
    <span class="flow-link" aria-hidden="true">→</span>
    <div class="flow-transit">${detailIcon('exit')}<span>Salida de boxes</span></div>
  </div><p class="diagram-note">Esquema: la simultaneidad depende del reglamento. Los tiempos en paralelo no se suman.</p>`;
}
function pitDetail() {
  return `<div class="detail-grid"><div class="stack">
    <div class="detail-metrics">${detailMetric('entry', 'Entrada prevista')}${detailMetric('exit', 'Salida prevista')}${detailMetric('clock', 'Tiempo en boxes', '— s')}</div>
    ${panel('Operaciones previstas', previewTable(['Servicio', 'Acción', 'Duración', 'Origen'], [
      [serviceLabel('fuel', 'Combustible'), 'Según cálculo', '— s', 'Datos'],
      [serviceLabel('energy', 'Energía virtual'), 'Según reglamento', '—', 'Reglas'],
      [serviceLabel('tyre', 'Neumáticos'), 'Según cálculo', '— s', 'Datos'],
      [serviceLabel('driver', 'Cambio de piloto'), 'Según cálculo', '— s', 'Reglas'],
    ]))}
    ${panel('Secuencia del servicio', serviceSequence())}
  </div><div class="stack">
    ${panel('Por qué parar aquí', '<p class="section-note">Factores que explican la elección de esta parada.</p>' +
      detailRow('target', 'Recurso limitante', 'Tras calcular', true) +
      detailRow('rules', 'Ventana reglamentaria', 'Tras calcular', true) +
      detailRow('driver', 'Relevo', 'Tras calcular', true) +
      detailRow('fuel', 'Margen al entrar', 'Tras calcular', true))}
    ${panel('Tiempo y coste', detailRow('clock', 'Tiempo detenido', '— s') +
      detailRow('clock', 'Tiempo total en boxes', '— s') +
      detailRow('pace', 'Pérdida frente a seguir en pista', '— s') +
      '<p class="diagram-note">El coste incluye tránsito y servicio, según el modelo disponible.</p>' +
      `<div class="source-actions">${previewButton('Ver stint', 'stint')}</div>`)}
  </div></div>`;
}
function stintDetail() {
  return `<div class="detail-grid"><div class="stack">
    <div class="detail-metrics">${detailMetric('driver', 'Piloto', esc(state.driver || 'Por confirmar'))}${detailMetric('pace', 'Ritmo previsto', '— s/vuelta')}${detailMetric('clock', 'Duración prevista')}</div>
    ${panel('Recursos del stint', previewTable(['Recurso', 'Inicio', 'Final', 'Reserva'], [
      [serviceLabel('fuel', 'Combustible'), '— L', '— L', '— L'],
      [serviceLabel('energy', 'Energía virtual'), '— %', '— %', '— %'],
      [serviceLabel('tyre', 'Neumáticos'), '—', '—', '—'],
    ]))}
    ${panel('Evolución prevista', '<div class="plot-empty"><span>Curvas disponibles tras calcular</span></div><div class="plot-legend"><span>Combustible</span><span>Energía virtual</span><span>Desgaste</span></div>')}
  </div><div class="stack">
    ${panel('Qué condiciona este stint', '<p class="section-note">Límites y márgenes para completar el relevo.</p>' +
      detailRow('fuel', 'Combustible', 'Tras calcular', true) +
      detailRow('energy', 'Energía virtual', 'Tras calcular', true) +
      detailRow('tyre', 'Neumáticos', 'Tras calcular', true) +
      detailRow('driver', 'Tiempo de piloto', 'Tras calcular', true))}
    ${panel('Datos de origen', '<p class="section-note">Las fuentes y supuestos utilizados aparecerán junto al resultado.</p>' +
      row('Vueltas / duración', '—') + `<div class="source-actions">${previewButton('Ver parada siguiente', 'pit')}</div>`)}
  </div></div>`;
}
function planPreview(source, view) {
  const title = {plan: 'Tu plan de carrera', stint: 'Detalle del stint', pit: 'Detalle de la parada', calculation: 'Proceso de cálculo', revisions: 'Revisiones del plan'}[view];
  const intro = {plan: 'Recorre la estrategia y comprende cada decisión.', stint: 'Revisa el ritmo, los recursos y los límites de este relevo.', pit: 'Revisa la operación seleccionada en el plan de carrera.', calculation: 'De los datos revisados a un plan de carrera verificable.', revisions: 'El contexto y las decisiones de cada plan, juntos.'}[view];
  let body = '';
  if (view === 'plan') body = `${previewTimeline(view)}<div class="plan-metrics">${[
    ['clock', 'Tiempo previsto'], ['pit', 'Paradas'], ['fuel', 'Fuel inicial'], ['energy', 'Energía virtual'], ['target', 'Margen de llegada'],
  ].map(([name, label]) => detailMetric(name, label)).join('')}</div><div class="detail-grid">${panel('Detalle del plan', '<p class="section-note">Selecciona Stint o Parada para recorrer el detalle. El motor todavía no está conectado.</p>')}${panel('Por qué este plan', row('Objetivo', 'Tras calcular') + row('Restricciones', 'Tras calcular') + row('Supuestos y límites', 'Tras calcular'))}</div>`;
  if (view === 'stint') body = previewTimeline(view) + stintDetail();
  if (view === 'pit') body = previewTimeline(view) + pitDetail();
  if (view === 'calculation') body = `<div class="detail-grid">${panel('Etapas previstas', '<ol class="calculation-stages"><li>Comprobar datos y reglas</li><li>Evaluar planes factibles</li><li>Seleccionar el mejor plan</li><li>Verificar la carrera completa</li></ol><p class="section-note">Vista del proceso previsto. No hay un cálculo ejecutándose ni resultados simulados.</p>')}${panel('Entradas y supuestos', row('Evento y reglas', 'Revisión elegida') + row('Sesiones y correcciones', 'Revisión elegida') + row('Incidentes imprevistos', 'Fuera del cálculo inicial') + row('Fuel / energía virtual', 'Comprobaciones separadas'))}</div>`;
  if (view === 'revisions') body = panel('Todavía no hay revisiones guardadas', '<p class="section-note">El guardado no está conectado. Cada revisión conservará las reglas, fuentes, correcciones y resultado utilizados. La recarga descarta este borrador demostrativo.</p>');
  return `<div class="page plan-page">${planTabs(view)}
    <header class="detail-hero"><div class="breadcrumb">${source.track}<span class="chip">LMU</span><span class="chip">${source.category}</span></div><h2 tabindex="-1">${title}</h2><p>${intro}</p></header>
    ${body}<footer class="wizard-footer"><span class="muted">Originales intactos · Valores pendientes</span><div class="source-actions">${previewButton('Volver al plan', 'plan')}${previewButton('Editar datos y reglas', 'summary')}${previewButton('Ver proceso', 'calculation')}${button('Calcular estrategia', '', true, true)}</div></footer></div>`;
}
