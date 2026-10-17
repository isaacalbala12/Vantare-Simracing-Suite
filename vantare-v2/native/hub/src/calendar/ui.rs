//! Estado de pantalla del calendario, acciones del usuario y el marco de las
//! vistas (cabecera, pestañas, carril y capas). Cada vista vive en su archivo.
use super::{
    Calendar, Health,
    chrome::{self, Tone, banner, btn, ib, kv, pill, t},
    clock::{self},
    rows::Filter,
};
use crate::orbit;
use chrono::{DateTime, Utc};
use gpui::{Context, Div, IntoElement, Window, div, prelude::*, px};

/// «hace 3 min», «hace 11 h», «hace 2 d».
fn ago_txt(delta: chrono::Duration) -> String {
    let minutes = delta.num_minutes().max(0);
    match minutes {
        0 => "hace un momento".to_owned(),
        1..=59 => format!("hace {minutes} min"),
        60..=1439 => format!("hace {} h", minutes / 60),
        _ => format!("hace {} d", minutes / 1440),
    }
}

mod avisos;
mod dia;
mod eventos;
mod ficha;
mod mes;
mod mias;
mod proximas;
mod semana;
mod serie;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum View {
    #[default]
    Proximas,
    Mias,
    Calendario,
    Eventos,
    Serie,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum Span {
    Dia,
    #[default]
    Semana,
    Mes,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Modal {
    Avisos,
    Ics,
}

#[derive(Clone, Debug)]
pub(crate) struct Ficha {
    pub id: String,
    pub at: Option<DateTime<Utc>>,
}

#[derive(Default)]
// Estado de interfaz: cada booleano es un modo independiente.
#[allow(clippy::struct_excessive_bools)]
pub(crate) struct State {
    pub view: View,
    pub span: Span,
    /// Vista desde la que se abrió la página de serie.
    pub prev: View,
    /// Semanas respecto a la actual (0 = esta, 1 = la siguiente, -1 = pasada).
    pub week: i32,
    /// Meses respecto al actual en la vista Mes.
    pub month: i32,
    /// Mis carreras: solo lo que tiene aviso.
    pub only_alerts: bool,
    /// Franja abierta en el editor de Avisos.
    pub band_edit: Option<String>,
    pub day: Option<usize>,
    pub filter: Filter,
    pub full: bool,
    pub ficha: Option<Ficha>,
    pub modal: Option<Modal>,
    pub serie: Option<String>,
    pub class_menu: bool,
    /// Campo de búsqueda de Próximas abierto desde el icono de la lupa.
    pub search_open: bool,
    /// Selector «Cambiar serie» de la página de serie.
    pub series_menu: bool,
    pub ics: super::ics::Options,
    pub scroll: gpui::ScrollHandle,
    pub scrolled_day: Option<usize>,
    pub scroll_tries: u8,
    /// Campo de búsqueda de Próximas; se crea al pintar por primera vez.
    pub search: Option<gpui::Entity<orbit::Input>>,
    /// Tamaño de la ventana, para las capas que la cubren entera.
    pub viewport: gpui::Size<gpui::Pixels>,
    pub toast: Option<String>,
    /// Hechos por día del Mes (salidas, densidad, avisos): se rehacen al cambiar
    /// los datos o el minuto, no en cada fotograma.
    pub month_cache: mes::MonthCache,
    /// Salidas del `.ics` para la vista previa; se rehacen con los datos o el minuto.
    pub ics_preview: Option<((u64, i64, super::ics::Options), Vec<super::ics::Entry>)>,
}

impl Calendar {
    pub(super) fn go(&mut self, view: View, cx: &mut Context<Self>) {
        self.ui.ficha = None;
        self.ui.modal = None;
        if self.ui.view != View::Serie {
            self.ui.prev = self.ui.view;
        }
        self.ui.view = view;
        self.ui.full = false;
        self.ui.scrolled_day = None;
        cx.notify();
    }
    pub(super) fn open_serie(&mut self, id: String, cx: &mut Context<Self>) {
        let prev = if self.ui.view == View::Serie {
            self.ui.prev
        } else {
            self.ui.view
        };
        self.ui.ficha = None;
        self.ui.modal = None;
        self.ui.serie = Some(id);
        self.ui.prev = prev;
        self.ui.view = View::Serie;
        self.ui.full = false;
        cx.notify();
    }
    pub(super) fn back(&mut self, cx: &mut Context<Self>) {
        self.ui.view = self.ui.prev;
        cx.notify();
    }
    pub(super) fn open_ficha(
        &mut self,
        id: String,
        at: Option<DateTime<Utc>>,
        cx: &mut Context<Self>,
    ) {
        self.ui.modal = None;
        self.ui.ficha = Some(Ficha { id, at });
        cx.notify();
    }
    pub(super) fn open_modal(&mut self, modal: Modal, cx: &mut Context<Self>) {
        self.ui.ficha = None;
        self.ui.modal = Some(modal);
        cx.notify();
    }
    /// Esc: cierra la capa abierta o la pantalla completa. `true` si hizo algo.
    pub(crate) fn escape(&mut self, cx: &mut Context<Self>) -> bool {
        let acted = self.ui.ficha.take().is_some()
            | self.ui.modal.take().is_some()
            | std::mem::take(&mut self.ui.class_menu)
            | std::mem::take(&mut self.ui.series_menu)
            | std::mem::take(&mut self.ui.search_open)
            | std::mem::take(&mut self.ui.full);
        if acted {
            cx.notify();
        }
        acted
    }
    pub(super) fn toggle_fav(&mut self, id: &str, cx: &mut Context<Self>) {
        self.error = self.follow(id.to_owned()).err();
        cx.notify();
    }
    pub(super) fn toggle_slot_alert(
        &mut self,
        id: &str,
        at: DateTime<Utc>,
        cx: &mut Context<Self>,
    ) {
        self.update_alerts(|alerts| alerts.toggle_slot(id, at));
        cx.notify();
    }
    /// Texto del botón de lanzar, con el perfil recortado si es largo.
    pub(super) fn launch_label(&self) -> String {
        self.profile.as_deref().map_or_else(
            || "Lanzar perfil".to_owned(),
            |name| {
                let short: String = name.chars().take(18).collect();
                let dots = if name.chars().count() > 18 { "…" } else { "" };
                format!("Lanzar «{short}{dots}»")
            },
        )
    }

    pub(super) fn say(&mut self, message: impl Into<String>, cx: &mut Context<Self>) {
        let message = message.into();
        self.ui.toast = Some(message.clone());
        cx.notify();
        cx.spawn(async move |this, cx| {
            cx.background_executor()
                .timer(std::time::Duration::from_secs(4))
                .await;
            // Si la sección ya no existe, no hay nada que limpiar.
            this.update(cx, |this, cx| {
                if this.ui.toast.as_deref() == Some(message.as_str()) {
                    this.ui.toast = None;
                    cx.notify();
                }
            })
            .ok();
        })
        .detach();
    }

    /// Series visibles y salidas por hora del horario, para la cabecera.
    fn subtitle(&self) -> String {
        match (self.health(), self.schedule()) {
            (Health::Expired, _) => self.last_week.as_ref().map_or_else(
                || "La semana LMU ha terminado".into(),
                |last| {
                    let days = last.window().map(|(from, _)| clock::week_days(from));
                    format!(
                        "La semana LMU {} ha terminado",
                        days.map_or_else(|_| String::new(), |d| clock::week_title(&d))
                    )
                },
            ),
            (Health::Loading, None) => {
                "Comprobando el horario de las carreras online de LMU".into()
            }
            (_, Some(schedule)) => {
                let per_hour: f64 = schedule
                    .series
                    .iter()
                    .filter_map(super::model::Series::every)
                    .map(|every| 60.0 / every as f64)
                    .sum();
                let days = schedule
                    .window()
                    .map(|(from, _)| clock::week_days(from))
                    .ok();
                format!(
                    "Semana LMU · {} · {} series · {} salidas por hora",
                    days.map_or_else(String::new, |d| format!(
                        "{} {} – {} {} {}",
                        clock::day_name(d[0]),
                        chrono::Datelike::day(&d[0]),
                        clock::day_name(d[6]),
                        chrono::Datelike::day(&d[6]),
                        clock::month_name(d[6])
                    )),
                    schedule.series.len(),
                    per_hour.round()
                )
            }
            _ => "Horario de las carreras online de Le Mans Ultimate".into(),
        }
    }

    /// La página de una serie ocupa todo el centro y no lleva carril.
    pub(crate) fn on_series_page(&self) -> bool {
        self.ui.view == View::Serie
    }

    pub(crate) fn page_header(&self, adapt: orbit::Adapt, cx: &mut Context<Self>) -> Div {
        let compact = adapt.width < 1400.0;
        let skin = chrome::skin(cx);
        let has = self.schedule().is_some()
            || self.last_week.is_some()
            || self.health() == Health::Loading;
        let alerts = self.alerts.count();
        div()
            .flex_none()
            .flex()
            .items_center()
            .gap(px(8.0))
            .child(
                div()
                    .flex_1()
                    .min_w(px(160.0))
                    // Compacta: título y subtítulo en una línea (`.collapsed .ph`).
                    .when(compact, |block| {
                        block
                            .flex()
                            .items_baseline()
                            .gap(px(14.0))
                            .child(chrome::disp("Calendario LMU", 24.0, skin.text1, cx).flex_none())
                            .child(
                                div().flex_1().min_w_0().child(
                                    t(self.subtitle(), 13.0, 400, skin.text3, cx)
                                        .whitespace_nowrap()
                                        .truncate(),
                                ),
                            )
                    })
                    .when(!compact, |block| {
                        block
                            .child(chrome::disp("Calendario LMU", 28.0, skin.text1, cx).truncate())
                            .when(adapt.show_optional(), |block| {
                                block.child(
                                    t(self.subtitle(), 13.0, 400, skin.text3, cx)
                                        .mt(px(6.0))
                                        .whitespace_nowrap()
                                        .truncate(),
                                )
                            })
                    }),
            )
            .when(has, |header| {
                header
                    .child(
                        btn("calendar-alerts", "", false, cx)
                            .aria_label("Avisos")
                            .child(chrome::icon("v-bell", 16.0, skin.text1))
                            .when(!compact, |b| {
                                b.child(t("Avisos", 13.0, 500, skin.text1, cx))
                            })
                            .child(pill(alerts.to_string(), Tone::Acc, cx))
                            .on_click(
                                cx.listener(|this, _, _, cx| this.open_modal(Modal::Avisos, cx)),
                            ),
                    )
                    .child(
                        btn("calendar-ics", "", false, cx)
                            .aria_label("Añadir a mi calendario")
                            .child(chrome::icon("v-calendar", 16.0, skin.text1))
                            .child(t(
                                if compact {
                                    "Calendario"
                                } else {
                                    "Añadir a mi calendario"
                                },
                                13.0,
                                500,
                                skin.text1,
                                cx,
                            ))
                            .on_click(
                                cx.listener(|this, _, _, cx| this.open_modal(Modal::Ics, cx)),
                            ),
                    )
            })
            .child(
                ib(
                    "calendar-reload",
                    "refresh",
                    "Actualizar horario",
                    false,
                    self.refreshing,
                    cx,
                )
                .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))),
            )
    }

    pub(crate) fn topbar_controls(&self, cx: &mut Context<Self>) -> Div {
        let tab = |id: &'static str, label: &str, on: bool, view: View, cx: &mut Context<Self>| {
            orbit::topbar_tab(id, label, on, cx)
                .on_click(cx.listener(move |this, _, _, cx| this.go(view, cx)))
        };
        let events = self.schedule().map_or(0, |s| {
            s.series
                .iter()
                .filter(|s| !super::rows::is_daily(s))
                .count()
        });
        let current = self.ui.view;
        let on = |view: View| current == view || (current == View::Serie && self.ui.prev == view);
        div()
            .flex()
            .h_full()
            .gap(px(18.0))
            .child(tab(
                "calendar-tab-next",
                "Próximas",
                on(View::Proximas),
                View::Proximas,
                cx,
            ))
            .child(tab(
                "calendar-tab-mine",
                "Mis carreras",
                on(View::Mias),
                View::Mias,
                cx,
            ))
            .child(tab(
                "calendar-tab-cal",
                "Calendario",
                on(View::Calendario),
                View::Calendario,
                cx,
            ))
            .child(
                tab(
                    "calendar-tab-events",
                    "Eventos",
                    on(View::Eventos),
                    View::Eventos,
                    cx,
                )
                .when(events > 0, |tab| {
                    tab.child(
                        t(events.to_string(), 11.0, 400, chrome::skin(cx).cap, cx).ml(px(7.0)),
                    )
                }),
            )
    }

    pub(crate) fn rail_sections(&self, cx: &mut Context<Self>) -> Vec<orbit::RailSection> {
        if self.on_series_page() {
            return Vec::new();
        }
        let skin = chrome::skin(cx);
        let now = self.now();
        let zone = self.zone();
        let health = self.health();
        let (label, tone) = match health {
            Health::Ok => ("Al día", Tone::Ok),
            Health::Fallback => ("Con respaldo", Tone::Warn),
            Health::Offline => ("Sin conexión", Tone::Warn),
            Health::Expired => ("Esperando la nueva semana", Tone::Warn),
            Health::Missing => ("Sin horario", Tone::Err),
            Health::Loading => ("Comprobando…", Tone::Neutral),
        };
        let mut status = div().flex().flex_col();
        if health == Health::Missing {
            status = status.child(t(
                "Aún no hemos podido descargar el horario. Necesitas conexión la primera vez; después funciona sin internet.",
                12.5, 400, skin.text3, cx,
            ));
        } else {
            let current = self.schedule().or(self.last_week.as_ref());
            // Caducado: el carril ya mira a la semana que falta por publicar.
            let week = current.and_then(|s| s.window().ok()).map(|(from, to)| {
                clock::week_days(if health == Health::Expired { to } else { from })
            });
            let title = week.map_or_else(
                || "—".to_owned(),
                |d| {
                    format!(
                        "{} {} – {} {} {}",
                        clock::day_name(d[0]),
                        chrono::Datelike::day(&d[0]),
                        clock::day_name(d[6]),
                        chrono::Datelike::day(&d[6]),
                        clock::month_name(d[6])
                    )
                },
            );
            // «hoy 08:02 · hace 11 h»; de otro día, solo «lun 12 · 08:01».
            let when = |ts: i64| {
                DateTime::from_timestamp(ts, 0).map_or_else(
                    || "nunca".to_owned(),
                    |at| {
                        let rel = zone.day_rel(at, now);
                        if rel == "hoy" {
                            format!("hoy {} · {}", zone.hm(at), ago_txt(now - at))
                        } else {
                            format!("{rel} · {}", zone.hm(at))
                        }
                    },
                )
            };
            let source = if self.fallback_count() > 0 {
                format!("LMU + RaceControl ({})", self.fallback_count())
            } else {
                "LMU oficial".to_owned()
            };
            let next_from = clock::week_start(now) + chrono::Duration::days(7);
            let estimate = self.history.publication_estimate(next_from);
            status = status
                .child(kv(
                    "Semana",
                    if health == Health::Expired {
                        format!(
                            "{} · sin publicar",
                            week.as_ref().map_or_else(String::new, clock::week_title)
                        )
                    } else {
                        title
                    },
                    cx,
                ))
                .child(kv("Fuente", source, cx))
                .child(kv(
                    "Actualizado",
                    if self.stamps.updated == 0 {
                        "nunca".to_owned()
                    } else {
                        when(self.stamps.updated)
                    },
                    cx,
                ))
                .child(if health == Health::Expired {
                    kv(
                        "Última comprobación",
                        format!(
                            "{} · cada 15 min",
                            DateTime::from_timestamp(self.stamps.checked, 0)
                                .map_or_else(|| "nunca".to_owned(), |at| ago_txt(now - at))
                        ),
                        cx,
                    )
                } else {
                    kv(
                        "Próxima semana",
                        format!("{} (aprox.)", zone.day_long(estimate)),
                        cx,
                    )
                });
        }
        let zone_control = div()
            .flex()
            .items_center()
            .justify_between()
            .py(px(4.0))
            .child(t("Horas en", 12.5, 400, skin.text3, cx))
            .child(self.zone_seg(now, cx));
        status = status.child(zone_control);
        let mut sections =
            vec![orbit::RailSection::new("Horario", "clock", status).action(pill(label, tone, cx))];
        sections.push(self.rail_alerts(cx));
        if health != Health::Missing && health != Health::Loading {
            sections.push(Self::rail_export(cx));
        }
        sections
    }

    fn zone_seg(&self, now: DateTime<Utc>, cx: &mut Context<Self>) -> Div {
        let local = clock::local_label(now);
        let utc = self.prefs.utc;
        div()
            .flex()
            .items_center()
            .gap(px(2.0))
            .p(px(3.0))
            .rounded(px(9.0))
            .bg(gpui::rgb(chrome::skin(cx).l2))
            .border_1()
            .border_color(orbit::alpha(chrome::skin(cx).line1))
            .child(
                chrome::seg_button("calendar-zone-local", &local, !utc, cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        this.set_utc(false);
                        cx.notify();
                    },
                )),
            )
            .child(
                chrome::seg_button("calendar-zone-utc", "UTC", utc, cx).on_click(cx.listener(
                    |this, _, _, cx| {
                        this.set_utc(true);
                        cx.notify();
                    },
                )),
            )
    }

    fn rail_alerts(&self, cx: &mut Context<Self>) -> orbit::RailSection {
        let skin = chrome::skin(cx);
        let now = self.now();
        let zone = self.zone();
        let mut body = div().flex().flex_col();
        let items = self
            .schedule()
            .map(|schedule| self.alerts.upcoming(schedule, now))
            .unwrap_or_default();
        if items.is_empty() {
            body = body.child(
                t(
                    if self.schedule().is_some()
                        && self.favorites().is_empty()
                        && self.alerts.count() == 0
                    {
                        "Sin avisos todavía. Pulsa la campana en una hora para que te avisemos antes de salir."
                    } else {
                        "No tienes avisos pendientes."
                    },
                    12.5, 400, skin.text3, cx,
                ),
            );
        }
        for item in items.iter().take(4) {
            let Some(series) = self.schedule().and_then(|s| s.by_id(&item.series_id)) else {
                continue;
            };
            let lead = series
                .class_chips()
                .first()
                .map(|c| c.name.clone())
                .unwrap_or_default();
            let (sub, when) = match &item.band {
                Some(band) => (
                    format!(
                        "Franja {}–{} · {}",
                        clock::hhmm(u32::from(band.from)),
                        clock::hhmm(u32::from(band.to)),
                        if band.mode == super::alerts::Mode::Each {
                            "cada salida"
                        } else {
                            "solo la primera"
                        }
                    ),
                    "siguiente".to_owned(),
                ),
                None => (series.track_short().to_owned(), zone.day_rel(item.at, now)),
            };
            body = body.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .py(px(8.0))
                    .border_b_1()
                    .border_color(orbit::alpha(skin.line1))
                    .child(chrome::class_dot(&lead, cx).size(px(8.0)))
                    .child(
                        div()
                            .flex_1()
                            .min_w_0()
                            .child(t(series.name.clone(), 13.0, 600, skin.text1, cx).truncate())
                            .child(t(sub, 11.5, 400, skin.text3, cx).truncate()),
                    )
                    .child(
                        div()
                            .flex_none()
                            .flex()
                            .flex_col()
                            .items_end()
                            .child(chrome::bold_mono(zone.hm(item.at), 13.0, skin.text1, cx))
                            .child(t(when, 11.5, 400, skin.text3, cx)),
                    ),
            );
        }
        body = body.child(
            btn("calendar-rail-alerts", "", true, cx)
                .aria_label("Configurar avisos")
                .mt(px(10.0))
                .w_full()
                .child(chrome::icon("i-ajustes", 15.0, skin.text1))
                .child(t("Configurar avisos", 12.5, 600, skin.text1, cx))
                .on_click(cx.listener(|this, _, _, cx| this.open_modal(Modal::Avisos, cx))),
        );
        orbit::RailSection::new("Tus avisos", "v-bell", body).action(t(
            format!("{} min antes", self.alerts.lead_min),
            12.0,
            500,
            skin.text3,
            cx,
        ))
    }

    fn rail_export(cx: &mut Context<Self>) -> orbit::RailSection {
        let skin = chrome::skin(cx);
        let target = |id: &'static str,
                      name: &'static str,
                      glyph: &'static str,
                      color: u32,
                      cx: &mut Context<Self>| {
            btn(id, "", true, cx)
                .aria_label(name)
                .flex_1()
                .child(
                    div()
                        .size(px(15.0))
                        .flex_none()
                        .rounded(px(3.0))
                        .flex()
                        .items_center()
                        .justify_center()
                        .bg(gpui::rgb(color))
                        .child(orbit::text(glyph, 9.0, 800, 0x00ff_ffff, cx)),
                )
                .child(t(name, 12.5, 500, skin.text1, cx))
                .on_click(cx.listener(|this, _, _, cx| this.open_modal(Modal::Ics, cx)))
        };
        let body = div()
            .flex()
            .flex_col()
            .gap(px(10.0))
            .child(t(
                "Tus favoritas en Google, Apple u Outlook: descarga un archivo .ics y ábrelo en tu calendario.",
                12.5, 400, skin.text3, cx,
            ))
            .child(
                div()
                    .flex()
                    .gap(px(6.0))
                    .child(target("calendar-rail-google", "Google", "G", 0x1A_73E8, cx))
                    .child(target("calendar-rail-apple", "Apple", "A", 0x00_0000, cx))
                    .child(target("calendar-rail-outlook", "Outlook", "O", 0x0F_6CBD, cx)),
            );
        orbit::RailSection::new("En tu calendario", "v-calendar", body)
    }
}

/// Contenido central de la página.
pub(super) fn render(
    cal: &mut Calendar,
    window: &mut Window,
    cx: &mut Context<Calendar>,
) -> impl IntoElement {
    cal.ui.viewport = window.viewport_size();
    let health = cal.health();
    let mut page = div()
        .id("calendar")
        .size_full()
        .min_h_0()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(cal.adapt.gap()))
        .on_key_down(cx.listener(|this, event: &gpui::KeyDownEvent, _, cx| {
            if event.keystroke.key == "escape" && this.escape(cx) {
                cx.stop_propagation();
            }
        }));
    if let Some(focus) = &cal.focus {
        page = page.track_focus(focus);
    }
    let now = cal.now();
    if matches!(health, Health::Offline) {
        let stamp = cal.stamps.updated.max(cal.stamps.checked);
        let at = DateTime::from_timestamp(stamp, 0).map_or_else(String::new, |at| {
            format!(
                "{} a las {}",
                cal.zone().day_rel(at, now),
                cal.zone().hm(at)
            )
        });
        let until = cal
            .schedule()
            .and_then(|s| s.window().ok())
            .map(|(_, to)| cal.zone().day_long(to - chrono::Duration::days(1)))
            .unwrap_or_default();
        page = page.child(banner(
            Tone::Warn,
            "wifi-off",
            t(
                format!("Sin conexión. Usamos el horario guardado {at}; sigue siendo válido hasta el {until}. Los avisos funcionan igual."),
                13.0, 400, chrome::skin(cx).text1, cx,
            ),
            Some(
                btn("calendar-retry", "Reintentar", true, cx)
                    .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))),
            ),
            cx,
        ));
    }
    if health == Health::Fallback {
        let n = cal.fallback_count();
        page = page.child(banner(
            Tone::Warn,
            "info",
            t(
                format!(
                    "Al horario oficial de LMU le faltan {n} series. Las completamos con RaceControl hasta que LMU las publique; van marcadas con RC."
                ),
                13.0, 400, chrome::skin(cx).text1, cx,
            ),
            None,
            cx,
        ));
    }
    if let Some(error) = cal.error.clone() {
        page = page.child(orbit::callout(error, cx));
    }
    let body = match cal.ui.view {
        View::Serie => serie::render(cal, cx),
        // Sin horario vigente todas las vistas muestran el mismo estado.
        _ if matches!(health, Health::Missing | Health::Loading | Health::Expired) => {
            proximas::render(cal, cx)
        }
        View::Proximas => proximas::render(cal, cx),
        View::Mias => mias::render(cal, cx),
        View::Eventos => eventos::render(cal, cx),
        View::Calendario => match cal.ui.span {
            Span::Dia => dia::render(cal, cx),
            Span::Semana => semana::render(cal, cx),
            Span::Mes => mes::render(cal, cx),
        },
    };
    page = page.child(body);
    if cal.ui.full && cal.ui.view == View::Calendario {
        page = page.child(fullscreen(cal, cx));
    }
    if let Some(ficha) = cal.ui.ficha.clone() {
        page = page.child(ficha::render(cal, &ficha, cx));
    }
    if let Some(message) = cal.ui.toast.clone() {
        let skin = chrome::skin(cx);
        page = page.child(
            gpui::deferred(
                div()
                    .absolute()
                    .bottom(px(22.0))
                    .left_0()
                    .right_0()
                    .flex()
                    .justify_center()
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .px(px(16.0))
                            .py(px(10.0))
                            .rounded(px(10.0))
                            .bg(gpui::rgb(skin.l3))
                            .border_1()
                            .border_color(orbit::alpha(skin.line2))
                            .shadow(vec![orbit::kit_shadow(0x0000_0066, 0.0, 8.0, 24.0, false)])
                            .child(chrome::icon("info", 14.0, skin.text2))
                            .child(t(message, 13.0, 500, skin.text1, cx)),
                    ),
            )
            .with_priority(orbit::MODAL_Z + 1),
        );
    }
    match cal.ui.modal {
        Some(Modal::Avisos) => page = page.child(avisos::alerts_modal(cal, cx)),
        Some(Modal::Ics) => page = page.child(avisos::ics_modal(cal, cx)),
        None => {}
    }
    page
}

/// Pantalla completa de Día/Semana/Mes: cubre toda la ventana; Esc la cierra.
fn fullscreen(cal: &mut Calendar, cx: &mut Context<Calendar>) -> impl IntoElement {
    let body = match cal.ui.span {
        Span::Dia => dia::render(cal, cx),
        Span::Semana => semana::render(cal, cx),
        Span::Mes => mes::render(cal, cx),
    };
    gpui::deferred(
        div()
            .id("calendar-full")
            .absolute()
            .inset_0()
            .size_full()
            .flex()
            .flex_col()
            .p(px(12.0))
            .bg(gpui::rgb(orbit::canvas(cx)))
            .occlude()
            .child(body),
    )
    .with_priority(orbit::MODAL_Z)
}

/// Botón de pantalla completa común a Día, Semana y Mes.
/// El botón de pantalla completa mide siempre 32 px y se tiñe al estar activo.
pub(super) fn full_button_state(full: bool) -> chrome::IbState {
    chrome::IbState {
        small: false,
        on: full,
    }
}

pub(super) fn full_button(cal: &Calendar, cx: &mut Context<Calendar>) -> gpui::Stateful<Div> {
    let on = cal.ui.full;
    let skin = chrome::skin(cx);
    chrome::ib_with(
        "calendar-full-toggle",
        if on { "shrink" } else { "expand" },
        if on {
            "Salir de pantalla completa (Esc)"
        } else {
            "Pantalla completa"
        },
        full_button_state(on),
        cx,
    )
    // `.fullb`: borde b2, y línea de acento al estar activo.
    .border_1()
    .border_color(if on {
        chrome::acc_line(cx)
    } else {
        orbit::alpha(skin.line2)
    })
    .on_click(cx.listener(|this, _, _, cx| {
        this.ui.full = !this.ui.full;
        cx.notify();
    }))
}

/// Selector Día · Semana · Mes.
pub(super) fn span_seg(cal: &Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let on = cal.ui.span;
    let mut row = div()
        .flex()
        .flex_none()
        .items_center()
        .gap(px(2.0))
        .p(px(3.0))
        .rounded(px(9.0))
        .bg(gpui::rgb(skin.l2))
        .border_1()
        .border_color(orbit::alpha(skin.line1));
    for (span, label) in [
        (Span::Dia, "Día"),
        (Span::Semana, "Semana"),
        (Span::Mes, "Mes"),
    ] {
        row = row.child(
            chrome::seg_button(("calendar-span", span as usize), label, on == span, cx).on_click(
                cx.listener(move |this, _, _, cx| {
                    this.ui.span = span;
                    this.ui.scrolled_day = None;
                    cx.notify();
                }),
            ),
        );
    }
    row
}

/// Selector Todas · Favoritas común a las vistas de calendario; con `counts`
/// (todas, favoritas) enseña los recuentos como en Próximas.
pub(super) fn fav_seg(
    cal: &Calendar,
    counts: Option<(usize, usize)>,
    cx: &mut Context<Calendar>,
) -> Div {
    let skin = chrome::skin(cx);
    let only = cal.ui.filter.only_favs;
    let count = |n: Option<usize>, cx: &gpui::App| {
        n.map_or_else(div, |n| t(n.to_string(), 12.0, 400, skin.cap, cx))
    };
    div()
        .flex()
        .flex_none()
        .items_center()
        .gap(px(2.0))
        .p(px(3.0))
        .rounded(px(9.0))
        .bg(gpui::rgb(skin.l2))
        .border_1()
        .border_color(orbit::alpha(skin.line1))
        .child(
            chrome::seg_button("calendar-all", "Todas", !only, cx)
                .child(count(counts.map(|c| c.0), cx))
                .on_click(cx.listener(|this, _, _, cx| {
                    this.ui.filter.only_favs = false;
                    cx.notify();
                })),
        )
        .child(
            chrome::seg_button_with(
                "calendar-favs",
                "Favoritas",
                only,
                Some(div().child(chrome::star(true, 12.0, cx))),
                cx,
            )
            .child(count(counts.map(|c| c.1), cx))
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.filter.only_favs = true;
                cx.notify();
            })),
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_full_screen_button_is_active_and_keeps_its_32_px_when_full() {
        let on = full_button_state(true);
        assert!(on.on, "se tiñe a pantalla completa");
        assert!(!on.small, "y no se encoge");
        assert_eq!(on.side(), 32.0);
        // Apagado: mismo tamaño, sin teñir.
        let off = full_button_state(false);
        assert_eq!((off.on, off.small, off.side()), (false, false, 32.0));
        // Los botones pequeños siguen midiendo 28.
        assert_eq!(
            chrome::IbState {
                small: true,
                on: false
            }
            .side(),
            28.0
        );
    }
}
