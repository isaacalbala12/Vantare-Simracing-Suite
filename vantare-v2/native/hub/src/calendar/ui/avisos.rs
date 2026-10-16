//! Capas centrales: editor de Avisos y exportación `.ics`.
use super::super::{
    Calendar, Event,
    alerts::{Alerts, Band, Days, LEADS, Mode},
    chrome::{self, acc, acct, btn, btn_text_pri, disp, ib, icon, rule, t},
    ics,
};
use crate::orbit;
use chrono::Duration;
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
                    .rounded(px(14.0))
                    .bg(rgb(skin.l1))
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
                            .pt(px(18.0))
                            .pb(px(14.0))
                            .child(
                                div()
                                    .flex_1()
                                    .child(disp(title.to_owned(), 26.0, skin.text1, cx))
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
                            .py(px(14.0))
                            .bg(rgb(skin.l2)),
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
        this.update_alerts(&change);
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
        .gap(px(10.0))
        .px(px(12.0))
        .py(px(10.0))
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
            gpui::hsla(0.0, 0.0, 0.0, 0.0)
        })
        .child(
            div()
                .size(px(16.0))
                .flex_none()
                .mt(px(2.0))
                .rounded(px(4.0))
                .flex()
                .items_center()
                .justify_center()
                .when(on, |b| {
                    b.bg(orbit::ramp(skin.button, 180.0))
                        .child(icon("check", 12.0, 0x00ff_ffff))
                })
                .when(!on, |b| b.border_2().border_color(rgb(skin.text3))),
        )
        .child(
            div()
                .flex_1()
                .child(t(label.to_owned(), 13.0, 600, skin.text1, cx))
                .child(t(hint.to_owned(), 12.5, 400, skin.text3, cx)),
        )
}

/// Opción con interruptor dentro de una tarjeta (`.opt` con `.sw`).
fn switch_card(
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
        .gap(px(10.0))
        .px(px(12.0))
        .py(px(10.0))
        .rounded(px(9.0))
        .cursor_pointer()
        .border_1()
        .border_color(if on {
            chrome::acc_line(cx)
        } else {
            orbit::alpha(skin.line1)
        })
        .child(div().mt(px(2.0)).child(chrome::switch(on, cx)))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(t(label.to_owned(), 13.0, 600, skin.text1, cx))
                .child(t(hint.to_owned(), 12.5, 400, skin.text3, cx)),
        )
}

fn band_or_default(alerts: &Alerts, series_id: &str) -> Band {
    alerts.band(series_id).cloned().unwrap_or_else(|| Band {
        series_id: series_id.to_owned(),
        from: 20 * 60,
        to: 23 * 60,
        days: Days::All,
        mode: Mode::Each,
    })
}

/// Editor de franja del contrato (`.bandbox`): interruptor, horas, días, modo y antelación.
/// Con la franja apagada enseña los valores por defecto; tocar cualquiera la enciende.
pub(super) fn band_box(
    cal: &Calendar,
    series: &super::super::Series,
    cx: &mut Context<Calendar>,
) -> Div {
    let skin = chrome::skin(cx);
    let band = cal.alerts.band(&series.id).cloned();
    let on = band.is_some();
    let shown = band_or_default(&cal.alerts, &series.id);
    let per_day = series.every().map_or(0, |every| {
        (i64::from(shown.to) - i64::from(shown.from) + every - 1) / every.max(1)
    });
    let id = series.id.clone();
    let tin = |tag: &'static str, minutes: u16, is_to: bool, cx: &mut Context<Calendar>| {
        let id = id.clone();
        div()
            .id((tag, 0usize))
            .h(px(28.0))
            .px(px(9.0))
            .flex()
            .items_center()
            .rounded(px(7.0))
            .cursor_pointer()
            .bg(rgb(skin.l1))
            .border_1()
            .border_color(orbit::alpha(skin.line2))
            .child(chrome::bold_mono(
                minutes_txt(minutes),
                12.5,
                skin.text1,
                cx,
            ))
            .on_click(edit(cx, move |a| {
                let mut band = band_or_default(a, &id);
                if is_to {
                    band.to = if band.to >= 1440 {
                        band.from + 30
                    } else {
                        (band.to + 30).min(1440)
                    };
                } else {
                    band.from = if band.from + 60 > band.to {
                        0
                    } else {
                        band.from + 30
                    };
                }
                a.set_band(&id, Some(band))
            }))
    };
    let mut days_seg = chrome::seg_mini_group(cx);
    for (index, (value, label)) in [
        (Days::All, "Todos"),
        (Days::Weekdays, "Lun–vie"),
        (Days::Weekend, "Finde"),
    ]
    .into_iter()
    .enumerate()
    {
        let id = id.clone();
        days_seg = days_seg.child(
            chrome::seg_mini(
                ("calendar-bandbox-days", index),
                label,
                shown.days == value,
                cx,
            )
            .on_click(edit(cx, move |a| {
                let mut band = band_or_default(a, &id);
                band.days = value;
                a.set_band(&id, Some(band))
            })),
        );
    }
    let mut mode_seg = chrome::seg_mini_group(cx);
    for (index, (value, label)) in [
        (Mode::Each, "Cada salida"),
        (Mode::First, "Solo la primera"),
    ]
    .into_iter()
    .enumerate()
    {
        let id = id.clone();
        mode_seg = mode_seg.child(
            chrome::seg_mini(
                ("calendar-bandbox-mode", index),
                label,
                shown.mode == value,
                cx,
            )
            .on_click(edit(cx, move |a| {
                let mut band = band_or_default(a, &id);
                band.mode = value;
                a.set_band(&id, Some(band))
            })),
        );
    }
    let mut lead_seg = chrome::seg_mini_group(cx);
    for lead in [5u8, 10, 15] {
        lead_seg = lead_seg.child(
            chrome::seg_mini(
                ("calendar-bandbox-lead", usize::from(lead)),
                &format!("{lead}′"),
                cal.alerts.lead_min == lead,
                cx,
            )
            .on_click(edit(cx, move |a| {
                a.lead_min = lead;
                Ok(())
            })),
        );
    }
    let title = if on {
        format!(
            "Te avisamos de las salidas de {}–{}",
            minutes_txt(shown.from),
            minutes_txt(shown.to)
        )
    } else {
        "Avisarme por franja horaria".to_owned()
    };
    let hint = if on {
        format!(
            "{} · {per_day} salidas por día · se calla si ya estás en pista",
            shown.days.label()
        )
    } else {
        "Elige de qué hora a qué hora quieres que te avisemos.".to_owned()
    };
    let toggle_id = id.clone();
    let label = |text: &'static str, cx: &gpui::App| t(text, 12.0, 400, skin.text3, cx);
    div()
        .flex_none()
        .flex()
        .flex_col()
        .gap(px(9.0))
        .px(px(12.0))
        .py(px(10.0))
        .rounded(px(9.0))
        .border_1()
        .border_color(if on {
            chrome::acc_line(cx)
        } else {
            orbit::alpha(skin.line1)
        })
        .bg(if on {
            chrome::acc_bg(cx)
        } else {
            rgb(skin.l2).into()
        })
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(12.0))
                .child(icon(
                    if on { "bell-fill" } else { "bell" },
                    16.0,
                    if on { acct(cx) } else { skin.text3 },
                ))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(t(title, 13.0, 600, skin.text1, cx))
                        .child(t(hint, 12.5, 400, skin.text3, cx)),
                )
                .child(
                    div()
                        .id("calendar-bandbox-switch")
                        .role(gpui::Role::Switch)
                        .aria_label("Avisar por franja horaria")
                        .aria_selected(on)
                        .cursor_pointer()
                        .child(chrome::switch(on, cx))
                        .on_click(edit(cx, move |a| {
                            if a.band(&toggle_id).is_some() {
                                a.set_band(&toggle_id, None)
                            } else {
                                let band = band_or_default(a, &toggle_id);
                                a.set_band(&toggle_id, Some(band))
                            }
                        })),
                ),
        )
        .child(
            div()
                .flex()
                .flex_wrap()
                .items_center()
                .gap(px(6.0))
                .child(label("Entre", cx))
                .child(tin("calendar-bandbox-from", shown.from, false, cx))
                .child(label("y", cx))
                .child(tin("calendar-bandbox-to", shown.to, true, cx))
                .child(days_seg),
        )
        .child(
            div()
                .flex()
                .flex_wrap()
                .items_center()
                .gap(px(5.0))
                .child(label("Avisar", cx))
                .child(mode_seg)
                .child(div().flex_1())
                .child(label("Antes", cx))
                .child(lead_seg),
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

    let mut leads = chrome::seg_mini_group(cx).mb(px(16.0)).self_start();
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
            switch_card(
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
            div()
                .flex()
                .flex_col()
                .gap(px(2.0))
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(4.0))
                        .child(t("Series diarias:", 12.0, 700, skin.text2, cx))
                        .child(t(
                            "por franja horaria («de 20:00 a 23:00»), desde su ficha o su página.",
                            12.0,
                            400,
                            skin.cap,
                            cx,
                        )),
                )
                .child(
                    div()
                        .flex()
                        .flex_wrap()
                        .gap(px(4.0))
                        .child(t(
                            "Eventos semanales y especiales:",
                            12.0,
                            700,
                            skin.text2,
                            cx,
                        ))
                        .child(t("tanda a tanda.", 12.0, 400, skin.cap, cx)),
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
    let sample_start = schedule.as_ref().and_then(|s| {
        s.series
            .iter()
            .find(|x| alerts.band(&x.id).is_some())
            .or_else(|| s.series.first())
            .and_then(|series| {
                let first = s.next_start(series, now)?;
                Some((first, s.next_start(series, first + Duration::seconds(1))))
            })
    });
    let sample_at = sample_start.map(|(at, _)| zone.hm(at)).unwrap_or_default();
    let sample_next = sample_start
        .and_then(|(_, next)| next)
        .map(|at| zone.hm(at));
    let band_txt = schedule
        .as_ref()
        .and_then(|s| {
            s.series
                .iter()
                .find_map(|x| alerts.band(&x.id).map(|b| (x, b)))
        })
        .map(|(_, b)| format!(" · tu franja {}–{}", minutes_txt(b.from), minutes_txt(b.to)))
        .unwrap_or_default();
    let preview = div()
        .flex_none()
        .p(px(18.0))
        .rounded(px(12.0))
        .mb(px(4.0))
        .bg(gpui::linear_gradient(
            135.0,
            gpui::linear_color_stop(rgb(0x1D_3557), 0.0),
            gpui::linear_color_stop(rgb(0x3A_2140), 1.0),
        ))
        .child(chrome::windows_toast(
            &format!("{sample_name} sale a las {sample_at}"),
            &format!(
                "{sample_track} · carrera {sample_race} min{band_txt}. {}",
                sample_next.map_or_else(
                    || "Si no llegas, la siguiente sale unos minutos después.".to_owned(),
                    |at| format!("Si no llegas, la siguiente sale a las {at}."),
                ),
            ),
            alerts.lead_min,
            cx,
        ));

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
            btn_text_pri("calendar-alerts-done", "Guardar", cx).on_click(cx.listener(
                |this, _, _, cx| {
                    this.escape(cx);
                },
            )),
        );
    modal(
        cal.ui.viewport,
        "Avisos",
        "Te avisamos antes de que salga la carrera que elijas. Funciona con el Hub cerrado: queda un icono junto al reloj.",
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
    let (now, zone) = (cal.now(), cal.zone());
    // La lista completa se arma una vez por minuto o cambio de datos, no en cada
    // repintado: solo se enseñan cuatro y el total.
    let key = (cal.revision, now.timestamp().div_euclid(60), options);
    if cal.ui.ics_preview.as_ref().is_none_or(|(k, _)| *k != key) {
        let entries = cal
            .schedule()
            .and_then(|s| ics::entries(s, cal.favorites(), &cal.alerts, options, now).ok())
            .unwrap_or_default();
        cal.ui.ics_preview = Some((key, entries));
    }
    let entries = cal
        .ui
        .ics_preview
        .as_ref()
        .map_or(&[][..], |(_, e)| e.as_slice());
    let (preview, total): (Vec<ics::Entry>, usize) =
        (entries.iter().take(4).cloned().collect(), entries.len());
    let radio = |on: bool| {
        div()
            .size(px(16.0))
            .flex_none()
            .mt(px(2.0))
            .rounded_full()
            .border_2()
            .border_color(if on { rgb(acc(cx)) } else { rgb(skin.text3) })
            .when(on, |d| {
                d.flex()
                    .items_center()
                    .justify_center()
                    .child(div().size(px(6.0)).rounded_full().bg(rgb(acc(cx))))
            })
    };
    let option = |id: &'static str, label: &str, hint: &str, on: bool, cx: &gpui::App| {
        div()
            .id(id)
            .role(gpui::Role::RadioButton)
            .aria_label(label.to_owned())
            .aria_selected(on)
            .tab_index(0)
            .flex()
            .items_start()
            .gap(px(10.0))
            .px(px(12.0))
            .py(px(10.0))
            .mb(px(8.0))
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
                gpui::hsla(0.0, 0.0, 0.0, 0.0)
            })
            .child(radio(on))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(t(label.to_owned(), 13.0, 600, skin.text1, cx))
                    .child(t(hint.to_owned(), 12.5, 400, skin.text3, cx)),
            )
    };
    let scope = |value: ics::Scope| cal.ui.ics.scope == value;
    let left = div()
        .flex_1()
        .min_w_0()
        .child(chrome::section_title("Qué añadir", None, cx))
        .child(
            option(
                "calendar-ics-favs",
                "Mis favoritas",
                "Semanales y especiales: cada tanda. Diarias: solo las salidas con aviso (las de cada 15 min llenarían tu calendario).",
                scope(ics::Scope::Favs),
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.ics.scope = ics::Scope::Favs;
                cx.notify();
            })),
        )
        .child(
            option(
                "calendar-ics-events",
                "Solo eventos semanales y especiales",
                "Todas las tandas de los eventos de la semana.",
                scope(ics::Scope::Events),
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.ics.scope = ics::Scope::Events;
                cx.notify();
            })),
        )
        .child(
            option(
                "calendar-ics-all",
                "Todas las series",
                "Eventos con todas sus tandas y las diarias que caen en tus avisos.",
                scope(ics::Scope::All),
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.ics.scope = ics::Scope::All;
                cx.notify();
            })),
        )
        .child(div().mt(px(12.0)).child(
            check_card(
                "calendar-ics-alarm",
                "Incluir recordatorio del calendario",
                &format!(
                    "{} min antes, además del aviso de Vantare.",
                    cal.alerts.lead_min
                ),
                options.alarm,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.ics.alarm = !this.ui.ics.alarm;
                cx.notify();
            })),
        ));
    let mut list = div().flex().flex_col();
    for entry in &preview {
        list = list.child(
            div()
                .flex()
                .justify_between()
                .gap(px(8.0))
                .py(px(5.0))
                .border_b_1()
                .border_color(orbit::alpha(skin.line1))
                .child(
                    div()
                        .flex()
                        .gap(px(4.0))
                        .child(t(
                            format!(
                                "{} {} ·",
                                crate::calendar::clock::day_name(zone.date(entry.start)),
                                chrono::Datelike::day(&zone.date(entry.start))
                            ),
                            12.5,
                            400,
                            skin.text3,
                            cx,
                        ))
                        .child(chrome::mono(zone.hm(entry.start), 12.5, skin.text2, cx)),
                )
                .child(t(entry.summary.clone(), 12.5, 400, skin.text1, cx).truncate()),
        );
    }
    let right = div()
        .flex_1()
        .min_w_0()
        .child(chrome::section_title("Cómo", None, cx))
        .child(
            div()
                .mb(px(8.0))
                .px(px(12.0))
                .py(px(10.0))
                .rounded(px(9.0))
                .border_1()
                .border_color(orbit::alpha(skin.line1))
                .opacity(0.7)
                .child(t("Suscripción · próximamente", 13.0, 600, skin.text1, cx))
                .child(t(
                    "Se actualizaría sola cada semana; necesita servidor y cuenta.",
                    12.5,
                    400,
                    skin.text3,
                    cx,
                )),
        )
        .child(option(
            "calendar-ics-file",
            "Descargar archivo .ics",
            "Una sola vez; no se actualiza.",
            true,
            cx,
        ))
        .child(div().mt(px(12.0)).child(chrome::section_title(
            &format!(
                "Vista previa · {} evento{} esta semana",
                total,
                if total == 1 { "" } else { "s" }
            ),
            None,
            cx,
        )))
        .child(list);
    let body = div().flex().gap(px(22.0)).child(left).child(right);
    let footer = div()
        .child(
            t(
                "El archivo se guarda en tu carpeta Descargas.",
                12.0,
                400,
                skin.cap,
                cx,
            )
            .flex_1(),
        )
        .child(
            btn("calendar-ics-cancel", "Cancelar", false, cx).on_click(cx.listener(
                |this, _, _, cx| {
                    this.escape(cx);
                },
            )),
        )
        .child(
            btn_text_pri("calendar-ics-download", "Descargar .ics", cx)
                .on_click(cx.listener(|this, _, _, cx| this.download_ics(cx))),
        );
    modal(
        cal.ui.viewport,
        "Añadir a mi calendario",
        "Tus carreras en Google Calendar, Apple Calendar u Outlook, con la hora de tu zona.",
        820.0,
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
