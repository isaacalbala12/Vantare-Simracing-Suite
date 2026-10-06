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
        #[cfg(feature = "parity-capture")]
        let capture = selected_capture_tab(&data).is_some();
        #[cfg(not(feature = "parity-capture"))]
        let capture = false;
        let channel_label = super::model::channel_label(
            option_env!("VANTARE_BUILD_CHANNEL").map(|_| crate::product::CHANNEL),
            capture,
        );
        let tabs = cx.new(|cx| {
            orbit::Choice::new(
                "Vistas de Testing Center",
                orbit::ChoiceKind::Tabs,
                ["Nuevo informe", "Validar", "Mis informes"]
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
        "testing-center-informe" | "testing-center-detalle" => Some(0),
        "testing-center-validar" => Some(1),
        "testing-center-mis-reportes" => Some(2),
        _ => None,
    }
}

fn disabled_refresh(cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    div()
        .id("testing-validate-refresh")
        .role(gpui::Role::Button)
        .aria_label("Actualizar")
        .aria_description("Próximamente")
        .tab_stop(false)
        .h(px(34.0))
        .px(px(14.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(orbit::RADIUS_CONTROL))
        .border_1()
        .border_color(rgba(orbit::line(cx)))
        .bg(rgba(crate::orbit::legacy_rgba(0xffff_ff06, cx)))
        .flex_none()
        .opacity(0.55)
        .child(orbit::text(
            "Actualizar",
            orbit::SECONDARY,
            600,
            orbit::ink_3(cx),
            cx,
        ))
}

fn validation_panel(cx: &gpui::App) -> gpui::Div {
    orbit::neo_card(cx)
        .flex_1()
        .min_h_0()
        .w_full()
        .child(
            orbit::neo_header("Correcciones pendientes", "v-testing", cx)
                .child(div().flex_1())
                .child(disabled_refresh(cx)),
        )
        .child(
            div()
                .flex_1()
                .min_h_0()
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .gap(px(16.0))
                .child(orbit::icon("v-testing", 52.0, orbit::ink_3(cx)))
                .child(orbit::text(
                    "Disponible próximamente",
                    22.0,
                    600,
                    orbit::ink(cx),
                    cx,
                ))
                .child(
                    orbit::text(
                        "Prueba las correcciones de tu canal y registra el resultado de cada una.",
                        14.0,
                        400,
                        orbit::ink_2(cx),
                        cx,
                    )
                    .max_w(px(480.0))
                    .text_center(),
                )
                .child(orbit::pill(
                    "Validación de correcciones",
                    orbit::Tone::Neutral,
                    cx,
                )),
        )
}

impl Testing {
    fn reports_panel(&self, cx: &gpui::App) -> gpui::Div {
        let remote = self.remote.read(cx);
        let mut list =
            orbit::neo_card(cx)
                .flex_1()
                .child(orbit::neo_header("Mis informes", "clock", cx));
        if remote.report_receipts.is_empty() {
            list = list.child(orbit::text(
                "Todavía no has enviado informes en esta sesión.",
                13.0,
                400,
                orbit::ink_2(cx),
                cx,
            ));
        }
        for (fields, receipt) in &remote.report_receipts {
            list = list.child(
                div()
                    .flex()
                    .items_center()
                    .justify_between()
                    .gap(px(12.0))
                    .py(px(12.0))
                    .border_b_1()
                    .border_color(rgba(orbit::line_row(cx)))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(orbit::text(
                                if fields.action_text.trim().is_empty() {
                                    "Título no disponible".to_owned()
                                } else {
                                    fields.action_text.clone()
                                },
                                14.0,
                                600,
                                orbit::ink(cx),
                                cx,
                            ))
                            .child(orbit::text(
                                format!(
                                    "{} · {}",
                                    super::model::MODULES
                                        .iter()
                                        .find(|(id, _)| *id == fields.module)
                                        .map_or("Sin determinar", |(_, label)| *label),
                                    orbit::activity_time(
                                        &receipt.created_at,
                                        chrono::Local::now().fixed_offset()
                                    )
                                ),
                                11.0,
                                400,
                                orbit::ink_3(cx),
                                cx,
                            )),
                    )
                    .child(orbit::text(
                        match receipt.report_state.as_str() {
                            "submitted" => "Enviado",
                            _ => "Estado no disponible",
                        },
                        12.0,
                        600,
                        orbit::ink_2(cx),
                        cx,
                    )),
            );
        }
        list.child(orbit::text("El estado corresponde al momento del envío. El seguimiento estará disponible próximamente.", 12.0, 400, orbit::ink_3(cx), cx))
    }
    pub(crate) fn topbar_controls(&self) -> Entity<orbit::Choice> {
        self.tabs.clone()
    }
    pub(crate) fn context_column(&self, cx: &mut Context<Self>) -> gpui::Stateful<gpui::Div> {
        let count = self.remote.read(cx).report_receipts.len();
        orbit::neo_context_column("testing-context", cx)
            .pt(px(cx.global::<orbit::design::Tokens>().geometry.gutter))
            .child(orbit::neo_card(cx).child(orbit::neo_header("Tus informes", "pulse", cx))
                .child(orbit::text(count.to_string(), 32.0, 700, orbit::ink(cx), cx))
                .child(orbit::text(self.channel_label.clone(), 11.0, 500, orbit::ink_3(cx), cx))
                .child(orbit::text("Informes enviados en esta sesión", 12.0, 400, orbit::ink_3(cx), cx)))
            .child(orbit::neo_card(cx).child(orbit::neo_header("Conversación", "v-chat", cx))
                .child(orbit::text("Próximamente podrás consultar respuestas y conversar sobre tu informe.", 13.0, 400, orbit::ink_3(cx), cx)))
            .child(orbit::neo_card(cx).flex_1().child(orbit::neo_header("Un buen informe", "v-testing", cx))
                .children([
                    "1  Cuenta qué esperabas y qué pasó.",
                    "2  Añade una captura: se comprime antes de enviar. Revisa los datos personales.",
                    "3  Si se repite, indica cuántas veces y en qué sesión.",
                    "4  Las sugerencias también cuentan: dinos para qué las usarías."
                ].into_iter().map(|tip| orbit::text(tip, 13.0, 400, orbit::ink_2(cx), cx).py(px(8.0)))))
    }
}
impl Render for Testing {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let tab = self.tabs.read(cx).state.selected.unwrap_or(0);
        let content = match tab {
            1 => validation_panel(cx),
            2 => self.reports_panel(cx),
            _ => div()
                .flex_1()
                .flex()
                .flex_col()
                .gap(px(16.0))
                .child(self.remote.update(cx, |remote, cx| {
                    remote
                        .editor
                        .render(f32::from(window.viewport_size().width) <= 1500.0, cx)
                }))
                .child(self.reports_panel(cx)),
        };
        div()
            .id("testing-center")
            .min_h(px((f32::from(window.viewport_size().height)
                - cx.global::<orbit::design::Tokens>().geometry.topbar
                - 2.0 * cx.global::<orbit::design::Tokens>().geometry.gutter
                - 76.0)
                .max(0.0)))
            .w_full()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(16.0))
            .child(content)
            .when(self.local_open, |page| page.child(self.local_tools(cx)))
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
                    "Informes de la beta",
                    "Cuéntanos qué falla o qué mejorarías. Revisa el contenido antes de enviarlo.",
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
            ("testing-center-informe", 0),
            ("testing-center-detalle", 0),
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
