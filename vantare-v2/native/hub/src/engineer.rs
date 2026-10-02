//! Ajustes persistidos y último estado publicado; no arranca procesos.
pub mod history;
pub mod model;
mod surface;
use crate::{
    demo::{DemoData, DemoEngineer},
    engineer_control::{self as control, Document, Settings, Status},
    orbit,
};
use chrono::{DateTime, Local};
use gpui::{
    Context, FontWeight, IntoElement, Render, ScrollHandle, Window, deferred, div, prelude::*, px,
    rgb,
};
use std::path::{Path, PathBuf};

fn text_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x00e6_e9ec, cx)
}
fn muted_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x00b8_c3cf, cx)
}
fn card_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x0017_1d25, cx)
}
fn card_border_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x0042_4954, cx)
}
fn control_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x0026_313e, cx)
}
fn control_border_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x0067_768a, cx)
}
fn check_color(cx: &gpui::App) -> u32 {
    orbit::legacy_rgb(0x008d_c9ff, cx)
}

#[allow(clippy::struct_excessive_bools)] // Estado independiente de captura, filtro y despliegue.
pub struct Engineer {
    document: Document,
    pub error: Option<String>,
    demo_error: Option<String>,
    demo: Option<DemoEngineer>,
    model: model::Model,
    history_scroll: ScrollHandle,
    capture_history: bool,
    counters_open: bool,
    current_cycle_only: bool,
    family_filter: Option<String>,
    export_preview: Option<String>,
    content_left: gpui::Pixels,
}
impl Engineer {
    pub fn load(path: PathBuf) -> Self {
        let capture_history = history_capture_path(&path);
        let capture_demo = engineer_capture_path(&path);
        let mut model = model::Model::new(&path);
        let mut document = Document::new(path, Settings::default());
        let error = document.poll().err().map(|error| error.to_string());
        let (demo, mut demo_error) = if capture_demo {
            match DemoData::load() {
                Ok(data) => (Some(data.engineer), None),
                Err(error) => (None, Some(error)),
            }
        } else {
            (None, None)
        };
        if let Some(demo) = &demo {
            demo_error = model.capture(demo).err();
        }
        let history_scroll = ScrollHandle::new();
        if capture_history {
            history_scroll.scroll_to_bottom();
        }
        Self {
            document,
            error,
            demo_error,
            demo,
            model,
            history_scroll,
            capture_history,
            counters_open: false,
            current_cycle_only: true,
            family_filter: None,
            export_preview: None,
            content_left: px(376.0),
        }
    }
    pub fn settings(&self) -> &Settings {
        self.document.settings()
    }
    pub fn status(&self) -> Option<&Status> {
        self.model.report().map(|report| &report.status)
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
        self.demo.is_none() && self.model.poll(self.model.now())
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

fn text(
    value: impl Into<gpui::SharedString>,
    size: f32,
    weight: u16,
    color: u32,
    cx: &gpui::App,
) -> gpui::Div {
    // Mismas métricas Inter que el kit Eficiencia: Chrome redondea ascenso y
    // descenso y trunca el semi-interlineado; GPUI lo centra con fracciones.
    let line_height = size * 1.5;
    let native_line = line_height.round();
    let css_baseline = vantare_ui::efficiency::text::baseline(0.0, line_height, size);
    let native_baseline = f32::midpoint(native_line, size * (1984.0 - 494.0) / 2048.0);
    orbit::text(value, size, weight, color, cx)
        .relative()
        .top(px(css_baseline - native_baseline))
        .line_height(px(native_line))
        // GPUI ajusta las cajas de texto a píxeles; CSS mantiene fracciones.
        // Las etiquetas/títulos de una línea conservan su alto lógico original.
        .when((12.7..13.1).contains(&size), |view| view.h(px(line_height)))
        .font_weight(
            if cx.global::<orbit::theme::Theme>().interface_font
                == orbit::theme::InterfaceFont::Inter
            {
                gpui::FontWeight::NORMAL
            } else {
                gpui::FontWeight(f32::from(weight))
            },
        )
}

fn paragraph(value: impl Into<gpui::SharedString>, cx: &gpui::App) -> gpui::Div {
    text(value, 16.0, 400, text_color(cx), cx)
        .my(px(8.0))
        .line_height(px(24.0))
}

fn section(title: &str, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .w_full()
        .bg(rgb(card_color(cx)))
        .border_1()
        .border_color(rgb(card_border_color(cx)))
        .rounded(px(8.0))
        .p(px(18.0))
        .child(text(title.to_owned(), 19.0, 400, text_color(cx), cx))
        .child(div().h(px(12.0)))
}

fn fact(label: &str, value: &str, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_w(px(190.0))
        .min_h(px(13.0 * 1.5 + 4.0 + 24.0))
        .child(text(label.to_owned(), 13.0, 400, muted_color(cx), cx))
        .child(text(value.to_owned(), 16.0, 400, text_color(cx), cx).mt(px(4.0)))
}

fn fact_row(items: &[(&str, &str)], cx: &gpui::App) -> gpui::Div {
    let mut row = div().flex().w_full().gap(px(14.0));
    for (label, value) in items {
        row = row.child(fact(label, value, cx));
    }
    for _ in items.len()..4 {
        row = row.child(div().flex_1().min_w(px(190.0)));
    }
    row
}

fn checkbox(
    label: &str,
    checked: bool,
    disabled: bool,
    cx: &gpui::App,
) -> gpui::Stateful<gpui::Div> {
    let mark = div()
        .w(px(18.0))
        .h(px(18.0))
        .flex()
        .items_center()
        .justify_center()
        .rounded(px(2.0))
        .border_1()
        .border_color(rgb(if checked {
            check_color(cx)
        } else {
            control_border_color(cx)
        }))
        .when(checked, |checkbox| checkbox.bg(rgb(check_color(cx))))
        .when(checked, |checkbox| {
            checkbox.child(text("✓", 13.0, 700, card_color(cx), cx))
        });
    div()
        .id(format!("engineer-checkbox-{label}"))
        .flex()
        .items_center()
        .gap(px(8.0))
        .role(gpui::Role::CheckBox)
        .aria_label(label.to_owned())
        .aria_description(if disabled {
            "Sin contrato nativo; deshabilitado"
        } else {
            ""
        })
        .tab_stop(!disabled)
        .child(mark)
        .child(text(label.to_owned(), 16.0, 400, text_color(cx), cx))
}

fn select_control(value: &str, disabled: bool, cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    div()
        .id(format!("engineer-select-{value}"))
        .role(gpui::Role::ComboBox)
        .aria_description(if disabled {
            "Sin contrato nativo; deshabilitado"
        } else {
            ""
        })
        .tab_stop(!disabled)
        .flex()
        .items_center()
        .justify_between()
        .gap(px(10.0))
        .h(px(40.0))
        .pl(px(16.0))
        .pr(px(4.0))
        .bg(rgb(control_color(cx)))
        .text_color(rgb(text_color(cx)))
        .border_1()
        .border_color(rgb(control_border_color(cx)))
        .rounded(px(5.0))
        .child(text(
            value.to_owned(),
            16.0,
            400,
            orbit::legacy_rgb(0x00f1_f5fa, cx),
            cx,
        ))
        .child(
            text("⌄", 16.0, 400, orbit::legacy_rgb(0x00f1_f5fa, cx), cx)
                .font_family(crate::orbit::sans_override("Segoe UI", cx)),
        )
}

fn labeled_select(label: &str, value: &str, disabled: bool, cx: &gpui::App) -> gpui::Div {
    div()
        .flex()
        .flex_col()
        .flex_1()
        .min_w(px(190.0))
        .gap(px(6.0))
        .child(text(label.to_owned(), 16.0, 400, text_color(cx), cx))
        .child(select_control(value, disabled, cx).id(format!("engineer-output-{label}")))
}

fn action_button(label: &str, disabled: bool, cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    div()
        .flex()
        .items_center()
        .justify_center()
        .h(px(40.0))
        .px(px(12.0))
        .bg(rgb(control_color(cx)))
        .border_1()
        .border_color(rgb(control_border_color(cx)))
        .rounded(px(5.0))
        .when(disabled, |button| button.opacity(0.55))
        .child(text(label.to_owned(), 16.0, 400, text_color(cx), cx))
        .id(format!("engineer-action-{label}"))
}

struct HistoryRow {
    time: String,
    text: String,
    intent: String,
    family: String,
    cycle: String,
    delivery: RowDelivery,
}

struct RowDelivery {
    mode: &'static str,
    visual: &'static str,
    audio: &'static str,
    duration_ms: Option<u64>,
}

impl Engineer {
    fn history_rows(&self) -> Vec<HistoryRow> {
        use control::runtime::AudioOutcome;
        let demo = self.demo.is_some();
        let mut rows: Vec<_> = self
            .model
            .history(history::Filter {
                current_cycle_only: self.current_cycle_only,
                family: self.family_filter.as_deref(),
                query: "",
            })
            .into_iter()
            .map(|entry| {
                let delivery = &entry.delivery;
                let message = &delivery.message;
                let family = message.intent.split('.').next().map_or("", |family| family);
                let time = i64::try_from(delivery.selected_at_ms)
                    .ok()
                    .and_then(DateTime::from_timestamp_millis)
                    .map_or_else(
                        || "No disponible".into(),
                        |time| time.with_timezone(&Local).format("%H:%M:%S").to_string(),
                    );
                HistoryRow {
                    time,
                    text: message.text.clone(),
                    intent: message.intent.clone(),
                    family: family.into(),
                    cycle: message.epoch.to_string(),
                    delivery: RowDelivery {
                        mode: self.model.capture_output(family).unwrap_or("No disponible"),
                        visual: match (demo, delivery.text_emitted) {
                            (true, true) => "Publicado",
                            (true, false) => "No publicado",
                            (false, true) => "Texto emitido",
                            (false, false) => "No emitido",
                        },
                        audio: match delivery.audio {
                            AudioOutcome::Disabled => "Desactivado",
                            AudioOutcome::Started => "Iniciado",
                            AudioOutcome::Finished => "Completado",
                            AudioOutcome::Cancelled => "Cancelado",
                            AudioOutcome::Missing => "Sin audio en caché",
                            AudioOutcome::Unavailable => "No disponible",
                            AudioOutcome::Failed => "Error",
                        },
                        // El contrato nativo no contiene ACK visual ni duración.
                        duration_ms: self.model.capture_duration_ms(),
                    },
                }
            })
            .collect();
        rows.reverse();
        rows
    }

    fn observed_facts(&self, cx: &gpui::App) -> gpui::Div {
        use control::runtime::{Connection, Spotter, VoiceEngine};
        let view = self.model.view(self.model.now());
        let service = match view.health {
            model::Health::Fresh => "En marcha",
            model::Health::Stopped => "Detenido",
            model::Health::Expired => "Estado caducado",
            model::Health::Invalid => "Estado inválido",
            model::Health::Missing | model::Health::LegacyUnavailable => "No disponible",
        };
        let telemetry = if view.runtime.is_none() {
            "No disponible"
        } else {
            match view.connection {
                Connection::Live => "Conectada",
                Connection::Waiting => "Esperando",
                Connection::Stale => "Caducada",
                Connection::Disconnected => "Desconectada",
            }
        };
        let spotter = if view.runtime.is_none() {
            "No disponible"
        } else {
            match view.spotter {
                Spotter::Ready => "Preparado",
                Spotter::Disabled => "Desactivado",
                Spotter::WaitingSource => "Esperando telemetría",
                Spotter::WaitingPlayer => "Esperando jugador",
                Spotter::WaitingPitLane => "En boxes",
                Spotter::WaitingLowSpeed => "Velocidad insuficiente",
                Spotter::UnavailableSpatial => "Sin datos espaciales",
            }
        };
        let player = match view.runtime {
            Some(runtime)
                if runtime.voice.engine == VoiceEngine::CachedClipsWinmm
                    && runtime.voice.clips_configured =>
            {
                "Configurado"
            }
            Some(_) | None => "No disponible",
        };
        let locale_value = view.runtime.map_or_else(
            || "No disponible".into(),
            |runtime| {
                let locale = self
                    .model
                    .report()
                    .map_or("—", |report| report.status.settings.locale.as_str());
                let voice = &runtime.voice.selected_voice;
                format!("{locale} · {voice} / {voice}")
            },
        );
        let cycle = view.runtime.and_then(|runtime| runtime.epoch).map_or_else(
            || "No disponible".into(),
            |epoch| {
                // Hora congelada de la observación en el harness Wails; no es un
                // heartbeat real ni una marca de tiempo inferida del proceso.
                if self.demo.is_some() {
                    format!("{epoch} · 16:00:19")
                } else {
                    epoch.to_string()
                }
            },
        );
        div()
            .flex()
            .flex_col()
            .w_full()
            .gap(px(14.0))
            .child(fact_row(
                &[
                    ("Servicio", service),
                    ("Telemetría", telemetry),
                    ("Spotter", spotter),
                    ("Reproductor real", player),
                ],
                cx,
            ))
            .child(fact_row(
                &[
                    ("Idioma · voz spotter / ingeniero", &locale_value),
                    ("Ciclo", &cycle),
                ],
                cx,
            ))
    }

    fn status_section(&self, cx: &gpui::App) -> gpui::Div {
        let mut card = section("Estado observado", cx);
        let view = self.model.view(self.model.now());
        let status_copy = if view.health == model::Health::Fresh {
            "Estado actualizado desde el servicio."
        } else if view.health == model::Health::Expired {
            "El estado ha caducado; esperando un heartbeat reciente."
        } else {
            "Esperando respuesta de Vantare…"
        };
        card = card
            .child(paragraph(status_copy, cx).mt(px(0.0)))
            .child(self.observed_facts( cx))
            .child(paragraph("El audio de radio usa únicamente frases ya disponibles en caché. Esta versión no genera ni descarga voces: un mensaje visual puede llegar sin sonido.", cx));
        if let Some(error) = view.error {
            card = card.child(text(
                format!("estado: {error}; se conserva la evidencia anterior"),
                16.0,
                400,
                0x00ff_8c7d,
                cx,
            ));
        }
        if view.running
            && let Some(report) = self.model.report()
            && let Some(error) = &report.status.error
        {
            card = card.child(text(error.clone(), 16.0, 400, 0x00ff_8c7d, cx));
        }
        if let Some(runtime) = view.runtime
            && let Some(error) = &runtime.voice.error
        {
            card = card.child(text(format!("audio: {error}"), 16.0, 400, 0x00ff_8c7d, cx));
        }
        if let Some(error) = &self.demo_error {
            card = card.child(text(error.clone(), 16.0, 400, 0x00ff_8c7d, cx));
        }
        card
    }

    #[allow(clippy::too_many_lines)] // Composición visual; crece al migrar a accesores de tema (#1430).
    fn native_settings(&self, cx: &Context<Self>) -> gpui::Div {
        let settings = self.settings();
        let mut locales = div().flex().flex_wrap().gap(px(8.0));
        for &locale in control::LOCALES {
            let selected = settings.locale == locale;
            let choice = div()
                .id(format!("engineer-locale-{locale}"))
                .px(px(12.0))
                .py(px(8.0))
                .bg(rgb(if selected {
                    0x0031_3d4a
                } else {
                    control_color(cx)
                }))
                .border_1()
                .border_color(rgb(control_border_color(cx)))
                .rounded(px(5.0))
                .child(text(locale.to_owned(), 16.0, 400, text_color(cx), cx))
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
            .child(text(
                "Ajustes disponibles en el contrato nativo",
                16.0,
                700,
                text_color(cx),
                cx,
            ))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(16.0))
                    .child(
                        checkbox("Voz local", settings.voice, false, cx).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.edit(|settings| settings.voice = !settings.voice, cx);
                            },
                        )),
                    )
                    .child(
                        checkbox("Combustible", settings.families.fuel, false, cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.edit(
                                    |settings| settings.families.fuel = !settings.families.fuel,
                                    cx,
                                );
                            }),
                        ),
                    )
                    .child(
                        checkbox("Banderas", settings.families.flags, false, cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.edit(
                                    |settings| settings.families.flags = !settings.families.flags,
                                    cx,
                                );
                            }),
                        ),
                    )
                    .child(
                        checkbox("Boxes", settings.families.pitstops, false, cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.edit(
                                    |settings| {
                                        settings.families.pitstops = !settings.families.pitstops;
                                    },
                                    cx,
                                );
                            }),
                        ),
                    )
                    .child(
                        checkbox("Vueltas", settings.families.laps, false, cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.edit(
                                    |settings| settings.families.laps = !settings.families.laps,
                                    cx,
                                );
                            }),
                        ),
                    ),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .flex_wrap()
                    .gap(px(8.0))
                    .child(text("Idioma de radio", 16.0, 400, text_color(cx), cx))
                    .child(locales)
                    .child(
                        action_button("Recargar ajustes", false, cx).on_click(cx.listener(
                            |this, _, _, cx| {
                                this.error = this.reload().err();
                                cx.notify();
                            },
                        )),
                    ),
            )
    }

    #[allow(clippy::too_many_lines)] // Composición visual; crece al migrar a accesores de tema (#1430).
    fn configuration_section(&self, cx: &Context<Self>) -> gpui::Div {
        let settings = self.settings();
        let view = self.model.view(self.model.now());
        let controls = div()
            .flex()
            .flex_wrap()
            .items_center()
            .gap(px(16.0))
            .my(px(12.0))
            .child(
                checkbox("Ingeniero de pista", settings.enabled, false, cx).on_click(cx.listener(
                    |this, _, _, cx| this.edit(|settings| settings.enabled = !settings.enabled, cx),
                )),
            )
            .child(checkbox(
                "Spotter",
                view.runtime
                    .is_some_and(|runtime| runtime.spotter != control::runtime::Spotter::Disabled),
                true,
                cx,
            ))
            .child(checkbox(
                "Subtítulos",
                view.runtime
                    .is_some_and(|runtime| runtime.delivery.text_enabled),
                true,
                cx,
            ))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(text(
                        "Sensibilidad del spotter",
                        16.0,
                        400,
                        text_color(cx),
                        cx,
                    ))
                    .child(
                        select_control(
                            if self.demo.is_some() {
                                "Normal"
                            } else {
                                "No disponible"
                            },
                            true,
                            cx,
                        )
                        .w(px(154.0)),
                    ),
            );
        // repeat(auto-fit, minmax(190px, 1fr)) en orbit-engineer.css:
        // cuatro columnas en el contenido de 1440 px, sin siete flex items.
        let mut outputs = div().flex().flex_col().gap(px(14.0));
        let output_rows: [&[(&str, &str)]; 2] = [
            &[
                ("Spotter", "spotter"),
                ("Combustible", "fuel"),
                ("Penalizaciones", "penalties"),
                ("Vueltas", "laps"),
            ],
            &[
                ("Diferencias", "timings"),
                ("Boxes", "pitstops"),
                ("Respuestas de voz", "voice"),
            ],
        ];
        for categories in output_rows {
            let mut row = div().flex().w_full().gap(px(14.0));
            for &(label, family) in categories {
                row = row.child(labeled_select(
                    label,
                    self.model.capture_output(family).unwrap_or("No disponible"),
                    true,
                    cx,
                ));
            }
            for _ in categories.len()..4 {
                row = row.child(div().flex_1().min_w(px(190.0)));
            }
            outputs = outputs.child(row);
        }

        let fieldset = div()
            .relative()
            .mt(px(12.0))
            .pt(px(25.0))
            .flex()
            .flex_col()
            .w_full()
            .border_1()
            .border_color(rgb(card_border_color(cx)))
            .px(px(14.0))
            .pb(px(14.0))
            .child(deferred(
                text("Módulos y salidas", 16.0, 400, text_color(cx), cx)
                    .absolute()
                    .top(px(-12.0))
                    .left(px(14.0))
                    .px(px(6.0))
                    .bg(rgb(card_color(cx))),
            ))
            .child(controls)
            .child(outputs);
        section("Configuración real", cx)
            .child(fieldset)
            .child(paragraph("La salida «Respuestas de voz» solo afecta a respuestas si la entrada de voz experimental está disponible; no activa el micrófono.", cx))
            .child(paragraph(if self.demo.is_some() { "Los valores muestran el estado confirmado por Vantare." } else { "Los ajustes nativos disponibles se guardan localmente. Las salidas sin contrato están deshabilitadas." }, cx))
    }

    fn audio_section(cx: &gpui::App) -> gpui::Div {
        section("Prueba del reproductor", cx)
            .child(paragraph("Desactiva el ingeniero para probar. El tono usa el mismo reproductor que la radio. La frase de prueba comprueba «Coche a la izquierda» en el idioma activo, sin simular tráfico.", cx).mt(px(0.0)))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .gap(px(16.0))
                    .my(px(12.0))
                    .child(action_button("Probar sonido", true, cx))
                    .child(action_button("Probar frase en caché", true, cx)),
            )
            .child(paragraph("«Completado» confirma que el reproductor terminó sin error. Comprueba tú si se ha oído por la salida correcta de Windows.", cx))
    }

    fn history_filters(
        &mut self,
        cx: &mut Context<Self>,
        current_cycle_disabled: bool,
    ) -> gpui::Div {
        let cycle =
            if self.current_cycle_only && self.model.view(self.model.now()).runtime.is_none() {
                "Último ciclo observado"
            } else if self.current_cycle_only {
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
                    .child(text("Ciclos", 16.0, 400, text_color(cx), cx))
                    .child(
                        select_control(cycle, current_cycle_disabled, cx)
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
                    .child(text("Categoría", 16.0, 400, text_color(cx), cx))
                    .child(
                        select_control(family, false, cx)
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
                action_button("Preparar informe", false, cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        match this.model.prepare_export(this.model.now()) {
                            Ok(preview) => this.export_preview = Some(preview),
                            Err(error) => this.error = Some(format!("informe: {error}")),
                        }
                        cx.notify();
                    },
                )),
            )
    }

    fn history_counters(&mut self, cx: &mut Context<Self>) -> gpui::Div {
        let mut counters = div().flex().flex_col().mt(px(16.0)).child(
            div()
                .id("engineer-counters-toggle")
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(text(
                    if self.counters_open { "▾" } else { "▸" },
                    16.0,
                    400,
                    text_color(cx),
                    cx,
                ))
                .child(text(
                    "Contadores y tiempos internos",
                    16.0,
                    400,
                    text_color(cx),
                    cx,
                ))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.counters_open = !this.counters_open;
                    cx.notify();
                })),
        );
        if self.counters_open {
            let retained = self.model.history(history::Filter::default()).len();
            counters = counters
                .child(paragraph(
                    "Solo entregas recibidas por el Hub. Puede haber huecos entre publicaciones; las expulsiones del proceso y del Hub no son una pérdida total exacta.",
                 cx))
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(14.0))
                        .child(fact("Mensajes retenidos", &retained.to_string(), cx))
                        .child(fact("Mensajes expulsados", &self.model.evicted.to_string(), cx))
                        .child(fact(
                            "Época del cursor",
                            &self.model.current_epoch.map_or_else(
                                || "No disponible".into(),
                                |epoch| epoch.to_string(),
                            ),
                         cx)),
                );
        }
        counters
    }

    fn export_preview(&self, cx: &mut Context<Self>) -> Option<gpui::Div> {
        self.export_preview.as_ref().map(|preview| {
            div()
                .flex()
                .flex_col()
                .child(text(
                    "Vista previa del informe",
                    19.0,
                    700,
                    text_color(cx),
                    cx,
                ))
                .child(paragraph(
                    "JSON local congelado con el estado observado y el historial retenido.",
                    cx,
                ))
                .child(
                    div()
                        .id("engineer-export-preview")
                        .w_full()
                        .max_h(px(340.0))
                        .overflow_y_scroll()
                        .bg(rgb(crate::orbit::legacy_rgb(0x0010_151b, cx)))
                        .p(px(12.0))
                        .child(
                            div()
                                .font_family(orbit::mono_override("Cascadia Mono", cx))
                                .text_size(px(12.0))
                                .child(preview.clone()),
                        ),
                )
                .child(
                    div()
                        .flex()
                        .gap(px(16.0))
                        .my(px(12.0))
                        .child(action_button("Descargar JSON", true, cx))
                        .child(action_button("Copiar JSON", true, cx))
                        .child(action_button("Cerrar vista previa", false, cx).on_click(
                            cx.listener(|this, _, _, cx| {
                                this.export_preview = None;
                                cx.notify();
                            }),
                        )),
                )
        })
    }

    fn history_section(&mut self, cx: &mut Context<Self>) -> gpui::Div {
        let rows = self.history_rows();
        let rows_empty = rows.is_empty();
        let mut card = section("Registro de entregas", cx)
            .child(paragraph(if self.demo.is_some() {
                "Últimas 200 entregas seleccionadas por la radio. La salida configurada corresponde al momento del envío; los resultados visual y audio muestran lo que ocurrió. El registro se conserva entre ciclos hasta cerrar la app."
            } else {
                "Últimas entregas observadas desde el estado publicado. Puede haber huecos entre publicaciones; este registro no equivale a todas las entregas de radio."
            }, cx).mt(px(0.0)));
        let current_cycle_disabled = self.model.current_epoch.is_none();
        card = card.child(self.history_filters(cx, current_cycle_disabled));

        card = card.child(history_table(rows, cx));

        if rows_empty {
            card = card.child(paragraph(
                "No hay mensajes observados en este filtro. No significa que el audio funcione.",
                cx,
            ));
        }
        card = card.child(self.history_counters(cx));
        // Los ajustes adicionales del servicio local siguen accesibles sin desplazar
        // los bloques Wails; no se incluyen en la escena demo de entregas.
        if self.demo.is_none() {
            card = card.child(self.native_settings(cx));
        }
        if let Some(preview) = self.export_preview(cx) {
            card = card.child(preview);
        }
        card
    }
}

fn history_table(rows: Vec<HistoryRow>, cx: &gpui::App) -> gpui::Stateful<gpui::Div> {
    // Anchos resultantes de table-layout:auto en el corpus Wails congelado.
    let widths = [90.0, 293.0, 154.0, 123.0, 168.0, 138.0];
    let headings = [
        "Hora",
        "Mensaje",
        "Salida al seleccionar",
        "Visual",
        "Audio",
        "Entrega · duración",
    ];
    let mut heading = div()
        .flex()
        .w_full()
        .border_b_1()
        .border_color(rgb(card_border_color(cx)));
    for (label, width) in headings.into_iter().zip(widths) {
        heading = heading.child(table_cell(
            text(label, 13.0, 700, muted_color(cx), cx),
            width,
        ));
    }
    let mut table = div()
        .id("engineer-history-table")
        .flex()
        .flex_col()
        .min_w(px(820.0))
        .child(heading);
    for (index, row) in (0_u16..).zip(rows) {
        // CSS conserva 73.2 px (padding + líneas + margen + borde). GPUI
        // redondea cada caja: repartir el resto evita perder 0.2 px por fila.
        // min-height mantiene el crecimiento natural de mensajes que envuelven.
        let css_height = 12.0 * 2.0 + 24.0 + 5.0 + 12.8 * 1.5 + 1.0;
        let row_height =
            (f32::from(index + 1) * css_height).ceil() - (f32::from(index) * css_height).ceil();
        let when = div()
            .flex()
            .flex_col()
            .child(text(row.time, 16.0, 400, text_color(cx), cx))
            .child(
                text(
                    format!("Ciclo {}", row.cycle),
                    12.8,
                    400,
                    muted_color(cx),
                    cx,
                )
                .mt(px(5.0)),
            );
        let message = div()
            .flex()
            .flex_col()
            .child(text(row.text, 16.0, 400, text_color(cx), cx))
            .child(
                text(
                    format!("{} · {}", row.family, row.intent),
                    12.8,
                    400,
                    muted_color(cx),
                    cx,
                )
                .mt(px(5.0)),
            );
        let delivery = row.delivery;
        let result = if let Some(duration) = delivery.duration_ms {
            div()
                .flex()
                .flex_col()
                .child(text("Completado", 16.0, 400, text_color(cx), cx))
                .child(text(format!("{duration} ms"), 12.8, 400, muted_color(cx), cx).mt(px(5.0)))
        } else {
            text("No disponible", 16.0, 400, muted_color(cx), cx)
        };
        table = table.child(
            div()
                .flex()
                .w_full()
                .min_h(px(row_height))
                .border_b_1()
                .border_color(rgb(card_border_color(cx)))
                .child(table_cell(when, widths[0]))
                .child(table_cell(message, widths[1]))
                .child(table_cell(
                    text(delivery.mode, 16.0, 400, text_color(cx), cx),
                    widths[2],
                ))
                .child(table_cell(
                    text(delivery.visual, 16.0, 400, text_color(cx), cx),
                    widths[3],
                ))
                .child(table_cell(
                    text(delivery.audio, 16.0, 400, text_color(cx), cx),
                    widths[4],
                ))
                .child(table_cell(result, widths[5])),
        );
    }
    div()
        .id("engineer-history-horizontal")
        .w_full()
        .overflow_x_scroll()
        .mt(px(16.0))
        .child(table)
}

fn table_cell(element: impl IntoElement, width: f32) -> gpui::Div {
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
        let status = self.status_section(cx);
        let configuration = self.configuration_section(cx);
        let audio = Self::audio_section(cx);
        let history = self.history_section(cx);
        let mut page = div()
            .id("engineer-page")
            .flex()
            .flex_col()
            .gap(px(18.0))
            .w_full()
            .max_w(px(1450.0))
            .mx_auto()
            .pl(px(24.0))
            .pr(px(34.0))
            .py(px(24.0))
            .font_family(crate::orbit::sans_override("Inter W400", cx))
            .font_weight(FontWeight::NORMAL)
            .text_size(px(16.0))
            .text_color(rgb(text_color(cx)))
            .child(
                div()
                    .flex()
                    .flex_col()
                    .child(text("Ingeniero Vantare", 26.0, 400, text_color(cx), cx))
                    .child(paragraph(
                        "Panel de pruebas: configura el ingeniero, comprueba el sonido y revisa cada entrega.",
                     cx)),
            )
            .child(status)
            .child(configuration)
            .child(audio)
            .child(history);
        if let Some(error) = &self.error {
            page = page.child(text(error.clone(), 16.0, 400, 0x00ff_8c7d, cx));
        }
        surface::render(self, page, window, cx)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_history_matches_wails_cycles_and_frozen_delivery_results() {
        let path = std::env::temp_dir()
            .join("vantare-hub-parity")
            .join("test-engineer-historial")
            .join("engineer.json");
        let mut engineer = Engineer::load(path);
        let rows = engineer.history_rows();
        assert_eq!(rows.len(), 19);
        assert_eq!(
            rows.first().expect("primera entrega").intent,
            "fuel.on_target"
        );
        let last = rows.last().expect("última entrega del ciclo actual");
        assert_eq!(last.intent, "pitstops.window_open");
        let delivery = &last.delivery;
        assert_eq!(delivery.mode, "Audio y visual");
        assert_eq!(delivery.visual, "Publicado");
        assert_eq!(delivery.audio, "Sin audio en caché");
        assert!(rows.iter().all(|row| row.cycle == "3"));
        engineer.current_cycle_only = false;
        let rows = engineer.history_rows();
        assert_eq!(rows.len(), 20);
        assert_eq!(rows.last().expect("ciclo anterior").cycle, "2");
        engineer.family_filter = Some("laps".into());
        let rows = engineer.history_rows();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|row| row.delivery.mode == "Solo visual"));
        engineer.document = Document::new(
            PathBuf::from("unused-capture.json"),
            Settings {
                voice: false,
                ..Settings::default()
            },
        );
        assert!(
            engineer
                .history_rows()
                .iter()
                .all(|row| row.delivery.duration_ms == Some(25))
        );
        // Los ajustes actuales no reescriben los resultados congelados del harness.
        assert_eq!(
            engineer.model.view(engineer.model.now()).health,
            model::Health::Fresh
        );
    }

    #[test]
    fn observed_history_never_claims_demo_delivery_results() {
        let mut engineer = Engineer::load(
            std::env::temp_dir()
                .join("engineer-parity-not-a-capture")
                .join("engineer.json"),
        );
        assert!(engineer.demo.is_none());
        assert!(engineer.history_rows().is_empty());
        let status = Status {
            version: 1,
            pid: 7,
            active: true,
            settings: Settings::default(),
            assets: std::collections::BTreeMap::default(),
            last_message: Some(control::Message {
                epoch: 42,
                sequence: 1,
                intent: "fuel.low_1l".into(),
                locale: "es".into(),
                text: "Mensaje observado".into(),
            }),
            error: None,
        };
        let legacy = serde_json::to_vec(&status.json()).expect("legacy");
        engineer.model.observe(Some(&legacy), 100);
        assert!(engineer.history_rows().is_empty(), "v1 no prueba entregas");
        let mut report = control::runtime::test_report();
        let runtime = report.runtime.as_mut().expect("runtime");
        runtime.epoch = Some(42);
        runtime.delivery.history.push(control::runtime::Delivery {
            id: 1,
            message: status.last_message.expect("mensaje"),
            text_emitted: true,
            audio: control::runtime::AudioOutcome::Finished,
            selected_at_ms: 100,
        });
        let bytes = serde_json::to_vec(&report.json()).expect("v2");
        engineer.model.observe(Some(&bytes), 100);
        let rows = engineer.history_rows();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].text, "Mensaje observado");
        assert_eq!(rows[0].cycle, "42");
        let delivery = &rows[0].delivery;
        assert_eq!(delivery.visual, "Texto emitido");
        assert_eq!(delivery.audio, "Completado");
        assert_eq!(delivery.mode, "No disponible");
        assert!(delivery.duration_ms.is_none());
        report.runtime.as_mut().expect("runtime").delivery.history[0].selected_at_ms = u64::MAX;
        engineer.model.observe(
            Some(&serde_json::to_vec(&report.json()).expect("fecha fuera de rango")),
            100,
        );
        assert_eq!(engineer.history_rows()[0].time, "No disponible");
    }

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
        control::save(&control::status_path(&path), None, &bytes).expect("publicar");
        assert!(second.poll());
        assert_eq!(second.status(), Some(&status));
        assert!(
            second.model.history(history::Filter::default()).is_empty(),
            "v1 no acredita entregas"
        );
        std::fs::write(control::status_path(&path), b"{").expect("inválido");
        assert!(second.poll());
        assert_eq!(second.status(), Some(&status));
        assert_eq!(
            second.model.view(second.model.now()).health,
            model::Health::Invalid
        );
        assert!(!second.model.view(second.model.now()).connected);
        control::save(&control::status_path(&path), Some(b"{"), &bytes).expect("recuperar");
        assert!(second.poll());
        assert_eq!(
            second.model.view(second.model.now()).health,
            model::Health::LegacyUnavailable
        );
        for file in [
            path.clone(),
            path.with_extension("json.lock"),
            control::status_path(&path).clone(),
            control::status_path(&path).with_extension("json.lock"),
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
