//! Eventos: una ficha ancha por evento semanal o especial, con sus tandas por día.
use super::super::{
    Calendar, Series,
    chrome::{self, btn, btn_pri, center_message, class_chip, disp, icon, skin, t},
    clock::{self, duration_txt},
    model::Kind,
    rows,
};
use super::Modal;
use crate::orbit;
use chrono::{DateTime, Datelike, Utc};
use gpui::{Context, Div, div, prelude::*, px, rgb};

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = skin(cx);
    let Some(schedule) = cal.schedule().cloned() else {
        return div();
    };
    let (now, zone) = (cal.now(), cal.zone());
    let compact = cal.adapt.width < 1400.0;
    // Los eventos se ordenan por su próxima tanda: el más cercano primero.
    let mut events: Vec<(&Series, Option<DateTime<Utc>>)> = schedule
        .series
        .iter()
        .filter(|s| !rows::is_daily(s))
        .map(|s| (s, schedule.next_start(s, now)))
        .collect();
    events.sort_by_key(|(_, next)| next.map_or(i64::MAX, |at| at.timestamp()));
    if events.is_empty() {
        return chrome::card(cx).flex_1().child(center_message(
            "star-line",
            skin.text2,
            "Esta semana no hay eventos",
            "Las series semanales y especiales aparecerán aquí cuando LMU las publique.",
            vec![],
            cx,
        ));
    }
    let (valid_from, valid_until) = schedule.window().unwrap_or((now, now));
    let launch = cal.launch_label();
    let zone_label = zone.long(now);
    let mut list = div()
        .id("calendar-events")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .gap(px(14.0));
    for (index, (series, next)) in events.into_iter().enumerate() {
        let fav = rows::is_fav(cal.favorites(), series);
        let starts = schedule
            .starts(series, valid_from, valid_until)
            .unwrap_or_default();
        let range = match (starts.first(), starts.last()) {
            (Some(a), Some(b)) => {
                let (da, db) = (zone.race_day(*a), zone.race_day(*b));
                format!(
                    "{} {} → {} {} {}",
                    clock::day_name(da),
                    da.day(),
                    clock::day_name(db),
                    db.day(),
                    clock::month_name(db)
                )
            }
            _ => String::new(),
        };
        let mut by_day: Vec<(chrono::NaiveDate, Vec<DateTime<Utc>>)> = vec![];
        for at in &starts {
            let day = zone.race_day(*at);
            match by_day.last_mut() {
                Some((d, v)) if *d == day => v.push(*at),
                _ => by_day.push((day, vec![*at])),
            }
        }
        let mut days = div().flex().flex_col().gap(px(6.0));
        for (day, day_starts) in by_day {
            let label = match zone.race_day_rel(day_starts[0], now).as_str() {
                rel @ ("hoy" | "mañana") => rel.to_uppercase(),
                _ => format!("{} {}", clock::day_name(day), day.day()).to_uppercase(),
            };
            let (gone, upcoming): (Vec<_>, Vec<_>) =
                day_starts.into_iter().partition(|at| *at < now);
            // Hoy se agrupan las que ya salieron; un día entero pasado se enseña atenuado.
            let compress = !gone.is_empty() && !upcoming.is_empty();
            let mut chips = div().flex().flex_wrap().gap(px(4.0));
            if compress {
                chips = chips.child(
                    div()
                        .h(px(28.0))
                        .px(px(8.0))
                        .flex()
                        .items_center()
                        .rounded(px(7.0))
                        .opacity(0.45)
                        .bg(rgb(skin.l2))
                        .border_1()
                        .border_color(orbit::alpha(skin.line1))
                        .child(t(
                            format!("{} ya salieron", gone.len()),
                            11.0,
                            600,
                            skin.text2,
                            cx,
                        )),
                );
            }
            for at in gone
                .iter()
                .filter(|_| !compress)
                .chain(upcoming.iter())
                .copied()
            {
                let alerted = cal.alerts.slot_at(&series.id, at);
                let sid = series.id.clone();
                let is_next = Some(at) == next;
                chips = chips.child(
                    chrome::slot_chip(
                        (
                            "calendar-event-slot",
                            (index << 20) | (at.timestamp() as usize & 0xfffff),
                        ),
                        &zone.hm(at),
                        (at < now, is_next, alerted),
                        is_next.then_some("siguiente"),
                        cx,
                    )
                    .on_click(
                        cx.listener(move |this, _, _, cx| this.toggle_slot_alert(&sid, at, cx)),
                    ),
                );
            }
            days = days.child(
                div()
                    .flex()
                    .items_start()
                    .gap(px(12.0))
                    .child(
                        div()
                            .w(px(64.0))
                            .flex_none()
                            .pt(px(7.0))
                            .child(chrome::cap(&label, skin.cap, cx)),
                    )
                    .child(div().flex_1().min_w_0().child(chips)),
            );
        }
        let sid = series.id.clone();
        let (name_id, fav_id, ficha_id) = (sid.clone(), sid.clone(), sid);
        let special = series.kind() == Kind::Special;
        let poster = orbit::hero_surface(cx)
            .w(px(if compact { 300.0 } else { 380.0 }))
            .flex_none()
            .relative()
            .overflow_hidden()
            .px(px(20.0))
            .py(px(18.0))
            .child(
                div()
                    .absolute()
                    .right(px(-10.0))
                    .bottom(px(-46.0))
                    .opacity(0.10)
                    .child(disp(
                        if special { "10H" } else { "WEC" },
                        170.0,
                        chrome::acc(cx),
                        cx,
                    )),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(chrome::tier(series, cx))
                    .child(t(range, 12.5, 400, skin.text2, cx))
                    .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx))),
            )
            .child(div().flex_1())
            .child(
                disp(series.name.clone(), 32.0, 0x00ff_ffff, cx)
                    .id(("calendar-event-name", index))
                    .cursor_pointer()
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.open_serie(name_id.clone(), cx);
                    })),
            )
            .child(
                div()
                    .flex()
                    .gap(px(10.0))
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
                        skin.text3,
                        cx,
                    )),
            )
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .gap(px(10.0))
                    .mt(px(8.0))
                    .children(series.class_chips().iter().map(|c| class_chip(c, cx))),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .flex_wrap()
                    .gap(px(10.0))
                    .mt(px(14.0))
                    .child(
                        btn(("calendar-event-fav", index), "", true, cx)
                            .when(fav, |b| b.border_color(chrome::acc_line(cx)))
                            .child(chrome::star(fav, 14.0, cx))
                            .child(t(
                                if fav { "En favoritas" } else { "Favorita" },
                                12.5,
                                500,
                                if fav { chrome::acct(cx) } else { skin.text1 },
                                cx,
                            ))
                            .on_click(
                                cx.listener(move |this, _, _, cx| this.toggle_fav(&fav_id, cx)),
                            ),
                    )
                    .child(match next {
                        Some(at) => div()
                            .flex()
                            .items_center()
                            .gap(px(4.0))
                            .child(t("Siguiente:", 12.5, 400, skin.text2, cx))
                            .child(chrome::bold_mono(
                                format!("{} {}", zone.race_day_rel(at, now), zone.hm(at)),
                                12.5,
                                skin.text1,
                                cx,
                            ))
                            .child(t(
                                format!("· {}", clock::in_txt(at - now)),
                                12.5,
                                400,
                                skin.text2,
                                cx,
                            )),
                        None => div().child(t("Terminado esta semana", 12.5, 400, skin.text2, cx)),
                    }),
            );
        let facts = div().flex().gap(px(8.0)).children(
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
                (
                    "Seguridad",
                    if series.safety_rating.is_empty() {
                        "—".to_owned()
                    } else if special {
                        series.safety_rating.replace("Player SR ", "SR ")
                    } else {
                        series.safety_rating.clone()
                    },
                ),
                (
                    "Divisiones",
                    series
                        .splits
                        .map_or("—".to_owned(), |n| format!("hasta {n}")),
                ),
            ]
            .map(|(label, value)| chrome::fact(label, value, cx)),
        );
        let needs_udp = series.notes.iter().any(|n| n.contains("tracerudp"));
        let detail = div()
            .flex_1()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(12.0))
            .px(px(18.0))
            .py(px(16.0))
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(orbit::caps(
                        if special {
                            "Elige tanda"
                        } else {
                            "Tandas de la semana"
                        },
                        11.5,
                        skin.text2,
                        cx,
                    ))
                    .child(
                        div().flex_1().min_w_0().child(
                            t(
                                format!("Pulsa una hora para avisarte · {zone_label}"),
                                12.0,
                                500,
                                skin.text3,
                                cx,
                            )
                            .text_right(),
                        ),
                    ),
            )
            .child(days)
            .child(facts)
            .when(needs_udp, |d| {
                d.child(
                    div()
                        .flex_none()
                        .flex()
                        .items_start()
                        .gap(px(10.0))
                        .px(px(12.0))
                        .py(px(10.0))
                        .rounded(px(8.0))
                        .border_1()
                        .border_color(chrome::tint(skin.warn, 0.22))
                        .bg(chrome::tint(skin.warn, 0.12))
                        .child(icon("warn", 16.0, skin.warn))
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_wrap()
                                .gap(px(4.0))
                                .child(t(
                                    "Opción de lanzamiento obligatoria:",
                                    12.5,
                                    700,
                                    skin.text1,
                                    cx,
                                ))
                                .child(chrome::mono("+tracerudp=3", 12.0, skin.text1, cx))
                                .child(t(
                                    format!(
                                        "«{}» la añade sola para este evento.",
                                        launch.replace("Lanzar «", "Lanzar ").replace('»', "")
                                    ),
                                    12.5,
                                    400,
                                    skin.text2,
                                    cx,
                                )),
                        ),
                )
            })
            .child(div().flex_1())
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .child(
                        btn_pri(("calendar-event-launch", index), &launch, false, cx)
                            .on_click(cx.listener(|this, _, _, cx| this.launch_profile(cx))),
                    )
                    .child(
                        btn(("calendar-event-ics", index), "", false, cx)
                            .child(icon("v-calendar", 15.0, skin.text1))
                            .child(t(
                                "Añadir tandas a mi calendario",
                                13.0,
                                500,
                                skin.text1,
                                cx,
                            ))
                            .on_click(
                                cx.listener(|this, _, _, cx| this.open_modal(Modal::Ics, cx)),
                            ),
                    )
                    .child(div().flex_1())
                    .child(
                        btn(("calendar-event-sheet", index), "", false, cx)
                            .bg(gpui::hsla(0.0, 0.0, 0.0, 0.0))
                            .child(icon("info", 15.0, skin.text1))
                            .child(t("Ficha", 13.0, 500, skin.text1, cx))
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
        .child(list)
}
