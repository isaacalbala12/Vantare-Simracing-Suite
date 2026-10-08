use super::{
    diagnostic::{Diagnostic, Module, Observed},
    store::{self, Draft, LABELS, Store},
};
use crate::orbit::{self, Input};
use crate::services::{protocol::Command, view::Remote};
use gpui::{Context, Entity, IntoElement, Render, Window, div, prelude::*, px, rgba};
#[cfg(any(feature = "parity-capture", test))]
use std::path::Path;
use std::{path::PathBuf, time::Instant};

pub struct Testing {
    remote: Entity<Remote>,
    tabs: Entity<orbit::Choice>,
    local_module: Entity<orbit::Choice>,
    local_open: bool,
    composing: bool,
    expanded_receipt: Option<String>,
    pub observed: Observed,
    store: Store,
    data: PathBuf,
    diagnostic: Option<Diagnostic>,
    inputs: [Entity<Input>; 4],
    busy: bool,
    diagnostic_tab: bool,
    status: String,
    error: Option<String>,
    channel_label: String,
}
impl Testing {
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
        cx.subscribe(&tabs, |_, _, _: &orbit::ChoiceChanged, cx| {
            cx.notify();
        })
        .detach();
        cx.observe(&remote, |_, _, cx| cx.notify()).detach();
        let mut store = Store::new(&data);
        let error = store.reload().err().map(|_| {
            "No se pudo cargar el borrador. Se conserva el archivo; recarga antes de guardar."
                .into()
        });
        let local_module = cx.new(|cx| {
            orbit::Choice::new(
                "Sección del borrador privado",
                orbit::ChoiceKind::Dropdown,
                Module::ALL
                    .iter()
                    .map(|module| orbit::OptionItem::new(module.label()))
                    .collect(),
                Module::ALL
                    .iter()
                    .position(|module| *module == store.draft.module),
                window,
                cx,
            )
        });
        cx.subscribe(
            &local_module,
            |this, _, event: &orbit::ChoiceChanged, cx| {
                if let Some(module) = Module::ALL.get(event.0) {
                    this.store.draft.module = *module;
                    cx.notify();
                }
            },
        )
        .detach();
        Self {
            remote,
            tabs,
            local_module,
            local_open: false,
            composing: true,
            expanded_receipt: None,
            observed: Observed::default(),
            inputs: Self::inputs(&store.draft, cx),
            store,
            data,
            diagnostic: None,
            busy: false,
            diagnostic_tab: false,
            status: "Borrador privado local. Guarda para continuar más tarde.".into(),
            error,
            channel_label,
        }
    }
    pub fn persist(&mut self) -> Result<(), String> {
        if self.store.dirty() {
            self.store.save().map_err(|_| "No se pudo guardar el borrador de Testing Center; conserva la ventana y revisa el conflicto/acceso local".into())
        } else {
            Ok(())
        }
    }
    fn outcome(&mut self, result: Result<(), String>, message: &str, cx: &mut Context<Self>) {
        self.error = result.err().map(|error| {
            self.observed.error(Module::TestingCenter, &error);
            if super::diagnostic::error_code(&error) == super::diagnostic::ErrorCode::Conflict {
                "Conflicto: el archivo cambió o ya existe. Tus cambios siguen aquí; recarga el borrador o elige otro destino.".into()
            } else if error == "Borrador inválido o fuera de límites" {
                "El borrador supera los límites indicados o contiene caracteres de control. Reduce el texto antes de guardar/exportar.".into()
            } else { "No se pudo completar la operación local. Se conservan los cambios y archivos anteriores.".into() }
        });
        if self.error.is_none() {
            self.status = message.into();
        }
        cx.notify();
    }
    fn save(&mut self, cx: &mut Context<Self>) {
        let result = self.store.save();
        self.outcome(result, "Borrador guardado de forma atómica.", cx);
    }
    fn reload(&mut self, cx: &mut Context<Self>) {
        let result = self.store.reload();
        if result.is_ok() {
            self.inputs = Self::inputs(&self.store.draft, cx);
            self.sync_local_module(cx);
        }
        self.outcome(result, "Borrador recargado desde disco.", cx);
    }
    fn sync_local_module(&mut self, cx: &mut Context<Self>) {
        let selected = Module::ALL
            .iter()
            .position(|module| *module == self.store.draft.module);
        self.local_module.update(cx, |control, cx| {
            control.state.selected = selected;
            control.state.close();
            cx.notify();
        });
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
                        this.diagnostic_tab = true;
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
        let bytes = match store::export_bytes(&self.store.draft, diagnostic) {
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
    fn inputs(draft: &Draft, cx: &mut Context<Self>) -> [Entity<Input>; 4] {
        std::array::from_fn(|index| {
            let input =
                cx.new(|cx| Input::multiline(draft.fields[index].clone(), LABELS[index], cx));
            cx.observe(&input, move |this, input, cx| {
                // El campo compartido conserva selección/IME; los límites del informe
                // se validan al guardar/exportar, sin truncar silenciosamente una edición.
                this.store.draft.fields[index].clone_from(&input.read(cx).value);
                cx.notify();
            })
            .detach();
            input
        })
    }
    fn form(&self, cx: &mut Context<Self>) -> gpui::Div {
        let mut body = orbit::card_body().child(orbit::setting_row(
            "Sección afectada",
            "Selecciona la sección del informe",
            self.local_module.clone(),
            cx,
        ));
        for (index, label) in LABELS.into_iter().enumerate() {
            body = body.child(orbit::setting_row(
                label,
                if index == 3 {
                    "Texto privado · máximo 4096 bytes"
                } else {
                    "Texto privado · máximo 2048 bytes"
                },
                div()
                    .w(gpui::px(orbit::COLUMN_W * 1.5))
                    .min_w_0()
                    .child(self.inputs[index].clone()),
                cx,
            ));
        }
        orbit::card("Borrador de informe", cx).child(body).child(
            orbit::card_body().child(
                div()
                    .flex()
                    .gap(gpui::px(orbit::GUTTER / 2.0))
                    .child(
                        orbit::button("testing-save", "Guardar borrador", cx)
                            .on_click(cx.listener(|this, _, _, cx| this.save(cx))),
                    )
                    .child(
                        orbit::button("testing-reload", "Recargar y descartar cambios", cx)
                            .on_click(cx.listener(|this, _, _, cx| this.reload(cx))),
                    )
                    .child(
                        orbit::button("testing-new", "Vaciar formulario", cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.store.draft = Draft::new();
                                this.inputs = Self::inputs(&this.store.draft, cx);
                                this.sync_local_module(cx);
                                cx.notify();
                            }),
                        ),
                    ),
            ),
        )
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
            if let Ok(bytes) = store::export_bytes(&self.store.draft, diagnostic) {
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
        "testing-center-informe" | "testing-center-detalle" => Some(2),
        "testing-center-validar" | "testing-center-cuestionarios" => Some(1),
        "testing-center-comunidad" => Some(3),
        "testing-center-mis-reportes" => Some(2),
        _ => None,
    }
}

impl Testing {
    fn reports_panel(&self, cx: &mut Context<Self>) -> gpui::Div {
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
            let expanded = self.expanded_receipt.as_ref() == Some(&id);
            let title = if fields.action_text.trim().is_empty() {
                "Título no disponible"
            } else {
                &fields.action_text
            };
            let row = div()
                .id(("testing-receipt", index))
                .cursor_pointer()
                .flex()
                .flex_col()
                .min_w_0()
                .gap(px(6.0))
                .py(px(10.0))
                .border_b_1()
                .border_color(rgba(orbit::line_row(cx)))
                .child(orbit::text(title.to_owned(), 14.0, 600, orbit::ink(cx), cx))
                .child(
                    orbit::meta(receipt.report_id.clone(), 10.0, orbit::ink_3(cx), cx)
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
                rows = rows
                    .child(orbit::text(
                        format!(
                            "Qué esperabas: {}\nQué ocurrió: {}\nContexto: {}",
                            fields.expected_text, fields.observed_text, fields.context_text
                        ),
                        13.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    ))
                    .child(orbit::text(
                        "Conversación · Próximamente",
                        12.0,
                        400,
                        orbit::ink_3(cx),
                        cx,
                    ));
            }
        }
        orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .min_w_0()
            .child(orbit::neo_header(
                "Tus informes, paso a paso",
                "v-testing",
                cx,
            ))
            .child(orbit::text(
                "Recibido → Reproducido → En arreglo → Arreglado en nightly.N",
                11.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
            .child(rows)
            .child(orbit::text(
                "Recibos de esta sesión. Estado al enviar; seguimiento posterior próximamente.",
                11.0,
                400,
                orbit::ink_3(cx),
                cx,
            ))
    }
    fn reports(&self, cx: &mut Context<Self>) -> gpui::Div {
        let adapt = *cx.global::<orbit::Adapt>();
        let action = orbit::button(
            "testing-compose",
            if self.composing {
                "Ver mis informes"
            } else {
                "Nuevo informe"
            },
            cx,
        )
        .on_click(cx.listener(|this, _, _, cx| {
            this.composing = !this.composing;
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
                    .child(action),
            );
        if self.composing {
            body = body.child(
                div()
                    .id("testing-composer-scroll")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(self.remote.update(cx, |remote, cx| {
                        remote.editor.render(adapt.center_width() < 1050.0, cx)
                    })),
            );
        } else {
            body = body.child(self.reports_panel(cx));
        }
        body
    }
    pub(crate) fn topbar_controls(&self) -> Entity<orbit::Choice> {
        self.tabs.clone()
    }
    pub(crate) fn context_column(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let count = self.remote.read(cx).report_receipts.len();
        orbit::neo_context_column("testing-context", cx)
            .pt(px(cx.global::<orbit::design::Tokens>().geometry.gutter))
            .child(orbit::neo_card(cx).flex_none().child(orbit::neo_header("Tus informes", "pulse", cx))
                .child(orbit::text(format!("{count} informes enviados · canal {}", self.channel_label), 13.0, 500, orbit::ink_2(cx), cx)))
            .child(orbit::neo_card(cx).flex_none().child(orbit::neo_header("Conversación", "v-chat", cx))
                .child(orbit::text("Próximamente podrás consultar respuestas y conversar sobre tu informe.", 13.0, 400, orbit::ink_3(cx), cx)))
            .child(orbit::neo_card(cx).flex_none().child(orbit::neo_header("Un buen informe", "v-testing", cx))
                .children([
                    "Cuenta qué esperabas y qué pasó.",
                    "Añade una captura: se comprime antes de enviar. Revisa los datos personales.",
                    "Si se repite, indica cuántas veces y en qué sesión.",
                    "Las sugerencias también cuentan: dinos para qué las usarías."
                ].into_iter().enumerate().map(|(index, tip)| div().flex().items_start().gap(px(10.0)).py(px(8.0))
                    .child(orbit::pill(&(index + 1).to_string(), orbit::Tone::Accent, cx).flex_none())
                    .child(orbit::text(tip, 13.0, 400, orbit::ink_2(cx), cx).flex_1().min_w_0()))))
    }
}
impl Render for Testing {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let tab = self.tabs.read(cx).state.selected.unwrap_or(0);
        let content = match tab {
            1 => self.pending_view("Cuestionarios", "Aún no hay cuestionarios disponibles. Próximamente podrás responder preguntas cortas del equipo.", cx),
            2 => self.reports(cx),
            3 => self.pending_view("Comunidad", "Niveles y reconocimiento · Próximamente", cx),
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
            } else {
                content
            })
    }
}
impl Testing {
    pub(crate) fn page_header(cx: &mut Context<Self>) -> gpui::Div {
        div()
            .flex()
            .items_center()
            .justify_between()
            .gap(px(12.0))
            .child(
                orbit::neo_page_header(
                    "Testing Center",
                    "Informes y cuestionarios de la beta. Tu experiencia ayuda a mejorar Vantare.",
                    cx,
                )
                .flex_1(),
            )
            .child(
                orbit::button("testing-tools", "Borradores y diagnóstico", cx).on_click(
                    cx.listener(|this, _, _, cx| {
                        this.local_open = !this.local_open;
                        cx.notify();
                    }),
                ),
            )
    }
    fn local_tools(&self, cx: &mut Context<Self>) -> gpui::Div {
        div().flex().flex_col().gap(gpui::px(orbit::GUTTER / 2.0)).child(orbit::callout(
            "Este borrador se guarda en tu equipo. El informe de diagnóstico no incluye el texto privado y no se adjunta automáticamente al envío.",
         cx))
        .child(
            div()
                .flex()
                .gap(gpui::px(orbit::GUTTER / 2.0))
                .child(orbit::button("testing-load-report", "Cargar borrador", cx).on_click(
                    cx.listener(|this, _, _, cx| {
                        this.remote.update(cx, |remote, cx| {
                            remote.report_action(Command::DraftLoad, cx);
                        });
                    }),
                ))
                .child(orbit::button("testing-retry-report", "Revisar envío pendiente", cx).on_click(
                    cx.listener(|this, _, _, cx| {
                        this.remote.update(cx, |remote, cx| {
                            remote.editor.clear_approval();
                            remote.report_action(Command::ReportRetryPrepare, cx);
                        });
                    }),
                ))
                .child(
                    orbit::button("testing-report-tab", "Borrador privado local", cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.diagnostic_tab = false;
                            cx.notify();
                        }),
                    ),
                )
                .child(
                    orbit::button("testing-diagnostic-tab", "Diagnóstico", cx).on_click(cx.listener(
                        |this, _, _, cx| {
                            this.diagnostic_tab = true;
                            cx.notify();
                        },
                    )),
                )
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
            format!(
                "{}{}",
                self.status,
                if self.store.dirty() {
                    " · Cambios sin guardar"
                } else {
                    ""
                }
            ),
            12.5,
            400,
            orbit::ink_2(cx),
         cx))
        .when_some(self.error.clone(), |view, error| {
            view.child(orbit::callout(error, cx))
        })
        .child(if self.diagnostic_tab {
            self.diagnostic( cx)
        } else {
            self.form(cx)
        })
    }
}

#[cfg(test)]
mod capture_view_tests {
    use super::selected_capture_tab;

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

impl Testing {
    fn pending_view(&self, title: &str, message: &str, cx: &gpui::App) -> gpui::Div {
        orbit::neo_card(cx)
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
        let adapt = *cx.global::<orbit::Adapt>();
        div().flex_1().min_h_0().flex().flex_col().min_w_0().gap(px(adapt.gap()))
            .child(orbit::hero_surface(cx).p(px(20.0)).gap(px(12.0))
                .child(orbit::meta("CUESTIONARIOS · PRÓXIMAMENTE", 11.0, orbit::ink_3(cx), cx))
                .child(orbit::caps("Tu experiencia cuenta", 28.0, orbit::ink(cx), cx))
                .when(adapt.show_optional(), |hero| hero.child(orbit::text("Aún no hay cuestionarios disponibles. Puedes contarnos un problema o una sugerencia.", 14.0, 400, orbit::ink_2(cx), cx)))
                .child(orbit::primary_button("testing-summary-report", "Nuevo informe", cx).self_start()
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.composing = true;
                        this.local_open = false;
                        this.tabs.update(cx, |tabs, cx| { tabs.state.selected = Some(2); cx.notify(); });
                        cx.notify();
                    }))))
            .child(div().flex().gap(px(adapt.gap())).min_w_0()
                .child(self.pending_view("Pendiente para ti", "Las solicitudes de respuesta y validación estarán disponibles próximamente.", cx).flex_1())
                .child(self.pending_view("Gracias a los probadores", "El reconocimiento de contribuciones estará disponible próximamente.", cx).flex_1()))
            .child(self.reports_panel(cx))
    }
}
