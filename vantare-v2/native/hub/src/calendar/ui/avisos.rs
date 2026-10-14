//! Capas centrales: editor de Avisos y exportación `.ics`.
use super::super::{
    Calendar, Event,
    alerts::{Alerts, Band, Days, LEADS, Mode},
    chrome::{self, Tone, acc, btn, btn_pri, disp, ib, icon, pill, rule, t},
    ics,
};
use crate::orbit;
use gpui::{ClickEvent, Context, Div, IntoElement, Stateful, div, prelude::*, px, rgb};

/// Capa con velo: un clic fuera o Esc la cierra.
pub(super) fn modal(
    viewport: gpui::Size<gpui::Pixels>,
    title: &str,
    subtitle: &str,
    width: f32,
    body: Div,
    footer: Div,
    cx: &mut Context<Calendar>,
) -> impl IntoElement {
    let skin = chrome::skin(cx);
    chrome::window_layer(
        viewport,
        div()
            .id("calendar-modal")
            .flex()
            .items_center()
            .justify_center()
            .bg(chrome::tint(0x0000_0000, 0.55))
            .occlude()
            .on_click(cx.listener(|this, _, _, cx| {
                this.escape(cx);
            }))
            .child(
                chrome::card(cx)
                    .id("calendar-modal-panel")
                    .w(px(width))
                    .max_w(gpui::relative(0.96))
                    .max_h(gpui::relative(0.94))
                    .on_click(|_, _, cx| cx.stop_propagation())
                    .child(
                        div()
                            .flex_none()
                            .flex()
                            .items_start()
                            .px(px(22.0))
                            .pt(px(16.0))
                            .pb(px(12.0))
                            .child(
                                div()
                                    .flex_1()
                                    .child(disp(title.to_owned(), 24.0, skin.text1, cx))
                                    .child(t(subtitle.to_owned(), 12.5, 400, skin.text3, cx)),
                            )
                            .child(
                                ib(
                                    "calendar-modal-close",
                                    "x",
                                    "Cerrar (Esc)",
                                    false,
                                    false,
                                    cx,
                                )
                                .on_click(cx.listener(
                                    |this, _, _, cx| {
                                        this.escape(cx);
                                    },
                                )),
                            ),
                    )
                    .child(rule(cx))
                    .child(
                        body.id("calendar-modal-body")
                            .flex_1()
                            .min_h_0()
                            .overflow_y_scroll()
                            .p(px(22.0)),
                    )
                    .child(rule(cx))
                    .child(
                        footer
                            .flex_none()
                            .flex()
                            .items_center()
                            .justify_end()
                            .gap(px(8.0))
                            .px(px(22.0))
                            .py(px(12.0)),
                    ),
            ),
    )
}

/// Aplica un cambio de avisos al pulsar; el error se enseña en la página.
pub(super) fn edit(
    cx: &mut Context<Calendar>,
    change: impl Fn(&mut Alerts) -> Result<(), String> + 'static,
) -> impl Fn(&ClickEvent, &mut gpui::Window, &mut gpui::App) + 'static {
    cx.listener(move |this, _, _, cx| {
        this.error = this.edit_alerts(&change).err();
        cx.notify();
    })
}

/// Interruptor con rótulo.
pub(super) fn toggle(
    id: &'static str,
    label: &str,
    hint: &str,
    on: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = chrome::skin(cx);
    div()
        .id(id)
        .role(gpui::Role::Switch)
        .aria_label(label.to_owned())
        .aria_selected(on)
        .tab_index(0)
        .flex()
        .items_center()
        .gap(px(12.0))
        .py(px(7.0))
        .cursor_pointer()
        .child(
            div()
                .w(px(34.0))
                .h(px(20.0))
                .flex_none()
                .rounded_full()
                .p(px(2.0))
                .flex()
                .when(on, gpui::Styled::justify_end)
                .bg(rgb(if on { acc(cx) } else { skin.l3 }))
                .child(div().size(px(16.0)).rounded_full().bg(rgb(0x00ff_ffff))),
        )
        .child(
            div()
                .flex_1()
                .child(t(label.to_owned(), 13.0, 500, skin.text1, cx))
                .when(!hint.is_empty(), |d| {
                    d.child(t(hint.to_owned(), 11.5, 400, skin.text3, cx))
                }),
        )
}

/// Casilla con rótulo dentro de una tarjeta, como en el contrato visual.
fn check_card(
    id: &'static str,
    label: &str,
    hint: &str,
    on: bool,
    cx: &gpui::App,
) -> Stateful<Div> {
    let skin = chrome::skin(cx);
    div()
        .id(id)
        .role(gpui::Role::CheckBox)
        .aria_label(label.to_owned())
        .aria_selected(on)
        .tab_index(0)
        .flex()
        .gap(px(12.0))
        .p(px(12.0))
        .rounded(px(9.0))
        .cursor_pointer()
        .border_1()
        .border_color(if on {
            chrome::acc_line(cx)
        } else {
            orbit::alpha(skin.line1)
        })
        .bg(if on {
            chrome::acc_bg(cx)
        } else {
            orbit::alpha(skin.hover)
        })
        .child(
            div()
                .size(px(18.0))
                .flex_none()
                .mt(px(1.0))
                .rounded(px(4.0))
                .flex()
                .items_center()
                .justify_center()
                .border_1()
                .border_color(if on {
                    rgb(acc(cx)).into()
                } else {
                    orbit::alpha(skin.line2)
                })
                .bg(rgb(if on { acc(cx) } else { skin.l2 }))
                .when(on, |b| b.child(icon("check", 12.0, 0x00ff_ffff))),
        )
        .child(
            div()
                .flex_1()
                .child(t(label.to_owned(), 13.0, 700, skin.text1, cx))
                .child(t(hint.to_owned(), 12.0, 400, skin.text3, cx)),
        )
}

pub(super) fn minutes_txt(minutes: u16) -> String {
    format!("{:02}:{:02}", minutes / 60, minutes % 60)
}

fn next_days(days: Days) -> Days {
    match days {
        Days::All => Days::Weekdays,
        Days::Weekdays => Days::Weekend,
        Days::Weekend => Days::All,
    }
}

pub(super) fn alerts_modal(cal: &mut Calendar, cx: &mut Context<Calendar>) -> impl IntoElement {
    let skin = chrome::skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let alerts = cal.alerts.clone();
    let schedule = cal.schedule().cloned();
    let name_of = |id: &str| {
        schedule
            .as_ref()
            .and_then(|s| s.by_id(id))
            .map_or_else(|| format!("{id} (ya no está)"), |s| s.name.clone())
    };

    let mut leads = div().flex().gap(px(6.0));
    for lead in LEADS {
        leads = leads.child(
            chrome::seg_button(
                ("calendar-lead", usize::from(lead)),
                &format!("{lead} min"),
                lead == alerts.lead_min,
                cx,
            )
            .on_click(edit(cx, move |a| {
                a.lead_min = lead;
                Ok(())
            })),
        );
    }
    let left = div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(10.0))
        .child(chrome::section_title("Con cuánta antelación", None, cx))
        .child(leads)
        .child(chrome::section_title("Dónde te llega", None, cx))
        .child(
            check_card(
                "calendar-ch-windows",
                "Notificación de Windows",
                "Con botones «Lanzar perfil», «Ficha» y «Posponer».",
                alerts.channels.windows,
                cx,
            )
            .on_click(edit(cx, |a| {
                a.channels.windows = !a.channels.windows;
                Ok(())
            })),
        )
        .child(
            check_card(
                "calendar-ch-track",
                "En pista, si ya estás conduciendo",
                "Un aviso discreto en tus overlays, sin sonido.",
                alerts.channels.in_track,
                cx,
            )
            .on_click(edit(cx, |a| {
                a.channels.in_track = !a.channels.in_track;
                Ok(())
            })),
        )
        .child(
            check_card(
                "calendar-ch-sound",
                "Sonido",
                "Solo fuera del simulador.",
                alerts.channels.sound,
                cx,
            )
            .on_click(edit(cx, |a| {
                a.channels.sound = !a.channels.sound;
                Ok(())
            })),
        )
        .child(chrome::section_title("Al avisar", None, cx))
        .child(
            toggle(
                "calendar-auto-launch",
                &cal.launch_label().replace('»', "» automáticamente"),
                "3 min antes de la salida, si el simulador está cerrado. Apagado por defecto.",
                alerts.auto_launch,
                cx,
            )
            .on_click(edit(cx, |a| {
                a.auto_launch = !a.auto_launch;
                Ok(())
            })),
        )
        .child(chrome::section_title("Qué se avisa", None, cx))
        .child(
            t(
                "Series diarias: por franja horaria («de 20:00 a 23:00»), desde su ficha o su página. Eventos semanales y especiales: tanda a tanda, con la campana.",
                12.5,
                400,
                skin.text2,
                cx,
            ),
        );

    // Vista previa de cómo llega el aviso.
    let sample = schedule.as_ref().and_then(|s| {
        s.series
            .iter()
            .find(|x| alerts.band(&x.id).is_some())
            .or_else(|| s.series.first())
            .map(|series| {
                (
                    series.name.clone(),
                    series.track_short().to_owned(),
                    series.race_minutes(),
                )
            })
    });
    let (sample_name, sample_track, sample_race) = sample.unwrap_or_default();
    let preview = chrome::card(cx)
        .flex_none()
        .p(px(14.0))
        .gap(px(10.0))
        .child(
            div()
                .flex()
                .items_start()
                .gap(px(12.0))
                .child(
                    div()
                        .size(px(40.0))
                        .flex_none()
                        .rounded(px(9.0))
                        .flex()
                        .items_center()
                        .justify_center()
                        .bg(chrome::acc_bg(cx))
                        .child(chrome::bold_mono(
                            format!("{}'", alerts.lead_min),
                            13.0,
                            chrome::acct(cx),
                            cx,
                        )),
                )
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(t(
                            format!("{sample_name} sale en {} min", alerts.lead_min),
                            13.5,
                            700,
                            skin.text1,
                            cx,
                        ))
                        .child(t(
                            format!("{sample_track} · carrera {sample_race} min"),
                            12.0,
                            400,
                            skin.text2,
                            cx,
                        )),
                ),
        );

    let mut list = div().flex().flex_col();
    for band in &alerts.bands {
        let editing = cal.ui.band_edit.as_deref() == Some(band.series_id.as_str());
        list = list.child(band_item(band, name_of(&band.series_id), editing, cx));
    }
    for slot in &alerts.slots {
        let at = chrono::DateTime::from_timestamp(slot.at, 0).unwrap_or(now);
        let lead = chrono::Duration::minutes(i64::from(alerts.lead_min));
        let (sid, when) = (slot.series_id.clone(), at);
        list = list.child(
            div()
                .flex()
                .items_center()
                .gap(px(10.0))
                .py(px(8.0))
                .border_b_1()
                .border_color(orbit::alpha(skin.line1))
                .child(div().size(px(7.0)).rounded_full().bg(rgb(skin.accent)))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(t(name_of(&slot.series_id), 13.0, 700, skin.text1, cx).truncate())
                        .child(t(
                            format!(
                                "{} {} · aviso a las {}",
                                zone.day_rel(at, now),
                                zone.hm(at),
                                zone.hm(at - lead)
                            ),
                            12.0,
                            400,
                            skin.text3,
                            cx,
                        )),
                )
                .child(
                    ib(
                        ("calendar-slot-remove", slot.at as usize & 0xfffff),
                        "x",
                        "Quitar aviso",
                        true,
                        false,
                        cx,
                    )
                    .on_click(edit(cx, move |a| a.toggle_slot(&sid, when))),
                ),
        );
    }
    // Series diarias favoritas sin franja: se puede crear una desde aquí.
    if let Some(schedule) = &schedule {
        for (index, series) in schedule
            .series
            .iter()
            .filter(|s| {
                s.every().is_some()
                    && cal.favorites().contains(&s.id)
                    && alerts.band(&s.id).is_none()
            })
            .enumerate()
        {
            let id = series.id.clone();
            list = list.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .py(px(8.0))
                    .child(
                        t(series.name.clone(), 13.0, 500, skin.text2, cx)
                            .flex_1()
                            .truncate(),
                    )
                    .child(
                        btn(
                            ("calendar-band-add", index),
                            "Añadir franja 20:00–23:00",
                            true,
                            cx,
                        )
                        .on_click(edit(cx, move |a| {
                            a.set_band(
                                &id,
                                Some(Band {
                                    series_id: id.clone(),
                                    from: 20 * 60,
                                    to: 23 * 60,
                                    days: Days::All,
                                    mode: Mode::Each,
                                }),
                            )
                        })),
                    ),
            );
        }
    }
    if alerts.count() == 0 {
        list = list.child(t(
            "Aún no tienes avisos. Marca una serie diaria como favorita para añadir su franja, o pulsa la campana de una tanda.",
            12.5,
            400,
            skin.text3,
            cx,
        ));
    }
    let right = div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(10.0))
        .child(chrome::section_title("Así te llegará", None, cx))
        .child(preview)
        .child(chrome::section_title(
            "Tus avisos",
            Some(format!(
                "{} franja{} · {} tanda{}",
                alerts.bands.len(),
                if alerts.bands.len() == 1 { "" } else { "s" },
                alerts.slots.len(),
                if alerts.slots.len() == 1 { "" } else { "s" }
            )),
            cx,
        ))
        .child(list);

    let footer = div()
        .child(
            btn("calendar-alerts-test", "Probar aviso", false, cx).on_click(cx.listener(
                |this, _, _, cx| {
                    cx.emit(Event::Alert {
                        series_id: "test".into(),
                        title: "Aviso de prueba del calendario".into(),
                        body: "Así te avisaremos antes de cada salida.".into(),
                    });
                    this.say("Aviso de prueba enviado", cx);
                },
            )),
        )
        .child(
            btn_pri("calendar-alerts-done", "Listo", false, cx).on_click(cx.listener(
                |this, _, _, cx| {
                    this.escape(cx);
                },
            )),
        );
    modal(
        cal.ui.viewport,
        "Avisos",
        "Te avisamos antes de que salga la carrera que elijas. Los cambios se guardan al momento.",
        860.0,
        div().flex().gap(px(26.0)).child(left).child(right),
        footer,
        cx,
    )
}

/// Fila de una franja con su editor desplegable.
fn band_item(band: &Band, name: String, editing: bool, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let key = band.series_id.len() * 100 + name.len();
    let id = band.series_id.clone();
    let (days, mode) = (band.days, band.mode);
    let shift = |label: &'static str,
                 tag: &'static str,
                 to: bool,
                 delta: i32,
                 cx: &mut Context<Calendar>| {
        let id = id.clone();
        btn((tag, key), label, true, cx).on_click(edit(cx, move |a| {
            let Some(mut band) = a.band(&id).cloned() else {
                return Ok(());
            };
            let moved = |v: u16| (i32::from(v) + delta).clamp(0, 1440) as u16;
            if to {
                band.to = moved(band.to);
            } else {
                band.from = moved(band.from);
            }
            a.set_band(&id, Some(band))
        }))
    };
    let header = div()
        .flex()
        .items_center()
        .gap(px(10.0))
        .py(px(8.0))
        .child(div().size(px(7.0)).rounded_full().bg(rgb(skin.warn)))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(t(name, 13.0, 700, skin.text1, cx).truncate())
                .child(t(
                    format!(
                        "Franja {}–{} · {} · {}",
                        minutes_txt(band.from),
                        minutes_txt(band.to),
                        days.label().to_lowercase(),
                        if mode == Mode::Each {
                            "cada salida"
                        } else {
                            "solo la primera"
                        }
                    ),
                    12.0,
                    400,
                    skin.text3,
                    cx,
                )),
        )
        .child({
            let sid = id.clone();
            btn(
                ("calendar-band-edit", key),
                if editing { "Cerrar" } else { "Editar" },
                true,
                cx,
            )
            .on_click(cx.listener(move |this, _, _, cx| {
                this.ui.band_edit = if this.ui.band_edit.as_deref() == Some(sid.as_str()) {
                    None
                } else {
                    Some(sid.clone())
                };
                cx.notify();
            }))
        })
        .child(
            ib(
                ("calendar-band-remove", key),
                "x",
                "Quitar franja",
                true,
                false,
                cx,
            )
            .on_click(edit(cx, {
                let id = id.clone();
                move |a| a.set_band(&id, None)
            })),
        );
    let editor = div()
        .flex()
        .flex_wrap()
        .items_center()
        .gap(px(6.0))
        .pb(px(10.0))
        .pl(px(17.0))
        .child(shift("Empieza −30", "calendar-from-less", false, -30, cx))
        .child(shift("+30", "calendar-from-more", false, 30, cx))
        .child(shift("Termina −30", "calendar-to-less", true, -30, cx))
        .child(shift("+30", "calendar-to-more", true, 30, cx))
        .child({
            let id = id.clone();
            btn(("calendar-band-days", key), days.label(), true, cx).on_click(edit(cx, move |a| {
                let Some(mut band) = a.band(&id).cloned() else {
                    return Ok(());
                };
                band.days = next_days(days);
                a.set_band(&id, Some(band))
            }))
        })
        .child({
            let id = id.clone();
            btn(
                ("calendar-band-mode", key),
                if mode == Mode::Each {
                    "Cada salida"
                } else {
                    "Solo la primera"
                },
                true,
                cx,
            )
            .on_click(edit(cx, move |a| {
                let Some(mut band) = a.band(&id).cloned() else {
                    return Ok(());
                };
                band.mode = if mode == Mode::Each {
                    Mode::First
                } else {
                    Mode::Each
                };
                a.set_band(&id, Some(band))
            }))
        });
    div()
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(header)
        .when(editing, |d| d.child(editor))
}

pub(super) fn ics_modal(cal: &mut Calendar, cx: &mut Context<Calendar>) -> impl IntoElement {
    let skin = chrome::skin(cx);
    let options = cal.ui.ics;
    let body = div()
        .flex()
        .flex_col()
        .gap(px(10.0))
        .child(t(
            "Descarga un archivo para importarlo en Google Calendar, Apple Calendar u Outlook. Es una copia de hoy: no se actualiza sola.",
            13.0,
            400,
            skin.text2,
            cx,
        ))
        .child(
            check_card(
                "calendar-ics-favs",
                "Solo mis favoritas",
                "Si lo apagas, entran todas las series con salidas con aviso.",
                options.only_favs,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.ics.only_favs = !this.ui.ics.only_favs;
                cx.notify();
            })),
        )
        .child(
            check_card(
                "calendar-ics-alarm",
                "Recordatorio en tu calendario",
                "Con la misma antelación que tus avisos.",
                options.alarm,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.ics.alarm = !this.ui.ics.alarm;
                cx.notify();
            })),
        )
        .child(t(
            "Las series diarias entran solo por las salidas dentro de tus franjas de aviso; los eventos, con todas sus tandas.",
            12.0,
            400,
            skin.text3,
            cx,
        ))
        .child(pill("Sin suscripción: necesitaría servidor y cuenta", Tone::Neutral, cx).self_start());
    let footer = div()
        .child(
            btn("calendar-ics-cancel", "Cancelar", false, cx).on_click(cx.listener(
                |this, _, _, cx| {
                    this.escape(cx);
                },
            )),
        )
        .child(
            btn_pri("calendar-ics-download", "Descargar .ics", false, cx)
                .on_click(cx.listener(|this, _, _, cx| this.download_ics(cx))),
        );
    modal(
        cal.ui.viewport,
        "Exportar a tu calendario",
        "Un archivo .ics con tus próximas salidas.",
        560.0,
        body,
        footer,
        cx,
    )
}

impl Calendar {
    /// Escribe el `.ics` en la carpeta Descargas y lo cuenta en un aviso.
    fn download_ics(&mut self, cx: &mut Context<Self>) {
        let Some(schedule) = self.schedule() else {
            self.say("No hay horario para exportar", cx);
            return;
        };
        let text = ics::build(
            schedule,
            self.favorites(),
            &self.alerts,
            self.ui.ics,
            self.now(),
        );
        let message = match text.and_then(|text| save_download("vantare-calendario-lmu.ics", &text))
        {
            Ok(path) => format!("Guardado en {path}"),
            Err(error) => format!("No se pudo exportar: {error}"),
        };
        self.ui.modal = None;
        self.say(message, cx);
    }
}

fn save_download(name: &str, text: &str) -> Result<String, String> {
    let home = std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .ok_or("no se encuentra tu carpeta de usuario")?;
    let dir = std::path::Path::new(&home).join("Downloads");
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let path = dir.join(name);
    std::fs::write(&path, text).map_err(|error| error.to_string())?;
    Ok(path.display().to_string())
}
