//! Ajustes persistidos y último estado publicado; no arranca procesos.
pub mod history;
use crate::{
    demo::{DemoData, DemoEngineer},
    engineer_control::{self as control, Document, Settings, Status},
    orbit,
};
use chrono::{DateTime, Duration, Local};
use gpui::{
    Context, FontWeight, IntoElement, Render, ScrollHandle, Window, div, prelude::*, px, rgb,
};
use std::{
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const TEXT: u32 = 0x00e6_e9ec;
const MUTED: u32 = 0x00b8_c3cf;
const CARD: u32 = 0x0017_1d25;
const CARD_BORDER: u32 = 0x0042_4954;
const CONTROL: u32 = 0x0026_313e;
const CONTROL_BORDER: u32 = 0x0067_768a;
const CHECK: u32 = 0x008d_c9ff;

#[allow(clippy::struct_excessive_bools)] // Estado independiente de captura, filtro y despliegue.
pub struct Engineer {
    document: Document,
    status_path: PathBuf,
    stamp: Option<SystemTime>,
    status: Option<Status>,
    loaded: bool,
    pub error: Option<String>,
    status_error: Option<String>,
    demo_error: Option<String>,
    demo: Option<DemoEngineer>,
    history: history::History,
    history_scroll: ScrollHandle,
    capture_history: bool,
    counters_open: bool,
    current_cycle_only: bool,
    family_filter: Option<String>,
    export_preview: Option<String>,
}
impl Engineer {
    pub fn load(path: PathBuf) -> Self {
        let capture_history = history_capture_path(&path);
        let capture_demo = engineer_capture_path(&path);
        let status_path = control::status_path(&path);
        let mut document = Document::new(path, Settings::default());
        let error = document.poll().err().map(|error| error.to_string());
        let (demo, demo_error) = if capture_demo {
            match DemoData::load() {
                Ok(data) => (Some(data.engineer), None),
                Err(error) => (None, Some(error)),
            }
        } else {
            (None, None)
        };
        let history_scroll = ScrollHandle::new();
        if capture_history {
            history_scroll.scroll_to_bottom();
        }
        Self {
            document,
            status_path,
            stamp: None,
            status: None,
            loaded: false,
            error,
            status_error: None,
            demo_error,
            demo,
            history: history::History::default(),
            history_scroll,
            capture_history,
            counters_open: false,
            current_cycle_only: true,
            family_filter: None,
            export_preview: None,
        }
    }
    pub fn settings(&self) -> &Settings {
        self.document.settings()
    }
    pub fn status(&self) -> Option<&Status> {
        self.status.as_ref()
    }
    pub fn change(&mut self, edit: impl FnOnce(&mut Settings)) -> Result<(), String> {
        let mut next = self.settings().clone();
        edit(&mut next);
        self.document.save(next).map_err(|error| error.to_string())
    }
    pub fn reload(&mut self) -> Result<(), String> {
        self.document.reload().map_err(|error| error.to_string())
    }
    pub fn poll(&mut self) -> bool {
        let stamp = control::modified(&self.status_path);
        if self.loaded && stamp == self.stamp && self.status_error.is_none() {
            return false;
        }
        let previous = (self.status.clone(), self.status_error.clone());
        match control::read(&self.status_path)
            .and_then(|bytes| bytes.as_deref().map(Status::parse).transpose())
        {
            Ok(status) => {
                if let Some(status) = status.as_ref() {
                    self.history.observe(status, now_ms());
                }
                self.loaded = true;
                self.status = status;
                self.stamp = stamp;
                self.status_error = None;
            }
            Err(error) => {
                self.status_error = Some(format!("estado: {error}; se conserva el último válido"));
            }
        }
        previous != (self.status.clone(), self.status_error.clone())
    }
    fn edit(&mut self, edit: impl FnOnce(&mut Settings), cx: &mut Context<Self>) {
        self.error = self.change(edit).err();
        cx.notify();
    }
}

fn is_capture_path(path: &Path) -> bool {
    let Some(parent) = path.parent() else {
        return false;
    };
    let Some(root) = parent.parent() else {
        return false;
    };
    root == std::env::temp_dir().join("vantare-hub-parity")
}

fn history_capture_path(path: &Path) -> bool {
    is_capture_path(path)
        && path
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with("-engineer-historial"))
}

fn engineer_capture_path(path: &Path) -> bool {
    is_capture_path(path)
        && path
            .parent()
            .and_then(Path::file_name)
            .and_then(|name| name.to_str())
            .is_some_and(|name| {
                name.ends_with("-engineer-base") || name.ends_with("-engineer-historial")
            })
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| {
            duration
                .as_secs()
                .saturating_mul(1_000)
                .saturating_add(u64::from(duration.subsec_millis()))
        })
}

fn paragraph(value: impl Into<gpui::SharedString>) -> gpui::Div {
    orbit::text(value, 16.0, 400, TEXT)
        .my(px(8.0))
        .line_height(px(24.0))
}

fn section(title: &str) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .w_full()
        .bg(rgb(CARD))
        .border_1()
        .border_color(rgb(CARD_BORDER))
        .rounded(px(8.0))
        .p(px(18.0))
        .child(orbit::text(title.to_owned(), 19.0, 700, TEXT))
        .child(div().h(px(12.0)))
}

fn fact(label: &str, value: &str) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_w(px(190.0))
        .child(orbit::text(label.to_owned(), 13.0, 400, MUTED))
        .child(orbit::text(value.to_owned(), 16.0, 400, TEXT).mt(px(4.0)))
}

fn fact_row(items: &[(&str, &str)]) -> gpui::Div {
    let mut row = div().flex().w_full().gap(px(14.0));
    for (label, value) in items {
        row = row.child(fact(label, value));
    }
    for _ in items.len()..4 {
        row = row.child(div().flex_1().min_w(px(190.0)));
    }
    row
}

fn checkbox(label: &str, checked: bool, disabled: bool) -> gpui::Stateful<gpui::Div> {
    let mark = div()
        .w(px(18.0))
        .h(px(18.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(2.0))
        .border_1()
        .border_color(rgb(if checked { CHECK } else { CONTROL_BORDER }))
        .when(checked, |checkbox| checkbox.bg(rgb(CHECK)))
        .when(checked, |checkbox| {
            checkbox.child(orbit::text("✓", 13.0, 700, CARD))
        });
    div()
        .flex()
        .items_center()
        .gap(px(8.0))
        .when(disabled, |view| view.opacity(0.55))
        .child(mark)
        .child(orbit::text(label.to_owned(), 16.0, 400, TEXT))
        .id(format!("engineer-checkbox-{label}"))
}

fn select_control(value: &str, disabled: bool) -> gpui::Div {
    div()
        .flex()
        .items_center()
        .justify_between()
        .gap(px(10.0))
        .min_h(px(38.0))
        .px(px(12.0))
        .py(px(8.0))
        .bg(rgb(CONTROL))
        .text_color(rgb(TEXT))
        .border_1()
        .border_color(rgb(CONTROL_BORDER))
        .rounded(px(5.0))
        .when(disabled, |view| view.opacity(0.55))
        .child(orbit::text(value.to_owned(), 16.0, 400, TEXT))
        .child(orbit::text("⌄", 14.0, 400, MUTED))
}

fn labeled_select(label: &str, value: &str, disabled: bool) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_w(px(190.0))
        .gap(px(6.0))
        .child(orbit::text(label.to_owned(), 16.0, 400, TEXT))
        .child(select_control(value, disabled))
}

fn action_button(label: &str, disabled: bool) -> gpui::Stateful<gpui::Div> {
    div()
        .flex()
        .items_center()
        .justify_center()
        .min_h(px(38.0))
        .px(px(12.0))
        .py(px(8.0))
        .bg(rgb(CONTROL))
        .border_1()
        .border_color(rgb(CONTROL_BORDER))
        .rounded(px(5.0))
        .when(disabled, |button| button.opacity(0.55))
        .child(orbit::text(label.to_owned(), 16.0, 400, TEXT))
        .id(format!("engineer-action-{label}"))
}

#[derive(Clone)]
struct HistoryRow {
    time: String,
    text: String,
    intent: String,
    family: String,
}

impl Engineer {
    fn history_rows(&self) -> Vec<HistoryRow> {
        if self.capture_history {
            let Some(demo) = &self.demo else {
                return Vec::new();
            };
            let Some(captured_at) = DateTime::parse_from_rfc3339(&demo.captured_at)
                .ok()
                .map(|time| time.with_timezone(&Local))
            else {
                return Vec::new();
            };
            return demo
                .messages
                .iter()
                .rev()
                .map(|message| {
                    let at = captured_at
                        .checked_sub_signed(Duration::seconds(i64::from(message.seconds_ago)))
                        .map_or(captured_at, |time| time);
                    let family = message.intent.split('.').next().map_or("", |family| family);
                    HistoryRow {
                        time: at.format("%H:%M:%S").to_string(),
                        text: message.text.clone(),
                        intent: message.intent.clone(),
                        family: family.to_owned(),
                    }
                })
                .filter(|row| {
                    self.family_filter
                        .as_deref()
                        .is_none_or(|family| row.family == family)
                })
                .collect();
        }

        let mut rows: Vec<_> = self
            .history
            .view(history::Filter {
                current_cycle_only: self.current_cycle_only,
                family: self.family_filter.as_deref(),
                query: "",
            })
            .rows
            .into_iter()
            .map(|entry| {
                let observed_at =
                    UNIX_EPOCH + std::time::Duration::from_millis(entry.observed_at_ms);
                let family = entry
                    .message
                    .intent
                    .split('.')
                    .next()
                    .map_or("", |family| family)
                    .to_owned();
                HistoryRow {
                    time: DateTime::<Local>::from(observed_at)
                        .format("%H:%M:%S")
                        .to_string(),
                    text: entry.message.text.clone(),
                    intent: entry.message.intent.clone(),
                    family,
                }
            })
            .collect();
        rows.reverse();
        rows
    }

    fn observed_facts(&self) -> gpui::Div {
        let status = self.status.as_ref();
        let service = match status {
            Some(status) if status.active => "En marcha",
            Some(_) => "Detenido",
            None => "No disponible",
        };
        let locale = match status {
            Some(status) => status.settings.locale.as_str(),
            None => self.settings().locale.as_str(),
        };
        let locale_value = format!("{locale} · No disponible / No disponible");
        let demo_capture = self
            .demo
            .as_ref()
            .and_then(|demo| DateTime::parse_from_rfc3339(&demo.captured_at).ok())
            .map(|time| time.with_timezone(&Local).format("%H:%M:%S").to_string());
        let captured = match demo_capture {
            Some(time) => time,
            None => match self.history.view(history::Filter::default()).rows.first() {
                Some(entry) => DateTime::<Local>::from(
                    UNIX_EPOCH + std::time::Duration::from_millis(entry.observed_at_ms),
                )
                .format("%H:%M:%S")
                .to_string(),
                None => "No disponible".into(),
            },
        };
        div()
            .flex()
            .flex_col()
            .w_full()
            .gap(px(14.0))
            .child(fact_row(&[
                ("Servicio", service),
                ("Telemetría", "No disponible"),
                ("Spotter", "No disponible"),
                ("Reproductor real", "No disponible"),
            ]))
            .child(fact_row(&[
                ("Idioma · voz spotter / ingeniero", &locale_value),
                ("Ciclo", &format!("No disponible · {captured}")),
            ]))
    }

    fn status_section(&self) -> gpui::Div {
        let mut card = section("Estado observado");
        let status_copy = if self.status.is_some() {
            "Estado actualizado desde el servicio."
        } else {
            "Esperando respuesta de Vantare…"
        };
        card = card
            .child(paragraph(status_copy))
            .child(self.observed_facts())
            .child(paragraph("El audio de radio usa únicamente frases ya disponibles en caché. Esta versión no genera ni descarga voces: un mensaje visual puede llegar sin sonido."));
        if let Some(status_error) = &self.status_error {
            card = card.child(orbit::text(status_error.clone(), 16.0, 400, 0x00ff_8c7d));
        }
        if let Some(status) = &self.status
            && let Some(error) = &status.error
        {
            card = card.child(orbit::text(error.clone(), 16.0, 400, 0x00ff_8c7d));
        }
        if let Some(error) = &self.demo_error {
            card = card.child(orbit::text(error.clone(), 16.0, 400, 0x00ff_8c7d));
        }
        card
    }

    fn native_settings(&self, cx: &Context<Self>) -> gpui::Div {
        let settings = self.settings();
        let mut locales = div().flex().flex_wrap().gap(px(8.0));
        for &locale in control::LOCALES {
            let selected = settings.locale == locale;
            let choice = div()
                .id(format!("engineer-locale-{locale}"))
                .px(px(12.0))
                .py(px(8.0))
                .bg(rgb(if selected { 0x0031_3d4a } else { CONTROL }))
                .border_1()
                .border_color(rgb(CONTROL_BORDER))
                .rounded(px(5.0))
                .child(orbit::text(locale.to_owned(), 16.0, 400, TEXT))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.edit(|settings| settings.locale = locale.into(), cx);
                }));
            locales = locales.child(choice);
        }
        div()
            .flex()
            .flex_col()
            .gap(px(14.0))
            .mt(px(12.0))
            .child(orbit::text(
                "Ajustes disponibles en el contrato nativo",
                16.0,
                700,
                TEXT,
            ))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(16.0))
                    .child(
                        checkbox("Voz local", settings.voice, false).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.edit(|settings| settings.voice = !settings.voice, cx);
                            },
                        )),
                    )
                    .child(
                        checkbox("Combustible", settings.families.fuel, false).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.edit(
                                    |settings| settings.families.fuel = !settings.families.fuel,
                                    cx,
                                );
                            }),
                        ),
                    )
                    .child(
                        checkbox("Banderas", settings.families.flags, false).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.edit(
                                    |settings| settings.families.flags = !settings.families.flags,
                                    cx,
                                );
                            },
                        )),
                    )
                    .child(
                        checkbox("Boxes", settings.families.pitstops, false).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.edit(
                                    |settings| {
                                        settings.families.pitstops = !settings.families.pitstops;
                                    },
                                    cx,
                                );
                            },
                        )),
                    )
                    .child(checkbox("Vueltas", settings.families.laps, false).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.edit(
                                |settings| settings.families.laps = !settings.families.laps,
                                cx,
                            );
                        }),
                    )),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .flex_wrap()
                    .gap(px(8.0))
                    .child(orbit::text("Idioma de radio", 16.0, 400, TEXT))
                    .child(locales)
                    .child(
                        action_button("Recargar ajustes", false).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.error = this.reload().err();
                                cx.notify();
                            },
                        )),
                    ),
            )
    }

    fn configuration_section(&self, cx: &Context<Self>) -> gpui::Div {
        let settings = self.settings();
        let controls = div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(16.0))
            .my(px(12.0))
            .child(
                checkbox("Ingeniero de pista", settings.enabled, false).on_click(cx.listener(
                    |this, _, _, cx| this.edit(|settings| settings.enabled = !settings.enabled, cx),
                )),
            )
            .child(checkbox("Spotter", false, true))
            .child(checkbox("Subtítulos", false, true))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .opacity(0.55)
                    .child(orbit::text("Sensibilidad del spotter", 16.0, 400, TEXT))
                    .child(select_control("No disponible", true).w(px(154.0))),
            );
        let outputs = div()
            .flex()
            .flex_wrap()
            .gap(px(14.0))
            .child(labeled_select("Spotter", "No disponible", true))
            .child(labeled_select("Combustible", "No disponible", true))
            .child(labeled_select("Penalizaciones", "No disponible", true))
            .child(labeled_select("Vueltas", "No disponible", true))
            .child(labeled_select("Diferencias", "No disponible", true))
            .child(labeled_select("Boxes", "No disponible", true))
            .child(labeled_select("Respuestas de voz", "No disponible", true));

        let fieldset = div()
            .flex()
            .flex_col()
            .w_full()
            .border_1()
            .border_color(rgb(CARD_BORDER))
            .px(px(14.0))
            .pb(px(14.0))
            .child(
                div()
                    .px(px(6.0))
                    .text_size(px(16.0))
                    .text_color(rgb(TEXT))
                    .child("Módulos y salidas"),
            )
            .child(controls)
            .child(outputs);
        section("Configuración real")
            .child(fieldset)
            .child(self.native_settings(cx))
            .child(paragraph("La salida «Respuestas de voz» solo afecta a respuestas si la entrada de voz experimental está disponible; no activa el micrófono."))
    }

    fn audio_section() -> gpui::Div {
        section("Prueba del reproductor")
            .child(paragraph("Desactiva el ingeniero para probar. El tono usa el mismo reproductor que la radio. La frase de prueba comprueba «Coche a la izquierda» en el idioma activo, sin simular tráfico."))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(16.0))
                    .my(px(12.0))
                    .child(action_button("Probar sonido", true))
                    .child(action_button("Probar frase en caché", true)),
            )
            .child(paragraph("«Completado» confirma que el reproductor terminó sin error. Comprueba tú si se ha oído por la salida correcta de Windows."))
    }

    fn history_filters(
        &mut self,
        cx: &mut Context<Self>,
        current_cycle_disabled: bool,
    ) -> gpui::Div {
        let cycle = if self.current_cycle_only {
            "Ciclo actual"
        } else {
            "Todos los ciclos guardados"
        };
        let family = match self.family_filter.as_deref().unwrap_or("all") {
            "spotter" => "Spotter",
            "fuel" => "Combustible",
            "penalties" => "Penalizaciones",
            "laps" => "Vueltas",
            "timings" => "Diferencias",
            "pitstops" => "Boxes",
            "voice" => "Respuestas de voz",
            "flags" => "Banderas",
            _ => "Todo",
        };
        div()
            .flex()
            .flex_wrap()
            .items_end()
            .gap(px(16.0))
            .my(px(12.0))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(6.0))
                    .child(orbit::text("Ciclos", 16.0, 400, TEXT))
                    .child(
                        select_control(cycle, current_cycle_disabled)
                            .id("engineer-history-cycle")
                            .w(px(220.0))
                            .when(!current_cycle_disabled, |select| {
                                select.on_click(cx.listener(|this, _, _, cx| {
                                    this.current_cycle_only = !this.current_cycle_only;
                                    cx.notify();
                                }))
                            }),
                    ),
            )
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(6.0))
                    .child(orbit::text("Categoría", 16.0, 400, TEXT))
                    .child(
                        select_control(family, false)
                            .id("engineer-history-family")
                            .w(px(220.0))
                            .on_click(cx.listener(|this, _, _, cx| {
                                this.family_filter = match this.family_filter.as_deref() {
                                    None => Some("spotter".into()),
                                    Some("spotter") => Some("fuel".into()),
                                    Some("fuel") => Some("penalties".into()),
                                    Some("penalties") => Some("laps".into()),
                                    Some("laps") => Some("timings".into()),
                                    Some("timings") => Some("pitstops".into()),
                                    Some("pitstops") => Some("voice".into()),
                                    Some("voice") => Some("flags".into()),
                                    _ => None,
                                };
                                cx.notify();
                            })),
                    ),
            )
            .child(
                action_button("Preparar informe", false).on_click(cx.listener(|this, _, _, cx| {
                    this.export_preview = this.history.prepare_export(this.status.as_ref()).ok();
                    cx.notify();
                })),
            )
    }

    fn history_counters(&mut self, cx: &mut Context<Self>) -> gpui::Div {
        let mut counters = div().flex().flex_col().mt(px(16.0)).child(
            div()
                .id("engineer-counters-toggle")
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(orbit::text(
                    if self.counters_open { "▾" } else { "▸" },
                    16.0,
                    400,
                    TEXT,
                ))
                .child(orbit::text(
                    "Contadores y tiempos internos",
                    16.0,
                    400,
                    TEXT,
                ))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.counters_open = !this.counters_open;
                    cx.notify();
                })),
        );
        if self.counters_open {
            let view = self.history.view(history::Filter::default());
            counters = counters
                .child(paragraph(
                    "El historial solo contiene estados observados por el Hub y puede omitir eventos entre cursores.",
                ))
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(14.0))
                        .child(fact("Mensajes retenidos", &view.retained.to_string()))
                        .child(fact("Mensajes expulsados", &view.evicted.to_string()))
                        .child(fact(
                            "Época del cursor",
                            &view.current_epoch.map_or_else(
                                || "No disponible".into(),
                                |epoch| epoch.to_string(),
                            ),
                        )),
                );
        }
        counters
    }

    fn export_preview(&self, cx: &mut Context<Self>) -> Option<gpui::Div> {
        self.export_preview.as_ref().map(|preview| {
            div()
                .flex()
                .flex_col()
                .child(orbit::text("Vista previa del informe", 19.0, 700, TEXT))
                .child(paragraph(
                    "JSON local congelado con el estado observado y el historial retenido.",
                ))
                .child(
                    div()
                        .id("engineer-export-preview")
                        .w_full()
                        .max_h(px(340.0))
                        .overflow_y_scroll()
                        .bg(rgb(0x0010_151b))
                        .p(px(12.0))
                        .child(
                            div()
                                .font_family("Cascadia Mono")
                                .text_size(px(12.0))
                                .child(preview.clone()),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .gap(px(16.0))
                        .my(px(12.0))
                        .child(action_button("Descargar JSON", true))
                        .child(action_button("Copiar JSON", true))
                        .child(
                            action_button("Cerrar vista previa", false).on_click(cx.listener(
                                |this, _, _, cx| {
                                    this.export_preview = None;
                                    cx.notify();
                                },
                            )),
                        ),
                )
        })
    }

    fn history_section(&mut self, cx: &mut Context<Self>) -> gpui::Div {
        let rows = self.history_rows();
        let rows_empty = rows.is_empty();
        let mut card = section("Registro de entregas")
            .child(paragraph("Últimos mensajes observados desde el estado publicado. Puede haber saltos del cursor; este registro no equivale a todas las entregas de radio."));
        if self.capture_history {
            card = card.child(orbit::text(
                "Los datos de la captura proceden del fixture compartido de paridad; los resultados de entrega no están en el contrato nativo.",
                16.0,
                400,
                MUTED,
            ));
        }
        let current_cycle_disabled = self.capture_history
            || self
                .history
                .view(history::Filter::default())
                .current_epoch
                .is_none();
        card = card.child(self.history_filters(cx, current_cycle_disabled));

        card = card.child(history_table(rows));

        if rows_empty {
            card = card.child(paragraph(
                "No hay mensajes observados en este filtro. No significa que el audio funcione.",
            ));
        }
        card = card.child(self.history_counters(cx));
        if let Some(preview) = self.export_preview(cx) {
            card = card.child(preview);
        }
        card
    }
}

fn history_table(rows: Vec<HistoryRow>) -> gpui::Stateful<gpui::Div> {
    let headings = div()
        .flex()
        .w_full()
        .border_b_1()
        .border_color(rgb(CARD_BORDER))
        .child(table_cell("Hora", 110.0, true))
        .child(table_cell("Mensaje", 290.0, true))
        .child(table_cell("Salida al seleccionar", 155.0, true))
        .child(table_cell("Visual", 125.0, true))
        .child(table_cell("Audio", 155.0, true))
        .child(table_cell("Entrega · duración", 150.0, true));
    let mut table = div()
        .id("engineer-history-table")
        .flex()
        .flex_col()
        .min_w(px(820.0))
        .child(headings);
    for row in rows {
        let message = div()
            .flex()
            .flex_col()
            .gap(px(5.0))
            .child(orbit::text(row.text, 16.0, 400, TEXT))
            .child(orbit::text(
                format!("{} · {}", row.family, row.intent),
                13.0,
                400,
                MUTED,
            ));
        let cells = div()
            .flex()
            .w_full()
            .border_b_1()
            .border_color(rgb(CARD_BORDER))
            .child(table_cell(&row.time, 110.0, false))
            .child(table_cell_element(message, 290.0))
            .child(table_cell("No disponible", 155.0, false))
            .child(table_cell("No disponible", 125.0, false))
            .child(table_cell("No disponible", 155.0, false))
            .child(table_cell("No disponible", 150.0, false));
        table = table.child(cells);
    }
    div()
        .id("engineer-history-horizontal")
        .w_full()
        .overflow_x_scroll()
        .mt(px(16.0))
        .child(table)
}

fn table_cell(label: &str, width: f32, heading: bool) -> gpui::Div {
    div()
        .w(px(width))
        .flex_none()
        .py(px(12.0))
        .px(px(8.0))
        .items_start()
        .child(orbit::text(
            label.to_owned(),
            if heading { 13.0 } else { 16.0 },
            400,
            if heading { MUTED } else { TEXT },
        ))
}

fn table_cell_element(element: impl IntoElement, width: f32) -> gpui::Div {
    div()
        .w(px(width))
        .flex_none()
        .py(px(12.0))
        .px(px(8.0))
        .items_start()
        .child(element)
}

impl Render for Engineer {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.capture_history {
            self.history_scroll.scroll_to_bottom();
        }
        let status = self.status_section();
        let configuration = self.configuration_section(cx);
        let audio = Self::audio_section();
        let history = self.history_section(cx);
        let mut page = div()
            .id("engineer-page")
            .flex()
            .flex_col()
            .gap(px(18.0))
            .w_full()
            .max_w(px(1450.0))
            .mx_auto()
            .px(px(24.0))
            .py(px(24.0))
            .font_family("Inter W400")
            .font_weight(FontWeight::NORMAL)
            .text_size(px(16.0))
            .text_color(rgb(TEXT))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(orbit::text("Ingeniero Vantare", 26.0, 700, TEXT).mb(px(8.0)))
                    .child(paragraph(
                        "Panel de pruebas: configura el ingeniero, comprueba el sonido y revisa cada entrega.",
                    )),
            )
            .child(status)
            .child(configuration)
            .child(audio)
            .child(history);
        if let Some(error) = &self.error {
            page = page.child(orbit::text(error.clone(), 16.0, 400, 0x00ff_8c7d));
        }
        div()
            .id("engineer-page-scroll")
            .flex_1()
            .min_h(px(0.0))
            .max_h(px(f32::from(window.viewport_size().height) - 150.0))
            .overflow_y_scroll()
            .track_scroll(&self.history_scroll)
            .child(page)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editor_conflicts_and_invalid_status_preserve_observed_values() {
        let root = std::env::temp_dir().join(format!("hub-engineer-{}", std::process::id()));
        std::fs::create_dir(&root).expect("temporal");
        let path = root.join("engineer.json");
        let mut first = Engineer::load(path.clone());
        first.change(|s| s.locale = "it".into()).expect("guardar");
        let mut second = Engineer::load(path.clone());
        first.change(|s| s.enabled = false).expect("primer editor");
        assert!(second.change(|s| s.voice = true).is_err());
        assert_eq!(second.settings().locale, "it");
        second.reload().expect("recargar");
        assert!(!second.settings().enabled);
        let status = Status {
            version: 1,
            pid: 7,
            active: true,
            settings: second.settings().clone(),
            assets: control::LOCALES
                .iter()
                .map(|l| ((*l).into(), false))
                .collect(),
            last_message: Some(control::Message {
                epoch: 3,
                sequence: 1,
                intent: "fuel.low_1l".into(),
                locale: "es".into(),
                text: "Radio observada".into(),
            }),
            error: None,
        };
        let bytes = serde_json::to_vec(&status.json()).expect("json");
        control::save(&second.status_path, None, &bytes).expect("publicar");
        assert!(second.poll());
        assert_eq!(second.status(), Some(&status));
        assert_eq!(
            second.history.view(history::Filter::default()).rows.len(),
            1
        );
        std::fs::write(&second.status_path, b"{").expect("inválido");
        second.stamp = None;
        assert!(second.poll());
        assert_eq!(second.status(), Some(&status));
        assert!(second.status_error.is_some());
        control::save(&second.status_path, Some(b"{"), &bytes).expect("recuperar");
        assert!(second.poll());
        assert!(second.status_error.is_none());
        for file in [
            path.clone(),
            path.with_extension("json.lock"),
            second.status_path.clone(),
            second.status_path.with_extension("json.lock"),
        ] {
            std::fs::remove_file(file).expect("limpiar");
        }
        std::fs::remove_dir(root).expect("limpiar temporal");
    }

    #[test]
    fn capture_detection_is_limited_to_the_hub_parity_directory() {
        let root = std::env::temp_dir()
            .join("vantare-hub-parity")
            .join("44-123-engineer-historial")
            .join("engineer.json");
        assert!(history_capture_path(&root));
        assert!(engineer_capture_path(&root));
        assert!(!history_capture_path(
            &std::env::temp_dir()
                .join("unrelated")
                .join("44-123-engineer-historial")
                .join("engineer.json")
        ));
        assert!(!engineer_capture_path(
            &std::env::temp_dir()
                .join("vantare-hub-parity")
                .join("44-123-calendario-dia")
                .join("engineer.json")
        ));
    }
}
