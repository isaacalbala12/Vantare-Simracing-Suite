use super::{
    diagnostic::{Diagnostic, Module, Observed},
    input::Input,
    store::{self, Draft, LABELS, Store},
};
use crate::orbit;
use gpui::{Context, Entity, IntoElement, Render, Window, div, prelude::*};
use std::{path::PathBuf, time::Instant};

pub struct Testing {
    pub observed: Observed,
    store: Store,
    data: PathBuf,
    diagnostic: Option<Diagnostic>,
    inputs: [Entity<Input>; 4],
    busy: bool,
    diagnostic_tab: bool,
    status: String,
    error: Option<String>,
}
impl Testing {
    pub fn new(data: PathBuf, cx: &mut Context<Self>) -> Self {
        let mut store = Store::new(&data);
        let error = store.reload().err().map(|_| {
            "No se pudo cargar el borrador. Se conserva el archivo; recarga antes de guardar."
                .into()
        });
        Self {
            observed: Observed::default(),
            inputs: Self::inputs(&store.draft, cx),
            store,
            data,
            diagnostic: None,
            busy: false,
            diagnostic_tab: false,
            status: "Borrador privado local. Guarda para continuar más tarde.".into(),
            error,
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
        }
        self.outcome(result, "Borrador recargado desde disco.", cx);
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
                .ok_or("No se pudo localizar el directorio nativo")?;
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
            let input = cx.new(|cx| Input::new(draft.fields[index].clone(), LABELS[index], cx));
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
        let module = self.store.draft.module;
        let mut body = orbit::card_body().child(orbit::setting_row(
            "Sección afectada",
            "Selecciona la sección del informe",
            orbit::select("testing-module", module.label()).on_click(cx.listener(
                |this, _, _, cx| {
                    let index = Module::ALL
                        .iter()
                        .position(|module| *module == this.store.draft.module)
                        .unwrap_or(0);
                    this.store.draft.module = Module::ALL[(index + 1) % Module::ALL.len()];
                    cx.notify();
                },
            )),
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
            ));
        }
        orbit::card("Borrador de informe").child(body).child(
            orbit::card_body().child(
                div()
                    .flex()
                    .gap(gpui::px(orbit::GUTTER / 2.0))
                    .child(
                        orbit::button("testing-save", "Guardar borrador")
                            .on_click(cx.listener(|this, _, _, cx| this.save(cx))),
                    )
                    .child(
                        orbit::button("testing-reload", "Recargar y descartar cambios")
                            .on_click(cx.listener(|this, _, _, cx| this.reload(cx))),
                    )
                    .child(orbit::button("testing-new", "Vaciar formulario").on_click(
                        cx.listener(|this, _, _, cx| {
                            this.store.draft = Draft::new();
                            this.inputs = Self::inputs(&this.store.draft, cx);
                            cx.notify();
                        }),
                    )),
            ),
        )
    }
    fn diagnostic(&self) -> gpui::Div {
        let mut body = orbit::card_body();
        if let Some(diagnostic) = &self.diagnostic {
            body = body.child(orbit::text(diagnostic.summary(), 12.5, 400, orbit::INK_2));
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
                        orbit::INK_3,
                    ),
                ));
            }
            for error in &diagnostic.section_errors {
                body = body.child(orbit::setting_row(
                    error.module.label(),
                    "Último error observado (sin mensaje libre)",
                    orbit::text(format!("{:?}", error.code), 12.0, 400, orbit::INK_2),
                ));
            }
            body = body.child(orbit::text("Studio y Análisis: error no instrumentado. Ausencia de error no demuestra que una sección funcione.", 12.0, 400, orbit::INK_3));
            // La vista previa es exactamente el payload que genera el exportador.
            if let Ok(bytes) = store::export_bytes(&self.store.draft, diagnostic) {
                body = body
                    .child(orbit::eyebrow("Contenido del JSON exportable"))
                    .child(orbit::text(
                        String::from_utf8_lossy(&bytes).into_owned(),
                        11.0,
                        400,
                        orbit::INK_3,
                    ));
            }
        } else {
            body = body.child(orbit::text(
                "Prepara el diagnóstico para ver la lista blanca de datos exportables.",
                13.0,
                400,
                orbit::INK_2,
            ));
        }
        orbit::card("Diagnóstico sanitizado").child(body)
    }
}
impl Render for Testing {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        div().id("testing-center").flex().flex_col().min_w_0()
            .gap(gpui::px(orbit::GUTTER / 2.0))
            .child(orbit::callout("Solo local. El JSON omite todos los textos privados, nombres, rutas absolutas y mensajes de error. No hay cuenta, credenciales, envío ni automatización."))
            .child(div().flex().gap(gpui::px(orbit::GUTTER / 2.0))
                .child(orbit::button("testing-report-tab", "Informe").on_click(cx.listener(|this, _, _, cx| { this.diagnostic_tab = false; cx.notify(); })))
                .child(orbit::button("testing-diagnostic-tab", "Diagnóstico").on_click(cx.listener(|this, _, _, cx| { this.diagnostic_tab = true; cx.notify(); })))
                .child(orbit::button("testing-prepare", if self.busy { "Preparando…" } else { "Preparar diagnóstico" })
                    .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))))
                .child(orbit::button("testing-export", "Exportar JSON local").on_click(cx.listener(|this, _, _, cx| this.export(cx)))))
            .child(orbit::text(format!("{}{}", self.status, if self.store.dirty() { " · Cambios sin guardar" } else { "" }), 12.5, 400, orbit::INK_2))
            .when_some(self.error.clone(), |view, error| view.child(orbit::callout(error)))
            .child(if self.diagnostic_tab { self.diagnostic() } else { self.form(cx) })
    }
}
