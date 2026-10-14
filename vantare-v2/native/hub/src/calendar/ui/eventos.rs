//! Eventos: una ficha ancha por evento semanal o especial, con sus tandas por día.
use super::super::{
    Calendar, Series,
    chrome::{self, Tone, banner, btn, btn_pri, center_message, class_chip, disp, icon, skin, t},
    clock::{self, duration_txt},
    model::Kind,
    rows,
};
use super::{
    Modal, fav_seg,
    semana::{Chip, time_chip},
};
use crate::orbit;
use chrono::{DateTime, Datelike, Utc};
use gpui::{Context, Div, div, prelude::*, px};

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = skin(cx);
    let Some(schedule) = cal.schedule().cloned() else {
        return div();
    };
    let (now, zone) = (cal.now(), cal.zone());
    let only_favs = cal.ui.filter.only_favs;
    let events: Vec<&Series> = schedule
        .series
        .iter()
        .filter(|s| !rows::is_daily(s))
        .filter(|s| !only_favs || rows::is_fav(cal.favorites(), s))
        .collect();
    let bar = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(12.0))
        .child(
            div()
                .flex_1()
                .child(disp("Eventos de la semana", 20.0, skin.text1, cx))
                .child(t("Tandas fijas, en tu hora", 12.0, 400, skin.cap, cx)),
        )
        .child(fav_seg(cal, None, cx));
    if events.is_empty() {
        return div()
            .flex_1()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .child(bar)
            .child(chrome::card(cx).flex_1().child(center_message(
                "star-line",
                skin.text2,
                "Ninguna favorita es un evento",
                "Quita el filtro «Favoritas» para ver los eventos de la semana.",
                vec![],
                cx,
            )));
    }
    let (valid_from, valid_until) = schedule.window().unwrap_or((now, now));
    let launch = cal.launch_label();
    let zone_label = zone.long(now).split(" · ").last().unwrap_or("").to_owned();
    let mut list = div()
        .id("calendar-events")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .gap(px(14.0));
    for (index, series) in events.into_iter().enumerate() {
        let fav = rows::is_fav(cal.favorites(), series);
        let starts = schedule
            .starts(series, valid_from, valid_until)
            .unwrap_or_default();
        let next = starts.iter().copied().find(|at| *at >= now);
        let range = match (starts.first(), starts.last()) {
            (Some(a), Some(b)) => format!("{} → {}", zone.day_long(*a), zone.day_long(*b)),
            _ => String::new(),
        };
        let mut by_day: Vec<(chrono::NaiveDate, Vec<DateTime<Utc>>)> = vec![];
        for at in &starts {
            let day = zone.date(*at);
            match by_day.last_mut() {
                Some((d, v)) if *d == day => v.push(*at),
                _ => by_day.push((day, vec![*at])),
            }
        }
        let mut days = div().flex().flex_col().gap(px(8.0));
        for (day, day_starts) in by_day {
            let label = match zone.day_rel(day_starts[0], now).as_str() {
                rel @ ("hoy" | "mañana") => rel.to_uppercase(),
                _ => format!("{} {}", clock::day_name(day), day.day()).to_uppercase(),
            };
            let (gone, upcoming): (Vec<_>, Vec<_>) =
                day_starts.into_iter().partition(|at| *at < now);
            // Hoy se agrupan las que ya salieron; un día entero pasado se enseña atenuado.
            let compress = !gone.is_empty() && !upcoming.is_empty();
            let mut row = div()
                .flex()
                .items_center()
                .gap(px(6.0))
                .flex_wrap()
                .child(chrome::cap(&label, skin.cap, cx).w(px(82.0)));
            if compress {
                row = row.child(t(
                    format!("{} ya salieron", gone.len()),
                    11.5,
                    400,
                    skin.cap,
                    cx,
                ));
            }
            for at in gone
                .iter()
                .filter(|_| !compress)
                .chain(upcoming.iter())
                .copied()
            {
                let alerted = cal.alerts.slot_at(&series.id, at);
                let sid = series.id.clone();
                let chip = if alerted {
                    Chip::Bell
                } else if Some(at) == next {
                    Chip::Next
                } else if fav {
                    Chip::Fav
                } else {
                    Chip::Plain
                };
                row = row.child(
                    div()
                        .id((
                            "calendar-event-slot",
                            (index << 20) | (at.timestamp() as usize & 0xfffff),
                        ))
                        .cursor_pointer()
                        .when(at < now, |c| c.opacity(0.5))
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.toggle_slot_alert(&sid, at, cx)),
                        )
                        .child(time_chip(&zone.hm(at), chip, cx)),
                );
            }
            days = days.child(row);
        }
        let sid = series.id.clone();
        let (name_id, fav_id, ficha_id) = (sid.clone(), sid.clone(), sid);
        let special = series.kind() == Kind::Special;
        let poster = orbit::hero_surface(cx)
            .w(px(380.0))
            .flex_none()
            .p(px(18.0))
            .justify_between()
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(chrome::tier(series, cx))
                    .child(t(range, 12.5, 400, skin.text2, cx))
                    .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx))),
            )
            .child(
                div()
                    .child(
                        disp(series.name.clone(), 34.0, 0x00ff_ffff, cx)
                            .id(("calendar-event-name", index))
                            .cursor_pointer()
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.open_serie(name_id.clone(), cx);
                            })),
                    )
                    .child(
                        div()
                            .flex()
                            .gap(px(8.0))
                            .mt(px(8.0))
                            .child(t(
                                series.track_short().to_owned(),
                                13.0,
                                700,
                                skin.text1,
                                cx,
                            ))
                            .child(t(
                                series.track_layout().to_owned(),
                                13.0,
                                400,
                                skin.text2,
                                cx,
                            )),
                    )
                    .child(
                        div()
                            .flex()
                            .gap(px(10.0))
                            .mt(px(6.0))
                            .children(series.class_chips().iter().map(|c| class_chip(c, cx))),
                    )
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(10.0))
                            .mt(px(14.0))
                            .child(
                                btn(
                                    ("calendar-event-fav", index),
                                    if fav {
                                        "En favoritas"
                                    } else {
                                        "Añadir a favoritas"
                                    },
                                    true,
                                    cx,
                                )
                                .child(chrome::star(fav, 13.0, cx))
                                .on_click(
                                    cx.listener(move |this, _, _, cx| this.toggle_fav(&fav_id, cx)),
                                ),
                            )
                            .when_some(next, |r, at| {
                                r.child(t(
                                    format!(
                                        "Siguiente: {} {} · {}",
                                        zone.day_rel(at, now),
                                        zone.hm(at),
                                        clock::in_txt(at - now)
                                    ),
                                    12.5,
                                    500,
                                    skin.text1,
                                    cx,
                                ))
                            }),
                    ),
            );
        let stats = div().flex().gap(px(8.0)).children(
            [
                (
                    "Formato",
                    if series.format == "team" {
                        "Equipos".to_owned()
                    } else {
                        "Individual".to_owned()
                    },
                ),
                ("Carrera", duration_txt(series.race_minutes())),
                ("Seguridad", series.safety_rating.clone()),
                (
                    "Divisiones",
                    series
                        .splits
                        .map_or(String::new(), |n| format!("hasta {n}")),
                ),
            ]
            .map(|(label, value)| {
                chrome::kv_box(
                    label,
                    if value.is_empty() {
                        "—".into()
                    } else {
                        value
                    },
                    cx,
                )
                .flex_1()
            }),
        );
        let detail = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .p(px(18.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .child(
                        chrome::cap(
                            if special {
                                "Elige tanda"
                            } else {
                                "Tandas de la semana"
                            },
                            skin.text2,
                            cx,
                        )
                        .flex_1(),
                    )
                    .child(t(
                        format!("Pulsa una hora para avisarte · {zone_label}"),
                        11.5,
                        400,
                        skin.cap,
                        cx,
                    )),
            )
            .child(days)
            .child(stats)
            .when_some(series.notes.first().cloned(), |d, note| {
                d.child(banner(
                    Tone::Warn,
                    "warn",
                    t(note, 12.5, 400, skin.text1, cx),
                    None,
                    cx,
                ))
            })
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(8.0))
                    .child(
                        btn_pri(("calendar-event-launch", index), &launch, false, cx)
                            .on_click(cx.listener(|this, _, _, cx| this.launch_profile(cx))),
                    )
                    .child(
                        btn(
                            ("calendar-event-ics", index),
                            "Añadir tandas a mi calendario",
                            false,
                            cx,
                        )
                        .child(icon("copy", 14.0, skin.text1))
                        .on_click(cx.listener(|this, _, _, cx| this.open_modal(Modal::Ics, cx))),
                    )
                    .child(
                        btn(("calendar-event-sheet", index), "Ficha", false, cx)
                            .child(icon("info", 14.0, skin.text1))
                            .on_click(cx.listener(move |this, _, _, cx| {
                                this.open_ficha(ficha_id.clone(), None, cx);
                            })),
                    ),
            );
        list = list.child(
            chrome::card(cx)
                .flex_none()
                .flex_row()
                .child(poster)
                .child(detail),
        );
    }
    div()
        .flex_1()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(bar)
        .child(list)
}
