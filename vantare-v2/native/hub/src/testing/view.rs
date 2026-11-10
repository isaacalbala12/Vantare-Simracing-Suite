use super::{
    diagnostic::{Diagnostic, Module, Observed},
    store,
};
use crate::orbit;
use crate::services::{protocol::Command, view::Remote};
use gpui::{Context, Entity, IntoElement, Render, Window, div, prelude::*, px, rgba};
#[cfg(any(feature = "parity-capture", test))]
use std::path::Path;
use std::{path::PathBuf, time::Instant};

#[derive(Clone, Copy, PartialEq, Eq)]
enum ReportView {
    Triage,
    Compose,
    List,
}
impl ReportView {
    fn compose(tester: bool) -> Self {
        if tester { Self::Triage } else { Self::Compose }
    }
}

pub struct Testing {
    pub(super) adapt: orbit::Adapt,
    pub(super) remote: Entity<Remote>,
    tabs: Entity<orbit::Choice>,
    local_open: bool,
    report_view: ReportView,
    expanded_receipt: Option<String>,
    pub observed: Observed,
    data: PathBuf,
    diagnostic: Option<Diagnostic>,
    busy: bool,
    status: String,
    error: Option<String>,
    channel_label: String,
    pub(super) participation_form: super::participation::Form,
}
impl Testing {
    pub(crate) fn show_reports(&mut self, cx: &mut Context<Self>) {
        self.report_view = ReportView::List;
        self.local_open = false;
        self.tabs.update(cx, |tabs, cx| {
            tabs.state.selected = Some(2);
            cx.notify();
        });
        self.remote.update(cx, |remote, cx| {
            remote.participation_request(Command::TestingRefresh, cx);
        });
        cx.notify();
    }
    pub(crate) fn set_adapt(&mut self, adapt: orbit::Adapt, cx: &mut Context<Self>) {
        if self.adapt != adapt {
            self.adapt = adapt;
            cx.notify();
        }
    }
    pub fn new(
        data: PathBuf,
        remote: Entity<Remote>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Self {
        #[cfg(feature = "parity-capture")]
        let selected_tab = selected_capture_tab(&data).unwrap_or(0);
        #[cfg(not(feature = "parity-capture"))]
        let selected_tab = 0;
        #[cfg(feature = "parity-capture")]
        let report_view = if selected_capture_list(&data) {
            ReportView::List
        } else if selected_capture_triage(&data) {
            ReportView::Triage
        } else {
            ReportView::Compose
        };
        #[cfg(not(feature = "parity-capture"))]
        let report_view = ReportView::compose(remote.read(cx).navigation_access().tester);
        #[cfg(feature = "parity-capture")]
        let local_open = selected_capture_diagnostic(&data);
        #[cfg(not(feature = "parity-capture"))]
        let local_open = false;
        let channel_label = super::model::channel_label(Some(crate::product::CHANNEL));
        let tabs = cx.new(|cx| {
            orbit::Choice::new(
                "Vistas de Testing Center",
                orbit::ChoiceKind::Tabs,
                super::model::VIEWS
                    .into_iter()
                    .map(orbit::OptionItem::new)
                    .collect(),
                Some(selected_tab),
                window,
                cx,
            )
        });
        cx.subscribe(&tabs, |this, _, _: &orbit::ChoiceChanged, cx| {
            this.local_open = false;
            cx.notify();
        })
        .detach();
        cx.observe(&remote, |_, _, cx| cx.notify()).detach();
        #[cfg(feature = "parity-capture")]
        let capture_questionnaire = if matches!(selected_capture_tab(&data), Some(1 | 3)) {
            remote.update(cx, |remote, _| {
                remote.participation = serde_json::from_str(include_str!(
                    "../../reference/fixtures/testing-participation.json"
                ))
                .expect("explicit QA fixture");
                remote.participation_message =
                    "QA · ejemplo de participación, sin backend ni envío".into();
            });
            (selected_tab == 1).then(|| "15350000-0000-0000-0000-000000000001".into())
        } else {
            None
        };
        #[cfg(not(feature = "parity-capture"))]
        let capture_questionnaire = None;
        Self {
            adapt: orbit::Adapt::default(),
            remote,
            tabs,
            local_open,
            report_view,
            expanded_receipt: None,
            observed: Observed::default(),
            data,
            diagnostic: None,
            busy: false,
            status: "Diagnóstico local; el borrador se guarda protegido en Services.".into(),
            error: None,
            channel_label,
            participation_form: super::participation::Form::new(capture_questionnaire, cx),
        }
    }
    fn outcome(
        &mut self,
        result: Result<(), crate::files::Error>,
        message: &str,
        cx: &mut Context<Self>,
    ) {
        self.error = result.err().map(|error| {
            self.observed.error(Module::TestingCenter, error.kind());
            if super::diagnostic::error_code(error.kind()) == super::diagnostic::ErrorCode::Conflict {
                format!("Conflicto al guardar la exportación: {error}. Elige otro destino.")
            } else if error.kind() == crate::files::Kind::InvalidInput {
                "El informe supera los límites indicados o contiene caracteres de control. Reduce el texto antes de exportar.".into()
            } else { format!("No se pudo completar la exportación: {error}. Se conservan los archivos anteriores.") }
        });
        if self.error.is_none() {
            self.status = message.into();
        }
        cx.notify();
    }
    fn refresh(&mut self, cx: &mut Context<Self>) {
        if self.busy {
            return;
        }
        self.busy = true;
        let observed = self.observed.clone();
        let data = self.data.clone();
        let task = cx.background_executor().spawn(async move {
            let exe = std::env::current_exe().map_err(|_| "No se pudo localizar el Hub")?;
            let root = exe
                .parent()
                .ok_or("No se pudo localizar la carpeta de Vantare")?;
            Ok::<_, &str>(Diagnostic::collect(root, &data, &observed, Instant::now()))
        });
        cx.spawn(async move |this, cx| {
            let result = task.await;
            if let Err(error) = this.update(cx, |this, cx| {
                this.busy = false;
                match result {
                    Ok(diagnostic) => {
                        this.diagnostic = Some(diagnostic);
                        this.error = None;
                        this.status =
                            "Diagnóstico preparado en memoria. Revisa antes de exportar.".into();
                    }
                    Err(_) => this.error = Some("No se pudo preparar el diagnóstico local".into()),
                }
                cx.notify();
            }) {
                eprintln!("Testing Center cerrado durante el diagnóstico: {error}");
            }
        })
        .detach();
        cx.notify();
    }
    fn export(&mut self, cx: &mut Context<Self>) {
        let Some(diagnostic) = &self.diagnostic else {
            self.error = Some("Prepara y revisa el diagnóstico antes de exportar".into());
            cx.notify();
            return;
        };
        let fields = self.remote.read(cx).editor.fields_snapshot(cx);
        let bytes = match store::export_bytes(&fields, diagnostic) {
            Ok(bytes) => bytes,
            Err(error) => {
                self.outcome(Err(error), "", cx);
                return;
            }
        };
        let picker = cx.prompt_for_new_path(&self.data, Some("vantare-report.json"));
        cx.spawn(async move |this, cx| {
            let response = picker.await;
            let result = match response {
                Ok(Ok(Some(path))) => store::export(&path, &bytes),
                Ok(Ok(None)) => return,
                _ => Err("Selector local no disponible".into()),
            };
            if let Err(error) = this.update(cx, |this, cx| {
                this.outcome(
                    result,
                    "JSON local exportado. Puedes adjuntarlo a mano; no se ha enviado nada.",
                    cx,
                );
            }) {
                eprintln!("Testing Center cerrado durante la exportación: {error}");
            }
        })
        .detach();
    }
    fn diagnostic(&self, cx: &gpui::App) -> gpui::Div {
        let mut body = orbit::card_body();
        if let Some(diagnostic) = &self.diagnostic {
            body = body.child(orbit::text(
                diagnostic.summary(),
                12.5,
                400,
                orbit::ink_2(cx),
                cx,
            ));
            for binary in &diagnostic.binaries {
                body = body.child(orbit::setting_row(
                    binary.name,
                    binary.state,
                    orbit::text(
                        binary
                            .sha256
                            .clone()
                            .unwrap_or_else(|| "Hash no disponible".into()),
                        11.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ),
                    cx,
                ));
            }
            for error in &diagnostic.section_errors {
                body = body.child(orbit::setting_row(
                    error.module.label(),
                    "Último error observado (sin mensaje libre)",
                    orbit::text(format!("{:?}", error.code), 12.0, 400, orbit::ink_2(cx), cx),
                    cx,
                ));
            }
            body = body.child(orbit::text("Studio y Análisis: error no instrumentado. Ausencia de error no demuestra que una sección funcione.", 12.0, 400, orbit::ink_3(cx), cx));
            // La vista previa es exactamente el payload que genera el exportador.
            let fields = self.remote.read(cx).editor.fields_snapshot(cx);
            if let Ok(bytes) = store::export_bytes(&fields, diagnostic) {
                body = body
                    .child(orbit::eyebrow("Contenido del JSON exportable", cx))
                    .child(orbit::text(
                        String::from_utf8_lossy(&bytes).into_owned(),
                        11.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ));
            }
        } else {
            body = body.child(orbit::text(
                "Prepara el diagnóstico para ver la lista blanca de datos exportables.",
                13.0,
                400,
                orbit::ink_2(cx),
                cx,
            ));
        }
        orbit::card("Informe de diagnóstico", cx).child(body)
    }
}

#[cfg(any(feature = "parity-capture", test))]
fn selected_capture_tab(data_dir: &Path) -> Option<usize> {
    let capture_name = data_dir.parent()?.file_name()?.to_str()?;
    let mut parts = capture_name.splitn(3, '-');
    let process_id = parts.next()?.parse::<u32>().ok()?;
    let _started_at = parts.next()?.parse::<u128>().ok()?;
    if process_id != std::process::id() {
        return None;
    }
    let screen = parts.next()?;
    match screen {
        "testing-center-resumen" => Some(0),
        "testing-center-informe"
        | "testing-center-detalle"
        | "testing-center-mis-reportes"
        | "testing-center-triage"
        | "testing-center-diagnostico" => Some(2),
        "testing-center-validar" | "testing-center-cuestionarios" => Some(1),
        "testing-center-comunidad" => Some(3),
        _ => None,
    }
}

impl Testing {
    fn receipt_rows(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let remote = self.remote.read(cx);
        let mut rows = div()
            .id("testing-receipts")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(10.0));
        if remote.report_receipts.is_empty() {
            rows = rows.child(orbit::text(
                "Aún no has enviado informes en esta sesión.",
                14.0,
                400,
                orbit::ink_2(cx),
                cx,
            ));
        }
        for (index, (fields, receipt)) in remote.report_receipts.iter().enumerate() {
            let id = receipt.report_id.clone();
            let key_id = id.clone();
            let expanded = self.expanded_receipt.as_ref() == Some(&id);
            let title = if fields.action_text.trim().is_empty() {
                "Título no disponible"
            } else {
                &fields.action_text
            };
            let row = div()
                .id(("testing-receipt", index))
                .cursor_pointer()
                .role(gpui::Role::Button)
                .aria_label(format!("Detalle de {title}"))
                .tab_index(0)
                .flex()
                .flex_col()
                .min_w_0()
                .gap(px(6.0))
                .py(px(10.0))
                .border_b_1()
                .border_color(rgba(orbit::line_row(cx)))
                .child(orbit::text(title.to_owned(), 14.0, 600, orbit::ink(cx), cx))
                .child(
                    orbit::meta(&receipt.report_id, 10.0, orbit::ink_3(cx), cx)
                        .overflow_hidden()
                        .text_ellipsis(),
                )
                .child(orbit::text(
                    format!(
                        "{} · {} · {}",
                        super::model::MODULES
                            .iter()
                            .find(|(key, _)| *key == fields.module)
                            .map_or("Sin determinar", |(_, label)| *label),
                        orbit::activity_time(
                            &receipt.created_at,
                            chrono::Local::now().fixed_offset()
                        ),
                        super::model::receipt_status(&receipt.report_state)
                    ),
                    12.0,
                    400,
                    orbit::ink_2(cx),
                    cx,
                ))
                .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
                    if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                        this.expanded_receipt = if this.expanded_receipt.as_ref() == Some(&key_id) {
                            None
                        } else {
                            Some(key_id.clone())
                        };
                        cx.stop_propagation();
                        cx.notify();
                    }
                }))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.expanded_receipt = if this.expanded_receipt.as_ref() == Some(&id) {
                        None
                    } else {
                        Some(id.clone())
                    };
                    cx.notify();
                }));
            rows = rows.child(row);
            if expanded {
                rows = rows.child(orbit::text("El texto privado no se conserva en esta lista. El recibo confirma el envío; no consulta cambios posteriores.", 13.0, 400, orbit::ink_2(cx), cx))
                    .child(orbit::text("Conversación · Próximamente", 12.0, 400, orbit::ink_3(cx), cx))
                    .child(orbit::pending_button("testing-also-happens", "A mí también me pasa · Próximamente", "El servicio nativo aún no permite apoyar otro informe.", cx));
            }
        }
        rows
    }
    pub(super) fn session_reports_panel(&self, cx: &mut Context<Self>) -> gpui::Div {
        let rows = self.receipt_rows(cx);
        let remote = self.remote.read(cx);
        let triage_rows = remote
            .participation
            .contributions
            .iter()
            .map(|c| {
                let state = super::model::session_contribution_status(&c.state);
                orbit::text(
                    format!("{} · {state}", c.title),
                    13.0,
                    400,
                    orbit::ink_2(cx),
                    cx,
                )
            })
            .collect::<Vec<_>>();
        let ready = remote.participation_ready();
        orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .min_w_0()
            .child(orbit::neo_header(
                "Tus informes, paso a paso",
                "v-testing",
                cx,
            ))
            .child(rows)
            .children(triage_rows)
            .child(
                orbit::small_button("testing-triage-refresh", "Recargar informes", cx)
                    .tab_stop(ready)
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.remote.update(cx, |r, cx| {
                            r.participation_request(Command::TestingRefresh, cx);
                        });
                    })),
            )
            .child(orbit::text(
                "Recibos de esta sesión. Estado al enviar; seguimiento posterior próximamente.",
                11.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
    }
    fn reports(&self, cx: &mut Context<Self>) -> gpui::Div {
        let adapt = self.adapt;
        let action = orbit::button(
            "testing-compose",
            if self.report_view == ReportView::List {
                "Nuevo informe"
            } else {
                "Ver mis informes"
            },
            cx,
        )
        .on_click(cx.listener(|this, _, _, cx| {
            this.report_view = if this.report_view == ReportView::List {
                ReportView::compose(this.remote.read(cx).navigation_access().tester)
            } else {
                ReportView::List
            };
            if this.report_view == ReportView::List {
                this.remote.update(cx, |remote, cx| {
                    remote.participation_request(Command::TestingRefresh, cx);
                });
            }
            cx.notify();
        }));
        let mut body = div()
            .flex_1()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(adapt.gap()))
            .child(
                div()
                    .flex_none()
                    .flex()
                    .justify_between()
                    .gap(px(10.0))
                    .child(orbit::text("Informes", 18.0, 600, orbit::ink(cx), cx))
                    .child(action)
                    .child(
                        orbit::small_button("testing-legacy-captures", "Informe con capturas", cx)
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.report_view = ReportView::Compose;
                                cx.notify();
                            })),
                    ),
            );
        if self.report_view == ReportView::Triage {
            let ready = self.remote.read(cx).participation_ready();
            body = body.child(
                div()
                    .id("testing-triage-scroll")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(self.remote.update(cx, |r, cx| r.triage.render(ready, cx))),
            );
        } else if self.report_view == ReportView::Compose {
            body = if self.remote.read(cx).navigation_access().tester {
                body.child(
                    div()
                        .id("testing-composer-scroll")
                        .flex_1()
                        .min_h_0()
                        .overflow_y_scroll()
                        .child(self.remote.update(cx, |remote, cx| {
                            remote.testing(adapt.center_width() < 1050.0, cx)
                        })),
                )
            } else {
                body.child(self.community(cx))
            };
        } else {
            body = body.child(self.reports_panel(cx));
        }
        body
    }
    pub(crate) fn topbar_controls(&self) -> Entity<orbit::Choice> {
        self.tabs.clone()
    }
    pub(crate) fn rail_sections(&self, cx: &mut Context<Self>) -> Vec<orbit::RailSection> {
        let adapt = self.adapt;
        let tab = if self.remote.read(cx).navigation_access().tester {
            self.tabs.read(cx).state.selected.unwrap_or(0)
        } else {
            2
        };
        let note = |text: &str| orbit::text(text.to_owned(), 13.0, 400, orbit::ink_3(cx), cx);
        let reports = &self.remote.read(cx).participation.contributions;
        let count = reports.len();
        let accepted = reports
            .iter()
            .filter(|report| report.state == "accepted")
            .count();
        let fixed = reports
            .iter()
            .filter(|report| report.state == "fixed")
            .count();
        match tab {
            1 => vec![
                orbit::RailSection::new(
                    "Abiertos y cerrados",
                    "v-testing",
                    note(&format!(
                        "{} cuestionarios cargados (últimos 10)",
                        self.remote.read(cx).participation.questionnaires.len()
                    )),
                ),
                orbit::RailSection::new(
                    "Resultados",
                    "pulse",
                    note(
                        "Tus respuestas son privadas; el equipo revisa el feedback de cada versión.",
                    ),
                ),
            ],
            2 => {
                let mut sections = vec![
                    orbit::RailSection::new(
                        "Tus informes",
                        "v-testing",
                        note(&format!(
                            "{count} informes cargados · {accepted} aceptados · {fixed} arreglados · {}",
                            self.channel_label
                        )),
                    ),
                    orbit::RailSection::new(
                        "Conversación",
                        "v-chat",
                        note(
                            "Respuestas, informes parecidos y apoyo a otros informes · Próximamente",
                        ),
                    ),
                ];
                if adapt.show_optional() {
                    sections.push(orbit::RailSection::new("Un buen informe", "v-testing", note("Cuenta qué hiciste, qué esperabas y qué ocurrió. Añade una captura si ayuda y revisa los datos personales.")));
                }
                sections
            }
            _ => {
                let mut sections = vec![orbit::RailSection::new(
                    "Tu participación",
                    "pulse",
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(10.0))
                        .child(note(&format!(
                            "{} contribuciones cargadas (últimas 20)",
                            self.remote.read(cx).participation.contributions.len()
                        )))
                        .child(note(&format!("{count} recibos de informes en esta sesión"))),
                )];
                if adapt.show_optional() {
                    sections.push(orbit::RailSection::new(
                        "Insignias",
                        "v-testing",
                        note("La primera versión no asigna insignias ni niveles."),
                    ));
                }
                sections.push(orbit::RailSection::new(
                    "Esta semana",
                    "clock",
                    note("No hay estadísticas globales publicadas."),
                ));
                sections
            }
        }
    }
}
impl Render for Testing {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let generation = self.remote.read(cx).participation_generation;
        if self.participation_form.generation != generation {
            self.participation_form = super::participation::Form::new(None, cx);
            self.participation_form.generation = generation;
        }
        let tab = if self.remote.read(cx).navigation_access().tester {
            self.tabs.read(cx).state.selected.unwrap_or(0)
        } else {
            2
        };
        let content = match tab {
            1 => self.questionnaires(cx),
            2 => self.reports(cx),
            3 => self.community(cx),
            _ => self.summary(cx),
        };
        div()
            .id("testing-center")
            .flex_1()
            .min_h_0()
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(if self.local_open {
                div()
                    .id("testing-tools-scroll")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(self.local_tools(cx))
                    .into_any_element()
            } else {
                content.into_any_element()
            })
    }
}
impl Testing {
    pub(crate) fn page_header(&self, adapt: orbit::Adapt, cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .justify_between()
            .flex_wrap()
            .gap(px(12.0))
            .child(
                orbit::neo_page_header(
                    if self.remote.read(cx).navigation_access().tester { "Testing Center" } else { "Informes" },
                    "Cuéntanos qué falla o qué mejorarías. Cada informe llega al equipo de Vantare.",
                    adapt,
                    cx,
                )
                .flex_1(),
            )
            .child(
                orbit::button("testing-tools", "Diagnóstico local", cx).on_click(
                    cx.listener(|this, _, _, cx| {
                        this.local_open = !this.local_open;
                        cx.notify();
                    }),
                ),
            )
    }
    fn local_tools(&self, cx: &mut Context<Self>) -> gpui::Div {
        div().flex().flex_col().gap(gpui::px(orbit::GUTTER / 2.0)).child(orbit::callout(
            "El informe de diagnóstico no incluye el texto privado y no se adjunta automáticamente al envío.",
         cx))
        .child(
            div()
                .flex()
                .flex_wrap()
                .gap(gpui::px(orbit::GUTTER / 2.0))
                .child(
                    orbit::button(
                        "testing-prepare",
                        if self.busy {
                            "Preparando…"
                        } else {
                            "Preparar diagnóstico"
                        },
                     cx)
                    .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))),
                )
                .child(
                    orbit::button("testing-export", "Exportar JSON local", cx)
                        .on_click(cx.listener(|this, _, _, cx| this.export(cx))),
                ),
        )
        .child(orbit::text(
            self.status.clone(),
            12.5,
            400,
            orbit::ink_2(cx),
         cx))
        .when_some(self.error.clone(), |view, error| {
            view.child(orbit::callout(error, cx))
        })
        .child(self.diagnostic(cx))
    }
}

impl Testing {
    fn pending_view(title: &str, message: &str, cx: &gpui::App) -> gpui::Div {
        orbit::neo_card(cx)
            .flex_none()
            .min_w_0()
            .child(orbit::neo_header(title, "v-testing", cx))
            .child(orbit::text(
                message.to_owned(),
                14.0,
                400,
                orbit::ink_2(cx),
                cx,
            ))
    }
    fn summary(&self, cx: &mut Context<Self>) -> gpui::Div {
        let adapt = self.adapt;
        div().flex_1().min_h_0().flex().flex_col().min_w_0().gap(px(adapt.gap()))
            .child(orbit::hero_surface(cx).flex_none().p(px(if adapt.show_notes() { 28.0 } else { 20.0 })).gap(px(12.0))
                .child(orbit::meta("CUESTIONARIOS POR VERSIÓN", 11.0, orbit::ink_3(cx), cx))
                .child(orbit::display("Tu experiencia cuenta", if adapt.show_notes() { 36.0 } else { 28.0 }, orbit::ink(cx), cx))
                .when(adapt.show_optional(), |hero| hero.child(orbit::text("Consulta los cuestionarios publicados y comparte una contribución. Tus respuestas son privadas.", 14.0, 400, orbit::ink_2(cx), cx)))
                .child(orbit::primary_button("testing-summary-report", "Nuevo informe", cx).self_start()
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.report_view = ReportView::compose(this.remote.read(cx).navigation_access().tester);
                        this.local_open = false;
                        this.tabs.update(cx, |tabs, cx| { tabs.state.selected = Some(2); cx.notify(); });
                        cx.notify();
                    }))))
            .when(adapt.show_optional(), |page| page.child(div().flex_none().flex().gap(px(adapt.gap())).min_w_0()
                .child(Self::pending_view("Pendiente para ti", "Las solicitudes de respuesta y validación estarán disponibles próximamente.", cx).flex_1())
                .child(Self::pending_view("Gracias a los probadores", "El reconocimiento de contribuciones estará disponible próximamente.", cx).flex_1())))
            .child(self.reports_panel(cx))
    }
}

#[cfg(any(feature = "parity-capture", test))]
fn selected_capture_diagnostic(data_dir: &Path) -> bool {
    selected_capture_tab(data_dir) == Some(2)
        && data_dir
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with("-testing-center-diagnostico"))
}

#[cfg(any(feature = "parity-capture", test))]
fn selected_capture_triage(data_dir: &Path) -> bool {
    selected_capture_tab(data_dir) == Some(2)
        && data_dir
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with("-testing-center-triage"))
}

#[cfg(any(feature = "parity-capture", test))]
fn selected_capture_list(data_dir: &Path) -> bool {
    selected_capture_tab(data_dir) == Some(2)
        && data_dir
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with("-testing-center-mis-reportes"))
}

#[cfg(test)]
mod capture_view_tests {
    use super::selected_capture_tab;

    #[test]
    fn testing_bank_fixture_grants_tester_access_only_in_the_local_ipc_reply() {
        let fixture: serde_json::Value =
            serde_json::from_str(include_str!("../../reference/fixtures/testing-access.json"))
                .unwrap();
        let policy: vantare_ipc::control::Policy =
            serde_json::from_value(fixture["core_policy"].clone()).unwrap();
        assert!(policy.tester && policy.calendar && policy.state.permits_access());
        let reply: crate::services::protocol::Reply =
            serde_json::from_value(fixture["AccountPoll"].clone()).unwrap();
        assert!(matches!(
            reply,
            crate::services::protocol::Reply::Account {
                session: vantare_ipc::services_protocol::Session::SignedIn,
                ..
            }
        ));
    }

    #[test]
    fn capture_list_isolated_from_composer_and_from_other_processes() {
        let pid = std::process::id();
        let diagnostic = std::env::temp_dir()
            .join(format!("{pid}-0-testing-center-diagnostico"))
            .join("data");
        assert!(super::selected_capture_diagnostic(&diagnostic));
        let other_diagnostic = std::env::temp_dir()
            .join(format!(
                "{}-0-testing-center-diagnostico",
                pid.wrapping_add(1)
            ))
            .join("data");
        assert!(!super::selected_capture_diagnostic(&other_diagnostic));
        let triage = std::env::temp_dir()
            .join(format!("{pid}-0-testing-center-triage"))
            .join("data");
        assert!(super::selected_capture_triage(&triage));
        let other_triage = std::env::temp_dir()
            .join(format!("{}-0-testing-center-triage", pid.wrapping_add(1)))
            .join("data");
        assert!(!super::selected_capture_triage(&other_triage));
        let list = std::env::temp_dir()
            .join(format!("{pid}-1700000000000-testing-center-mis-reportes"))
            .join("data");
        assert!(super::selected_capture_list(&list));
        let composer = std::env::temp_dir()
            .join(format!("{pid}-1700000000000-testing-center-informe"))
            .join("data");
        assert!(!super::selected_capture_list(&composer));
        let other = std::env::temp_dir()
            .join(format!(
                "{}-1700000000000-testing-center-mis-reportes",
                pid.wrapping_add(1)
            ))
            .join("data");
        assert!(!super::selected_capture_list(&other));
    }

    #[test]
    fn capture_selects_its_testing_center_tab_only_for_the_current_process() {
        let process_id = std::process::id();
        for (screen, tab) in [
            ("testing-center-resumen", 0),
            ("testing-center-cuestionarios", 1),
            ("testing-center-comunidad", 3),
            ("testing-center-informe", 2),
            ("testing-center-detalle", 2),
            ("testing-center-validar", 1),
            ("testing-center-mis-reportes", 2),
        ] {
            let root = std::env::temp_dir()
                .join("vantare-hub-parity")
                .join(format!("{process_id}-1700000000000-{screen}"));
            assert_eq!(selected_capture_tab(&root.join("data")), Some(tab));
        }

        let other_process = process_id.wrapping_add(1);
        let root = std::env::temp_dir()
            .join("vantare-hub-parity")
            .join(format!(
                "{other_process}-1700000000000-testing-center-validar"
            ));
        assert_eq!(selected_capture_tab(&root.join("data")), None);
    }
}
