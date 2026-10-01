//! Revisión de observaciones usando los contratos exactos de Analysis.
use gpui::{Context, Div, ParentElement, Styled, div, prelude::*, px, rgb, rgba};

use super::{Strategy, orbit};
use vantare_strategy::application::{
    self, AnalysisRevisionRef, CorrectionFamily, CorrectionSource, FamilyCorrectionRequest,
    FamilyCorrectionTarget, FamilyUse, PreparedFamilyCorrection, ValidityLap,
};

const PAGE_SIZE: usize = 5;
const FAMILIES: [CorrectionFamily; 5] = [
    CorrectionFamily::FuelConsumption,
    CorrectionFamily::VirtualEnergyConsumption,
    CorrectionFamily::CombinedStintPaceCurve,
    CorrectionFamily::TyreDegradation,
    CorrectionFamily::SavingCost,
];

#[derive(Clone, Debug)]
pub(super) struct State {
    label: Option<String>,
    source: Option<CorrectionSource>,
    selected_revisions: Vec<AnalysisRevisionRef>,
    corrections: Vec<PreparedFamilyCorrection>,
    family: CorrectionFamily,
    page: usize,
    selected_lap: Option<usize>,
    advanced: bool,
    sources_open: bool,
    error: Option<String>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            label: None,
            source: None,
            selected_revisions: Vec::new(),
            corrections: Vec::new(),
            family: CorrectionFamily::CombinedStintPaceCurve,
            page: 0,
            selected_lap: None,
            advanced: false,
            sources_open: false,
            error: None,
        }
    }
}

impl State {
    pub(super) fn load(
        &mut self,
        label: String,
        source: CorrectionSource,
        selected_revisions: Vec<AnalysisRevisionRef>,
        corrections: &[PreparedFamilyCorrection],
    ) -> Result<(), String> {
        if label.trim().is_empty() {
            return Err("analysis_session_label_required".into());
        }
        application::continue_with_analysis_revision(&source.revision, &selected_revisions)?;
        let requests = corrections
            .iter()
            .map(|correction| correction.request.clone())
            .collect::<Vec<_>>();
        let checked =
            application::prepare_family_corrections(&source, &selected_revisions, &requests)?;
        if checked != corrections {
            return Err("invalid_correction_set".into());
        }
        application::apply_family_corrections(
            &source,
            &selected_revisions,
            &source.validity.laps,
            &checked,
        )?;

        self.label = Some(label);
        self.source = Some(source);
        self.selected_revisions = selected_revisions;
        self.corrections = checked;
        self.page = 0;
        self.selected_lap = None;
        self.error = None;
        Ok(())
    }

    pub(super) fn sources_open(&self) -> bool {
        self.sources_open
    }

    pub(super) fn selected_revisions(&self) -> &[AnalysisRevisionRef] {
        &self.selected_revisions
    }

    pub(super) fn set_capture_view(
        &mut self,
        page: usize,
        selected_lap: Option<usize>,
        advanced: bool,
        sources_open: bool,
    ) {
        self.page = page.min(self.page_count().saturating_sub(1));
        self.selected_lap = selected_lap.filter(|index| *index < self.visible_lap_count());
        self.advanced = advanced;
        self.sources_open = sources_open;
    }

    fn effective_laps(&self) -> Result<Vec<ValidityLap>, String> {
        let source = self.source.as_ref().ok_or("analysis_source_unavailable")?;
        application::apply_family_corrections(
            source,
            &self.selected_revisions,
            &source.validity.laps,
            &self.corrections,
        )
    }

    fn correction_for(&self, lap: &ValidityLap) -> Option<&PreparedFamilyCorrection> {
        self.corrections.iter().find(|correction| {
            let target = &correction.request.target;
            correction.request.family == self.family
                && target.number == lap.number
                && target.start == lap.start
                && target.end == lap.end
        })
    }

    fn apply(&mut self, included: bool, reason: String) -> Result<(), String> {
        if reason.trim().is_empty() {
            return Err("correction_reason_required".into());
        }
        let source = self.source.as_ref().ok_or("analysis_source_unavailable")?;
        let index = self.selected_lap.ok_or("analysis_target_unavailable")?;
        let original_lap = source
            .validity
            .laps
            .get(index)
            .ok_or("analysis_target_unavailable")?;
        let expected = original_lap
            .family_use
            .iter()
            .find(|item| item.family == self.family)
            .cloned()
            .ok_or("analysis_family_unavailable")?;
        let request = FamilyCorrectionRequest {
            base: source.base.clone(),
            target: FamilyCorrectionTarget {
                number: original_lap.number,
                start: original_lap.start.clone(),
                end: original_lap.end.clone(),
            },
            family: self.family,
            expected,
            included,
            reason,
        };
        let mut requests = self
            .corrections
            .iter()
            .filter(|correction| {
                correction.request.family != self.family
                    || correction.request.target.number != original_lap.number
                    || correction.request.target.start != original_lap.start
                    || correction.request.target.end != original_lap.end
            })
            .map(|correction| correction.request.clone())
            .collect::<Vec<_>>();
        requests.push(request);
        let next =
            application::prepare_family_corrections(source, &self.selected_revisions, &requests)?;
        application::apply_family_corrections(
            source,
            &self.selected_revisions,
            &source.validity.laps,
            &next,
        )?;
        self.corrections = next;
        self.error = None;
        Ok(())
    }

    fn page_count(&self) -> usize {
        self.source
            .as_ref()
            .map_or(0, |source| source.validity.laps.len().div_ceil(PAGE_SIZE))
    }

    fn visible_range(&self) -> std::ops::Range<usize> {
        let len = self
            .source
            .as_ref()
            .map_or(0, |source| source.validity.laps.len());
        page_range(len, self.page)
    }

    fn visible_lap_count(&self) -> usize {
        self.source
            .as_ref()
            .map_or(0, |source| source.validity.laps.len())
    }

    fn select_family(&mut self, family: CorrectionFamily) {
        self.family = family;
        self.selected_lap = None;
        self.error = None;
    }

    fn change_page(&mut self, page: usize) {
        self.page = page.min(self.page_count().saturating_sub(1));
        self.selected_lap = None;
    }
}

impl Strategy {
    pub(super) fn apply_data_correction(&mut self, included: bool, cx: &mut Context<Self>) {
        let reason = self.correction_reason.read(cx).value.clone();
        self.data.error = self.data.apply(included, reason).err();
        cx.notify();
    }

    pub(super) fn data_page(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        let heading = data_heading();
        let Some(source) = self.data.source.as_ref() else {
            return heading
                .child(self.empty_source_card(cx))
                .child(originals_footer())
                .into_any_element();
        };
        if self.data.sources_open {
            return heading
                .child(Self::source_panel(source, cx))
                .into_any_element();
        }
        let effective = self.data.effective_laps();
        heading
            .child(
                div()
                    .flex()
                    .w_full()
                    .min_w_0()
                    .gap(px(16.0))
                    .items_start()
                    .child(self.observations(source, &effective, cx))
                    .child(self.observation_panel(source, &effective, cx)),
            )
            .into_any_element()
    }

    fn observations(
        &self,
        source: &CorrectionSource,
        effective: &Result<Vec<ValidityLap>, String>,
        cx: &mut Context<Self>,
    ) -> Div {
        let (table, pager) = self.lap_table(source, effective, cx);
        let demo_samples = self.data.advanced && self.capture_demo.is_some();
        let body = div().flex().flex_col().px(px(22.0)).pt(px(33.0)).pb(px(22.0))
            .child(orbit::text("Sesión en revisión", 13.0, 400, orbit::INK_2))
            .child(div().flex().items_center().gap(px(12.0)).mt(px(7.0))
                .child(select_value(self.data.label.as_deref().unwrap_or(&source.base.session_id)).flex_1().min_w_0())
                .child(self.sources_button(cx)))
            .child(self.observation_tools(cx).mt(px(16.0)))
            .when(!demo_samples, |body| body
                .child(self.family_tabs(cx).into_any_element())
                .child(orbit::text("El uso se decide por familia. Una vuelta utilizable todavía puede carecer de señales para calcular una métrica.",13.0,400,orbit::INK_2).mt(px(18.0)).mb(px(12.0)))
                .child(table).child(pager))
            .when(demo_samples, |body| body.child(self.sample_table()))
            .when(self.data.advanced && !demo_samples, |body| body.child(self.advanced_panel(source)))
            .when_some(self.data.error.clone().or_else(|| effective.as_ref().err().cloned()), |body,error| body.child(orbit::callout(error)));
        review_card().flex_1().min_w_0().child(body)
    }

    fn observation_tools(&self, cx: &mut Context<Self>) -> Div {
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.0))
            .h(px(34.0))
            .child(orbit::text(
                "Observaciones de la sesión",
                20.0,
                400,
                orbit::INK,
            ))
            .child(
                div()
                    .flex()
                    .items_center()
                    .child(
                        secondary_action("strategy-data-classification", "Clasificación")
                            .h(px(34.0))
                            .opacity(orbit::DISABLED),
                    )
                    .child(
                        secondary_action("strategy-data-boundaries", "Límites de stint")
                            .h(px(34.0))
                            .opacity(orbit::DISABLED),
                    )
                    .child(self.advanced_button(cx)),
            )
    }

    fn sample_table(&self) -> Div {
        let mut table = div()
            .flex()
            .flex_col()
            .rounded(px(8.0))
            .border_1()
            .border_color(rgba(orbit::LINE))
            .overflow_hidden()
            .child(table_row(
                &["Muestra", "Original", "Corrección", "Calidad original"],
                true,
            ));
        if let Some(demo) = &self.capture_demo {
            for (index, sample) in demo.samples.iter().enumerate() {
                table = table.child(table_row(
                    &[
                        &format!("Muestra {index}"),
                        &sample.value.to_string(),
                        "Sin cambios",
                        &sample.quality,
                    ],
                    false,
                ));
            }
        }
        div().flex().flex_col().gap(px(10.0)).mt(px(20.0))
            .child(orbit::text("Vista avanzada de muestras originales. Las correcciones se guardan por separado y conservan la calidad del dato.",13.0,400,orbit::INK_2))
            .child(div().flex().gap(px(12.0)).children([("Señal registrada","Fuel level · L"),("Valor","Valor")].into_iter().map(|(label,value)|
                div().flex().flex_col().flex_1().gap(px(8.0)).child(orbit::text(label,13.0,400,orbit::INK_2)).child(select_value(value)))))
            .child(table.mt(px(16.0)))
    }

    fn empty_source_card(&self, cx: &mut Context<Self>) -> Div {
        review_card().w_full().child(div().flex().flex_col().px(px(22.0)).pt(px(33.0)).pb(px(22.0))
            .child(orbit::text("Sesión en revisión",13.0,400,orbit::INK_2))
            .child(select_value("Seleccionar...").mt(px(7.0)))
            .child(self.observation_tools(cx).mt(px(16.0)))
            .child(div().flex().flex_col().items_center().justify_center().h(px(263.0)).gap(px(18.0))
                .child(orbit::icon("i-telemetria",40.0,orbit::INK_2))
                .child(orbit::text("Elige una sesión para revisar",18.0,700,orbit::INK))
                .child(orbit::text("Abre y selecciona tus archivos en la biblioteca. No se leen automáticamente al entrar aquí.",16.0,400,orbit::INK_2))
                .child(primary_action("strategy-empty-review-sources","Revisar fuentes")
                    .h(px(40.0)).when(self.capture_demo.is_none(),|button| button.opacity(orbit::DISABLED))
                    .on_click(cx.listener(|this,_,_,cx| { if this.capture_demo.is_some() { this.data.sources_open=true; cx.notify(); } }))))
            .h(px(438.0)))
    }

    // Biblioteca del mock pass-27. La aplicación normal muestra source_panel con la fuente validada.
    pub(super) fn capture_sources_page(&self, height: f32, cx: &mut Context<Self>) -> Div {
        let back = secondary_action("strategy-sources-back", "← Atrás")
            .w(px(150.0))
            .h(px(56.0))
            .on_click(cx.listener(|this, _, _, cx| {
                this.data.sources_open = false;
                cx.notify();
            }));
        div().flex().flex_col().h(px((height-orbit::STRATEGY_TOPBAR_H).max(0.0))).min_h(px(0.0)).w_full()
            .child(source_progress())
            .child(div().id("strategy-sources-body").flex_1().min_h(px(0.0)).overflow_y_scroll().px(px(32.0)).pt(px(22.0)).pb(px(32.0))
                .child(orbit::tracked_text("SESIONES",11.0,400,orbit::INK_2,1.4))
                .child(tight_title("Telemetría registrada",42.0,700,2.2).mt(px(14.0)).mb(px(14.0)).line_height(px(48.3)))
                .child(orbit::text("Los originales se conservan. Abre hasta cuatro sesiones para revisarlas y elige después cuáles utilizar.",16.0,400,orbit::INK_2).w(px(500.0)).line_height(px(24.0)))
                .child(div().flex().items_center().justify_between().max_w(px(1040.0)).mt(px(14.0)).mb(px(15.0))
                    .child(primary_action("strategy-capture-browse-sources","Buscar sesiones").h(px(40.0)))
                    .child(orbit::text("0/4",11.0,400,orbit::INK_2).px(px(9.0)).py(px(6.0)).rounded(px(8.0)).bg(rgb(0x0010_1315))))
                .child(self.capture_library()))
            .child(div().flex().justify_between().items_center().h(px(112.0)).flex_none().px(px(32.0)).border_t_1().border_color(rgba(orbit::LINE)).bg(rgb(0x0008_090b))
                .child(div().flex().items_center().gap(px(16.0)).child(orbit::text("✓",14.0,400,orbit::INK_2).size(px(22.0)).rounded_full().border_1().border_color(rgba(orbit::LINE_STRONG)).text_center()).child(orbit::text("Originales intactos",14.0,400,orbit::INK_2)))
                .child(back))
    }

    fn capture_library(&self) -> Div {
        let filters = div().flex().gap(px(10.0)).children(
            [
                ("Buscar por nombre de archivo", ""),
                ("Disponibilidad", "Todos"),
                ("Orden", "Recientes"),
            ]
            .into_iter()
            .enumerate()
            .map(|(index, (label, value))| {
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .flex_1()
                    .when(index == 0, |field| field.flex_grow(2.0))
                    .child(orbit::text(label, 13.0, 400, orbit::INK_2))
                    .child(select_value(value).h(px(42.0)))
            }),
        );
        let mut list = div().flex().flex_col().gap(px(8.0));
        if let Some(demo) = &self.capture_demo {
            for file in &demo.files {
                list = list.child(
                    review_card()
                        .rounded(px(8.0))
                        .border_color(rgba(orbit::LINE))
                        .when(file.ready, |card| {
                            card.relative().child(
                                div()
                                    .absolute()
                                    .left(px(0.0))
                                    .top(px(0.0))
                                    .bottom(px(0.0))
                                    .w(px(2.0))
                                    .bg(rgb(orbit::RED)),
                            )
                        })
                        .p(px(14.0))
                        .h(px(92.0))
                        .flex()
                        .flex_row()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .gap(px(3.0))
                                .child(orbit::text(file.name.clone(), 16.0, 700, orbit::INK))
                                .child(orbit::text(file.details.clone(), 13.0, 400, orbit::INK_2))
                                .child(orbit::text(
                                    if file.ready {
                                        "Listo para abrir"
                                    } else {
                                        "No disponible todavía"
                                    },
                                    13.0,
                                    400,
                                    orbit::INK_2,
                                )),
                        )
                        .child(
                            secondary_action("strategy-capture-open-source", "Abrir sesión")
                                .w(px(101.0))
                                .h(px(34.0))
                                .when(!file.ready, |button| button.opacity(orbit::DISABLED))
                                .when(file.ready, |button| {
                                    button
                                        .border_color(orbit::tint(orbit::CARMINE, 0.5))
                                        .bg(orbit::tint(orbit::CARMINE, 0.08))
                                }),
                        ),
                );
            }
        }
        review_card().w(px(1040.0)).max_w_full().p(px(20.0)).pt(px(33.0)).child(filters)
            .child(orbit::text("El nombre sirve para localizar el archivo. Coche y circuito se verificarán al abrirlo.",12.0,400,orbit::INK_2))
            .child(orbit::text(format!("Archivos encontrados: {} / {}",self.capture_demo.as_ref().map_or(0,|demo|demo.files.len()),self.capture_demo.as_ref().map_or(0,|demo|demo.files.len())),16.0,600,orbit::INK).mt(px(0.0)))
            .child(list)
    }

    fn family_tabs(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        let mut tabs = div()
            .flex()
            .w_full()
            .border_b_1()
            .border_color(rgba(orbit::LINE))
            .mt(px(18.0));
        for (index, family) in FAMILIES.into_iter().enumerate() {
            let selected = self.data.family == family;
            tabs = tabs.child(
                div()
                    .flex_grow(1.0)
                    .flex_shrink(0.0)
                    .min_w_0()
                    .flex()
                    .justify_center()
                    .border_b_2()
                    .border_color(if selected {
                        orbit::tint(orbit::CARMINE, 1.0)
                    } else {
                        rgba(0x0000_0000).into()
                    })
                    .child(
                        div()
                            .id(("strategy-data-family", index))
                            .role(gpui::Role::Button)
                            .tab_index(0)
                            .w_full()
                            .h(px(54.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .cursor_pointer()
                            .child(orbit::text(
                                family_label(family),
                                13.0,
                                400,
                                if selected { orbit::INK } else { orbit::INK_2 },
                            ))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.data.select_family(family);
                                cx.notify();
                            })),
                    ),
            );
        }
        tabs.into_any_element()
    }

    fn lap_table(
        &self,
        source: &CorrectionSource,
        effective: &Result<Vec<ValidityLap>, String>,
        cx: &mut Context<Self>,
    ) -> (gpui::AnyElement, gpui::AnyElement) {
        let mut table = div()
            .flex()
            .flex_col()
            .rounded(px(8.0))
            .border_1()
            .border_color(rgba(orbit::LINE))
            .overflow_hidden();
        table = table.child(table_row(
            &[
                "Vuelta",
                "Tiempo registrado",
                "Automático",
                "Revisión guardada",
                "Propuesta",
            ],
            true,
        ));
        if source
            .validity
            .temporal
            .stint_boundaries
            .as_ref()
            .is_none_or(Vec::is_empty)
        {
            table = table.child(
                div()
                    .h(px(37.0))
                    .px(px(12.0))
                    .flex()
                    .items_center()
                    .border_b_1()
                    .border_color(rgba(orbit::LINE))
                    .child(orbit::text(
                        "Tramo sin inicio de stint demostrado",
                        12.0,
                        400,
                        orbit::INK_2,
                    )),
            );
        }
        let range = self.data.visible_range();
        if let Ok(laps) = effective {
            for index in range.clone() {
                let Some(original) = source.validity.laps.get(index) else {
                    continue;
                };
                let Some(reviewed) = laps.get(index) else {
                    continue;
                };
                let automatic = use_for(original, self.data.family);
                let current = use_for(reviewed, self.data.family);
                let proposal =
                    self.data
                        .correction_for(original)
                        .map_or("Automático", |correction| {
                            if correction.request.included {
                                "Incluida"
                            } else {
                                "Excluida"
                            }
                        });
                let selected = self.data.selected_lap == Some(index);
                table = table.child(
                    table_row(
                        &[
                            &format!("Vuelta {}", original.number),
                            "Sin dato",
                            use_label(automatic),
                            use_label(current),
                            proposal,
                        ],
                        false,
                    )
                    .id(("strategy-observation", index))
                    .when(selected, |row| row.bg(orbit::tint(orbit::CARMINE, 0.08)))
                    .hover(|row| row.bg(orbit::tint(orbit::CARMINE, 0.05)))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.data.selected_lap = Some(index);
                        this.data.error = None;
                        cx.notify();
                    })),
                );
            }
        }

        (
            table.into_any_element(),
            self.lap_pager(&range, source.validity.laps.len(), cx),
        )
    }

    fn lap_pager(
        &self,
        range: &std::ops::Range<usize>,
        total: usize,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let total_pages = self.data.page_count();
        let pager = div()
            .mt(px(16.0))
            .flex()
            .items_center()
            .justify_between()
            .child(
                secondary_action("strategy-data-previous", "Anterior")
                    .h(px(34.0))
                    .when(self.data.page == 0, |button| {
                        button.opacity(orbit::DISABLED)
                    })
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.data.change_page(this.data.page.saturating_sub(1));
                        cx.notify();
                    })),
            )
            .child(orbit::text(
                page_label(range, total),
                12.0,
                400,
                orbit::INK_3,
            ))
            .child(
                secondary_action("strategy-data-next", "Siguiente")
                    .h(px(34.0))
                    .when(self.data.page.saturating_add(1) >= total_pages, |button| {
                        button.opacity(orbit::DISABLED)
                    })
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.data.change_page(this.data.page.saturating_add(1));
                        cx.notify();
                    })),
            );
        pager.into_any_element()
    }

    fn observation_panel(
        &self,
        source: &CorrectionSource,
        effective: &Result<Vec<ValidityLap>, String>,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        let mut rows = div().flex().flex_col().gap(px(orbit::RADIUS_CONTROL));
        if let Some(index) = self.data.selected_lap {
            if let (Some(original), Ok(laps)) = (source.validity.laps.get(index), effective) {
                let automatic = use_for(original, self.data.family);
                let current = laps
                    .get(index)
                    .and_then(|lap| use_for(lap, self.data.family));
                let reason = self
                    .data
                    .correction_for(original)
                    .map_or("Sin corrección activa", |correction| {
                        correction.request.reason.as_str()
                    });
                rows = rows
                    .child(orbit::text(
                        format!(
                            "Vuelta {} · {}",
                            original.number,
                            family_label(self.data.family)
                        ),
                        14.0,
                        700,
                        orbit::INK,
                    ))
                    .child(orbit::setting_row(
                        "Uso automático",
                        "Decisión original de Analysis",
                        orbit::text(use_label(automatic), 13.0, 600, orbit::INK_2),
                    ))
                    .child(orbit::setting_row(
                        "Revisión actual",
                        "Corrección validada para esta sesión",
                        orbit::text(use_label(current), 13.0, 600, orbit::INK_2),
                    ))
                    .child(orbit::setting_row(
                        "Motivo actual",
                        "Razón asociada a la corrección preparada",
                        orbit::text(reason, 12.0, 400, orbit::INK_2),
                    ))
                    .child(self.correction_controls(automatic, cx));
            }
        } else {
            rows = rows.h(px(294.0)).justify_center().items_center().gap(px(20.0))
                .child(orbit::icon("i-ajustes",32.0,orbit::INK_2).relative().top(px(-4.0)))
                .child(orbit::text(if self.data.advanced { "Selecciona una muestra para ver el original y preparar un cambio con motivo." } else { "Selecciona una vuelta para revisar su uso en esta familia" },16.0,400,orbit::INK_2).text_center().line_height(px(24.0)).max_w(px(260.0)).relative().top(px(-4.0)));
        }
        review_card()
            .w(px(336.0))
            .flex_none()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .p(px(22.0))
                    .pt(px(27.0))
                    .pb(px(19.0))
                    .child(orbit::text("Revisar observación", 20.0, 400, orbit::INK))
                    .child(rows.mt(px(7.0)))
                    .child(
                        div()
                            .border_t_1()
                            .border_color(rgba(orbit::LINE))
                            .pt(px(20.0))
                            .mt(px(11.0))
                            .child(orbit::text(
                                format!(
                                    "Correcciones en esta revisión: {}",
                                    self.data.corrections.len()
                                ),
                                13.0,
                                700,
                                orbit::INK,
                            ))
                            .child(
                                secondary_action(
                                    "strategy-prepare-data-revision",
                                    "Preparar revisión",
                                )
                                .w(px(130.0))
                                .h(px(40.0))
                                .opacity(orbit::DISABLED),
                            ),
                    ),
            )
            .into_any_element()
    }

    fn correction_controls(
        &self,
        automatic: Option<&FamilyUse>,
        cx: &mut Context<Self>,
    ) -> gpui::AnyElement {
        if automatic.is_none() {
            return orbit::callout(
                "Analysis no ofrece un registro para esta familia en esta vuelta.",
            )
            .into_any_element();
        }
        div()
            .flex()
            .flex_col()
            .gap(px(orbit::RADIUS_CONTROL))
            .child(orbit::text(
                "Motivo de la corrección",
                12.0,
                650,
                orbit::INK_2,
            ))
            .child(self.correction_reason.clone())
            .child(
                div()
                    .flex()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::button("strategy-data-exclude", "Excluir").on_click(
                        cx.listener(|this, _, _, cx| this.apply_data_correction(false, cx)),
                    ))
                    .child(orbit::button("strategy-data-include", "Incluir").on_click(
                        cx.listener(|this, _, _, cx| this.apply_data_correction(true, cx)),
                    )),
            )
            .into_any_element()
    }

    fn advanced_panel(&self, source: &CorrectionSource) -> gpui::AnyElement {
        if !self.data.advanced {
            return orbit::card_body().into_any_element();
        }
        let revisions = self
            .data
            .selected_revisions
            .iter()
            .map(|revision| {
                orbit::setting_row(
                    &revision.session_id,
                    &format!(
                        "base {} · snapshot {}",
                        short_digest(&revision.base_digest),
                        short_digest(&revision.snapshot_id)
                    ),
                    orbit::mono_text(short_digest(&revision.revision_id), 11.0, orbit::INK_2),
                )
            })
            .collect::<Vec<_>>();
        let temporal = source
            .validity
            .temporal
            .segments
            .as_ref()
            .map_or(0, Vec::len);
        orbit::card("Modo avanzado")
            .child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::setting_row(
                        "Fuente",
                        &format!(
                            "{} · sha256 {} · {} bytes",
                            source.base.session_id,
                            short_digest(&source.base.content_sha256),
                            source.base.size_bytes,
                        ),
                        orbit::text(source.base.parser_id.clone(), 12.0, 600, orbit::INK_2),
                    ))
                    .child(orbit::setting_row(
                        "Parser y esquema",
                        &format!(
                            "{} · schema {}",
                            source.base.parser_version,
                            short_digest(&source.base.schema_fingerprint)
                        ),
                        orbit::text(
                            source.base.analysis_version.clone(),
                            12.0,
                            600,
                            orbit::INK_2,
                        ),
                    ))
                    .child(orbit::setting_row(
                        "Interpretación",
                        &format!(
                            "{} · {} segmentos temporales",
                            source.validity.computation_version, temporal
                        ),
                        orbit::mono_text(
                            short_digest(&source.base.segmentation_digest),
                            11.0,
                            orbit::INK_2,
                        ),
                    ))
                    .children(revisions),
            )
            .into_any_element()
    }

    fn source_panel(source: &CorrectionSource, cx: &mut Context<Strategy>) -> gpui::AnyElement {
        orbit::card("Fuente validada")
            .w_full()
            .min_w_0()
            .child(
                orbit::card_body()
                    .gap(px(orbit::RADIUS_CONTROL))
                    .child(orbit::setting_row(
                        "Sesión de Analysis",
                        &source.base.session_id,
                        orbit::mono_text(
                            short_digest(&source.base.segmentation_digest),
                            11.0,
                            orbit::INK_2,
                        ),
                    ))
                    .child(orbit::setting_row(
                        "Revisión exacta",
                        "Identidad usada para validar la fuente",
                        orbit::mono_text(
                            short_digest(&source.revision.revision_id),
                            11.0,
                            orbit::INK_2,
                        ),
                    ))
                    .child(orbit::setting_row(
                        "Contenido",
                        &format!(
                            "SHA-256 {} · {} bytes",
                            short_digest(&source.base.content_sha256),
                            source.base.size_bytes
                        ),
                        orbit::text("Íntegro", 12.0, 600, orbit::INK_2),
                    ))
                    .child(orbit::setting_row(
                        "Parser",
                        &format!(
                            "{} · versión {}",
                            source.base.parser_id, source.base.parser_version
                        ),
                        orbit::text(
                            source.base.analysis_version.clone(),
                            12.0,
                            600,
                            orbit::INK_2,
                        ),
                    ))
                    .child(
                        orbit::button("strategy-data-source-back", "Volver a observaciones")
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.data.sources_open = false;
                                cx.notify();
                            })),
                    ),
            )
            .into_any_element()
    }

    fn advanced_button(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        secondary_action(
            "strategy-data-advanced",
            if self.data.advanced {
                "Volver a vueltas"
            } else {
                "Ver muestras · avanzado"
            },
        )
        .h(px(34.0))
        .on_click(cx.listener(|this, _, _, cx| {
            this.data.advanced = !this.data.advanced;
            cx.notify();
        }))
        .into_any_element()
    }

    fn sources_button(&self, cx: &mut Context<Self>) -> gpui::AnyElement {
        secondary_action(
            "strategy-data-sources",
            if self.data.sources_open {
                "Volver a observaciones"
            } else {
                "Revisar fuentes"
            },
        )
        .h(px(40.0))
        .border_color(orbit::tint(orbit::CARMINE, 0.5))
        .bg(orbit::tint(orbit::CARMINE, 0.08))
        .on_click(cx.listener(|this, _, _, cx| {
            this.data.sources_open = !this.data.sources_open;
            cx.notify();
        }))
        .into_any_element()
    }
}

fn data_heading() -> gpui::Stateful<Div> {
    div().id("strategy-data").flex().flex_col().w_full().h_full().min_w_0().min_h(px(0.0)).overflow_y_scroll().gap(px(21.0))
        .child(div().flex().flex_col().px(px(12.0)).pt(px(12.0)).gap(px(8.0))
            .child(tight_title("Revisa tus datos de telemetría",44.0,700,1.8).line_height(px(52.8)))
            .child(orbit::text("Comprueba las observaciones registradas y conserva el motivo de cada corrección.",17.0,400,orbit::INK_2).line_height(px(26.0))))
}

fn review_card() -> Div {
    orbit::card("")
        .rounded(px(10.0))
        .bg(rgb(0x000c_1011))
        .border_color(rgba(orbit::LINE_STRONG))
        .flex_none()
}

pub(super) fn select_value(value: &str) -> Div {
    div()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(12.0))
        .h(px(40.0))
        .px(px(16.0))
        .rounded(px(8.0))
        .border_1()
        .border_color(rgba(orbit::LINE_STRONG))
        .bg(rgb(0x000a_0c0d))
        .child(orbit::text(value.to_owned(), 13.0, 400, orbit::INK))
        .child(orbit::text("⌄", 16.0, 700, orbit::INK_2))
}

fn originals_footer() -> Div {
    div()
        .flex()
        .items_center()
        .gap(px(12.0))
        .pt(px(2.0))
        .child(orbit::icon("i-lock", 18.0, orbit::INK_2))
        .child(orbit::text("Originales intactos", 13.0, 400, orbit::INK_2))
}

fn table_row(cells: &[&str], header: bool) -> Div {
    let mut row = div()
        .flex()
        .items_center()
        .min_h(px(if header { 44.0 } else { 45.0 }))
        .px(px(12.0))
        .border_b_1()
        .border_color(rgba(orbit::LINE_ROW));
    for (index, cell) in cells.iter().enumerate() {
        row = row.child(
            orbit::text(
                (*cell).to_owned(),
                13.0,
                if header { 500 } else { 400 },
                if header { orbit::INK_2 } else { orbit::INK },
            )
            .w(gpui::relative(if cells.len() == 5 {
                [0.155, 0.256, 0.177, 0.257, 0.155][index]
            } else {
                [0.2434, 0.193, 0.262, 0.3016][index]
            }))
            .flex_none(),
        );
    }
    row
}

fn use_for(lap: &ValidityLap, family: CorrectionFamily) -> Option<&FamilyUse> {
    lap.family_use.iter().find(|item| item.family == family)
}

fn use_label(value: Option<&FamilyUse>) -> &'static str {
    match value {
        Some(item) if item.included => "Incluida",
        Some(_) => "Excluida",
        None => "Sin dato",
    }
}

fn family_label(family: CorrectionFamily) -> &'static str {
    match family {
        CorrectionFamily::FuelConsumption => "Combustible",
        CorrectionFamily::VirtualEnergyConsumption => "Energía virtual",
        CorrectionFamily::CombinedStintPaceCurve => "Ritmo",
        CorrectionFamily::TyreDegradation => "Neumáticos",
        CorrectionFamily::SavingCost => "Ahorro",
    }
}

fn short_digest(value: &str) -> &str {
    value.get(..12).unwrap_or(value)
}

fn page_range(len: usize, page: usize) -> std::ops::Range<usize> {
    let start = page.saturating_mul(PAGE_SIZE).min(len);
    start..start.saturating_add(PAGE_SIZE).min(len)
}

fn page_label(range: &std::ops::Range<usize>, total: usize) -> String {
    if range.is_empty() {
        return format!("0 / {total}");
    }
    format!("{}–{} / {total}", range.start + 1, range.end)
}

pub(super) fn primary_action(id: &'static str, label: &str) -> gpui::Stateful<Div> {
    orbit::primary_button(id, "")
        .aria_label(label.to_owned())
        .child(orbit::text(label.to_owned(), 12.0, 600, 0x001c_1719))
}

fn source_progress() -> Div {
    use super::assistant::AssistantStep;
    div()
        .flex()
        .h(px(108.0))
        .flex_none()
        .pl(px(48.0))
        .pr(px(166.0))
        .pt(px(20.0))
        .border_b_1()
        .border_color(rgba(orbit::LINE))
        .bg(rgb(0x0008_090b))
        .children(
            AssistantStep::ALL
                .into_iter()
                .enumerate()
                .map(|(index, step)| {
                    let current = index == 4;
                    div()
                        .relative()
                        .flex_1()
                        .when(current, |item| item.flex_none().w(px(36.0)))
                        .when(!current, |item| {
                            item.child(
                                div()
                                    .absolute()
                                    .left(px(40.0))
                                    .right(px(4.0))
                                    .top(px(17.0))
                                    .h(px(1.0))
                                    .bg(rgba(orbit::LINE_STRONG)),
                            )
                        })
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .items_center()
                                .gap(px(12.0))
                                .w(px(60.0))
                                .ml(px(-12.0))
                                .child(
                                    div()
                                        .flex()
                                        .items_center()
                                        .justify_center()
                                        .size(px(36.0))
                                        .rounded_full()
                                        .border_1()
                                        .border_color(rgb(if current {
                                            orbit::RED
                                        } else {
                                            orbit::CARMINE
                                        }))
                                        .bg(rgb(if current { 0x0008_090b } else { orbit::CARMINE }))
                                        .child(orbit::text(
                                            if current { "5" } else { "✓" },
                                            17.0,
                                            400,
                                            orbit::INK,
                                        )),
                                )
                                .child(
                                    orbit::text(
                                        step.label(),
                                        13.0,
                                        400,
                                        if current { orbit::INK } else { orbit::INK_2 },
                                    )
                                    .whitespace_nowrap()
                                    .pb(px(6.0))
                                    .when(current, |label| {
                                        label.border_b_1().border_color(rgb(orbit::RED))
                                    }),
                                ),
                        )
                }),
        )
}

fn secondary_action(id: &'static str, label: &str) -> gpui::Stateful<Div> {
    orbit::button(id, "")
        .aria_label(label.to_owned())
        .bg(rgb(0x000e_1213))
        .rounded(px(8.0))
        .px(px(14.0))
        .child(orbit::text(label.to_owned(), 12.0, 400, orbit::INK_2))
}

// Orbit no expone tracking negativo; el margen mantiene la escala tipográfica de v5.
pub(super) fn tight_title(title: &str, size: f32, weight: u16, tracking: f32) -> Div {
    div().flex().children(title.chars().map(|letter| {
        orbit::text(letter.to_string(), size, weight, orbit::INK)
            .flex_none()
            .mr(px(-tracking))
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lap_pages_are_bounded_and_empty_sources_have_no_pages() {
        let mut state = State::default();
        assert_eq!(state.page_count(), 0);
        assert_eq!(state.visible_range(), 0..0);
        state.page = 8;
        state.change_page(9);
        assert_eq!(state.page, 0);
        assert_eq!(page_range(12, 0), 0..5);
        assert_eq!(page_range(12, 2), 10..12);
        assert_eq!(page_range(12, 20), 12..12);
        assert_eq!(page_label(&(0..0), 0), "0 / 0");
        assert_eq!(page_label(&(5..10), 12), "6–10 / 12");
        assert_eq!(page_label(&(12..12), 12), "0 / 12");
    }

    #[test]
    fn demo_source_passes_native_revision_and_correction_validation() {
        let demo = crate::demo::strategy_review_demo().expect("fuente demo válida");
        let selected = vec![demo.source.revision.clone()];
        let mut state = State::default();
        state
            .load(demo.label, demo.source, selected, &[])
            .expect("fuente y revisión exactas");
        assert_eq!(state.page_count(), 5);
        state.set_capture_view(0, Some(0), true, false);
        assert_eq!(state.visible_range(), 0..5);
        assert_eq!(state.selected_lap, Some(0));
        assert!(state.advanced);
        assert!(!state.sources_open);
    }

    #[test]
    fn sources_panel_uses_a_loaded_and_validated_source() {
        let demo = crate::demo::strategy_review_demo().expect("fuente demo válida");
        let selected = vec![demo.source.revision.clone()];
        let mut state = State::default();
        state
            .load(demo.label, demo.source, selected, &[])
            .expect("fuente y revisión exactas");
        state.set_capture_view(0, None, false, true);
        assert!(state.sources_open);
        assert_eq!(state.page_count(), 5);
    }

    #[test]
    fn observation_families_keep_the_product_labels() {
        assert_eq!(
            FAMILIES.map(family_label),
            [
                "Combustible",
                "Energía virtual",
                "Ritmo",
                "Neumáticos",
                "Ahorro"
            ]
        );
    }

    #[test]
    fn empty_reason_cannot_create_a_family_correction() {
        let mut state = State::default();
        assert_eq!(
            state
                .apply(true, "  ".into())
                .expect_err("reason is required"),
            "correction_reason_required"
        );
    }
}

// Compone el botón Orbit con texto oscuro explícito; el texto del kit fija hoy INK.
