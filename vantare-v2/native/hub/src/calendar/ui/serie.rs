//! Página de una serie: todas sus salidas, avisos, reglas y circuito por semana.
use super::super::{
    Calendar,
    alerts::{Band, Days, Mode},
    chrome::{
        self, Tone, acc, acct, btn, btn_pri, center_message, class_chip, disp, icon, kv, pill,
        section_title, skin, star, t, tier,
    },
    clock::{self, duration_txt},
    rows,
};
use super::{
    Modal, View,
    avisos::minutes_txt,
    semana::{Chip, time_chip},
};
use crate::orbit;
use chrono::{DateTime, Duration, Utc};
use gpui::{Context, Div, div, prelude::*, px, rgb};

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let found = cal
        .schedule()
        .zip(cal.ui.serie.as_deref())
        .and_then(|(s, id)| s.by_id(id).map(|series| (s.clone(), series.clone())));
    let Some((schedule, series)) = found else {
        return chrome::card(cx).flex_1().child(center_message(
            "search",
            skin.text2,
            "Esta serie ya no está en el horario",
            "Vuelve a Próximas para ver las series de esta semana.",
            vec![
                btn("calendar-serie-back-empty", "Volver", false, cx)
                    .on_click(cx.listener(|this, _, _, cx| this.go(View::Proximas, cx))),
            ],
            cx,
        ));
    };
    let id = series.id.clone();
    let fav = rows::is_fav(cal.favorites(), &series);
    let daily = rows::is_daily(&series);
    let (valid_from, valid_until) = schedule.window().unwrap_or((now, now));
    let next = schedule.next_start(&series, now);

    let back_label = match cal.ui.prev {
        View::Mias => "Mis carreras",
        View::Calendario => "Calendario",
        View::Eventos => "Eventos",
        _ => "Próximas",
    };
    let kind_line = if let Some(every) = series.every() {
        format!(
            "Diaria · cada {every} min · {} salidas al día",
            24 * 60 / every.max(1)
        )
    } else {
        format!("{} · tandas fijas", series.tier_label())
    };
    let fid = id.clone();
    let header = div()
        .flex_none()
        .flex()
        .items_end()
        .gap(px(12.0))
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .child(tier(&series, cx))
                        .child(t(kind_line, 12.5, 400, skin.text3, cx))
                        .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx))),
                )
                .child(disp(series.name.clone(), 34.0, skin.text1, cx).mt(px(4.0)))
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.0))
                        .mt(px(6.0))
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
                        ))
                        .children(series.class_chips().iter().map(|c| class_chip(c, cx))),
                ),
        )
        .child(
            btn(
                "calendar-serie-fav",
                if fav {
                    "En favoritas"
                } else {
                    "Añadir a favoritas"
                },
                false,
                cx,
            )
            .child(star(fav, 14.0, cx))
            .on_click(cx.listener(move |this, _, _, cx| this.toggle_fav(&fid, cx))),
        )
        .child(
            btn_pri("calendar-serie-launch", &cal.launch_label(), false, cx)
                .on_click(cx.listener(|this, _, _, cx| this.launch_profile(cx))),
        );

    // Todas sus salidas
    let mut outings = chrome::card(cx)
        .flex_none()
        .p(px(16.0))
        .gap(px(10.0))
        .child(section_title(
            "Todas sus salidas",
            Some(zone.long(now).split(" · ").last().unwrap_or("").to_owned()),
            cx,
        ));
    if daily {
        let minutes = series.minutes_of_hour();
        let mut line = div()
            .flex()
            .items_center()
            .gap(px(8.0))
            .flex_wrap()
            .child(t(
                if minutes.is_empty() {
                    "Sale cada"
                } else {
                    "Sale a los minutos"
                },
                13.0,
                400,
                skin.text2,
                cx,
            ));
        for m in &minutes {
            line = line.child(
                div()
                    .px(px(8.0))
                    .py(px(3.0))
                    .rounded(px(6.0))
                    .bg(rgb(skin.l3))
                    .child(chrome::bold_mono(format!(":{m:02}"), 13.0, skin.text1, cx)),
            );
        }
        line = line.child(t(
            if minutes.is_empty() {
                format!("{} min, todo el día", series.every().unwrap_or(0))
            } else {
                "de cada hora, todo el día y toda la semana".to_owned()
            },
            13.0,
            400,
            skin.text2,
            cx,
        ));
        outings = outings
            .child(line)
            .child(heat_map(cal, &series, valid_from, now, cx));
    } else {
        let mut by_day: Vec<(String, Vec<DateTime<Utc>>)> = vec![];
        for at in schedule
            .starts(&series, valid_from, valid_until)
            .unwrap_or_default()
        {
            let label = zone.day_rel(at, now);
            match by_day.last_mut() {
                Some((l, v)) if *l == label => v.push(at),
                _ => by_day.push((label, vec![at])),
            }
        }
        for (label, starts) in by_day {
            let mut row = div()
                .flex()
                .items_center()
                .gap(px(6.0))
                .flex_wrap()
                .child(t(label, 12.0, 600, skin.text2, cx).w(px(90.0)));
            for at in starts {
                let alerted = cal.alerts.slot_at(&series.id, at);
                let sid = series.id.clone();
                row = row.child(
                    div()
                        .id(("calendar-serie-slot", at.timestamp() as usize & 0xfffff))
                        .cursor_pointer()
                        .when(at < now, |d| d.opacity(0.45))
                        .on_click(
                            cx.listener(move |this, _, _, cx| this.toggle_slot_alert(&sid, at, cx)),
                        )
                        .child(time_chip(
                            &zone.hm(at),
                            if alerted {
                                Chip::Bell
                            } else if fav {
                                Chip::Fav
                            } else {
                                Chip::Plain
                            },
                            cx,
                        )),
                );
            }
            outings = outings.child(row);
        }
    }
    // Próximas salidas
    let upcoming: Vec<_> = schedule
        .starts(&series, now, valid_until)
        .unwrap_or_default()
        .into_iter()
        .take(9)
        .collect();
    let mut chips = div().flex().flex_wrap().gap(px(8.0));
    for (i, at) in upcoming.iter().enumerate() {
        let (sid, at) = (id.clone(), *at);
        let alerted = cal.alerts.cause(&schedule, &series, at).is_some();
        chips = chips.child(
            div()
                .id(("calendar-serie-next", i))
                .cursor_pointer()
                .on_click(
                    cx.listener(move |this, _, _, cx| this.open_ficha(sid.clone(), Some(at), cx)),
                )
                .child(time_chip(
                    &zone.hm(at),
                    if alerted {
                        Chip::Bell
                    } else if i == 0 {
                        Chip::Next
                    } else {
                        Chip::Plain
                    },
                    cx,
                )),
        );
    }
    let phases = series.phases();
    let names = ["Práctica", "Clasificación", "Carrera"];
    let total: u32 = phases.iter().map(|p| p.0).sum::<u32>().max(1);
    let mut bar = div().flex().gap(px(3.0)).h(px(40.0));
    for (i, (m, est)) in phases.iter().enumerate() {
        bar = bar.child(
            div()
                .w(gpui::relative(*m as f32 / total as f32))
                .min_w(px(84.0))
                .rounded(px(6.0))
                .px(px(8.0))
                .py(px(4.0))
                .overflow_hidden()
                .bg(if i == 2 {
                    chrome::acc_bg(cx)
                } else {
                    rgb(skin.l3).into()
                })
                .border_1()
                .border_color(if i == 2 {
                    chrome::acc_line(cx)
                } else {
                    orbit::alpha(skin.line1)
                })
                .child(t(names[i], 11.0, 600, skin.text1, cx).whitespace_nowrap())
                .child(t(
                    format!("{}{}", duration_txt(*m), if *est { "~" } else { "" }),
                    11.0,
                    400,
                    skin.text3,
                    cx,
                )),
        );
    }
    let left = div()
        .flex_1()
        .min_w_0()
        .flex()
        .flex_col()
        .gap(px(14.0))
        .child(outings)
        .child(
            chrome::card(cx)
                .flex_none()
                .p(px(16.0))
                .gap(px(10.0))
                .child(section_title("Próximas salidas", None, cx))
                .child(chips)
                .child(section_title(
                    "Así es cada salida",
                    next.map(|n| format!("la de las {}", zone.hm(n))),
                    cx,
                ))
                .child(bar)
                .child(t(
                    format!(
                        "Entras {} · carrera {}",
                        next.map_or("—".into(), |n| zone.hm(n)),
                        next.map_or("—".into(), |n| zone
                            .hm(n + Duration::minutes(series.lead_in_min())))
                    ),
                    12.0,
                    400,
                    skin.text3,
                    cx,
                )),
        );

    // Avisos de esta serie
    let band = cal.alerts.band(&series.id).cloned();
    let alerts_card = chrome::card(cx)
        .flex_none()
        .p(px(16.0))
        .gap(px(10.0))
        .child(section_title("Avisos de esta serie", None, cx));
    let alerts_card = if daily {
        let sid = id.clone();
        alerts_card
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(icon(
                        "bell-fill",
                        16.0,
                        if band.is_some() { acct(cx) } else { skin.text3 },
                    ))
                    .child(
                        div()
                            .flex_1()
                            .child(t(
                                band.as_ref().map_or(
                                    "Avisarme por franja horaria".to_owned(),
                                    |b| {
                                        format!(
                                            "Te avisamos de las salidas de {}–{}",
                                            minutes_txt(b.from),
                                            minutes_txt(b.to)
                                        )
                                    },
                                ),
                                13.5,
                                700,
                                skin.text1,
                                cx,
                            ))
                            .child(t(
                                band.as_ref().map_or(
                                    "Elige de qué hora a qué hora quieres que te avisemos."
                                        .to_owned(),
                                    |b| {
                                        format!(
                                            "{} · {} · se calla si ya estás en pista",
                                            b.days.label(),
                                            if b.mode == Mode::Each {
                                                "cada salida"
                                            } else {
                                                "solo la primera"
                                            }
                                        )
                                    },
                                ),
                                12.0,
                                400,
                                skin.text3,
                                cx,
                            )),
                    ),
            )
            .child(
                div()
                    .flex()
                    .gap(px(8.0))
                    .child(
                        btn(
                            "calendar-serie-band",
                            if band.is_some() {
                                "Quitar franja"
                            } else {
                                "Avisar de 20:00 a 23:00"
                            },
                            true,
                            cx,
                        )
                        .on_click(super::avisos::edit(cx, move |a| {
                            if a.band(&sid).is_some() {
                                a.set_band(&sid, None)
                            } else {
                                a.set_band(
                                    &sid,
                                    Some(Band {
                                        series_id: sid.clone(),
                                        from: 20 * 60,
                                        to: 23 * 60,
                                        days: Days::All,
                                        mode: Mode::Each,
                                    }),
                                )
                            }
                        })),
                    )
                    .child(
                        btn("calendar-serie-edit", "Editar avisos", true, cx).on_click(
                            cx.listener(|this, _, _, cx| this.open_modal(Modal::Avisos, cx)),
                        ),
                    ),
            )
    } else {
        let n = cal
            .alerts
            .slots
            .iter()
            .filter(|s| s.series_id == series.id)
            .count();
        alerts_card.child(t(
            format!(
                "{n} tanda{} con aviso. Pulsa una tanda a la izquierda para añadirla o quitarla.",
                if n == 1 { "" } else { "s" }
            ),
            13.0,
            400,
            skin.text2,
            cx,
        ))
    };

    let sessions: Vec<String> = series
        .phases()
        .iter()
        .zip(["P", "Q", "R"])
        .map(|((m, _), n)| format!("{n} {m}'"))
        .collect();
    let rules = chrome::card(cx)
        .flex_none()
        .p(px(16.0))
        .gap(px(8.0))
        .child(section_title("Reglas y coches", None, cx))
        .child(
            div()
                .grid()
                .grid_cols(2)
                .gap_x(px(20.0))
                .gap_y(px(8.0))
                .child(kv("Licencia", series.license_label.clone(), cx))
                .child(kv("Seguridad", dash(&series.safety_rating), cx))
                .child(kv("Reglaje", dash(&series.setup), cx))
                .child(kv("Ayudas", dash(&series.assists), cx))
                .child(kv(
                    "Calentadores",
                    if series.tyre_warmers { "Sí" } else { "No" },
                    cx,
                ))
                .child(kv(
                    "Neumáticos",
                    series.tyres.map_or("—".into(), |n| n.to_string()),
                    cx,
                ))
                .child(kv("Sesiones", sessions.join(" · "), cx))
                .child(kv(
                    "Divisiones",
                    series.splits.map_or("—".into(), |n| format!("hasta {n}")),
                    cx,
                ))
                .child(kv(
                    "Coches",
                    series
                        .class_chips()
                        .iter()
                        .map(|c| c.name.clone())
                        .collect::<Vec<_>>()
                        .join(", "),
                    cx,
                ))
                .child(kv("Formato", dash(&series.format), cx)),
        )
        .children(
            series
                .notes
                .iter()
                .map(|n| t(n.clone(), 12.0, 400, skin.text3, cx)),
        );

    // Circuito por semana
    let mut rotation = div().grid().grid_cols(2).gap(px(8.0));
    let mut weeks = cal.history.rotation(&series.id);
    if !weeks.iter().any(|(from, _)| *from == valid_from) {
        weeks.push((valid_from, series.track.clone()));
    }
    for (from, track) in weeks.iter().rev().take(6) {
        let current = *from == valid_from;
        let days = clock::week_days(*from);
        rotation = rotation.child(
            div()
                .p(px(10.0))
                .rounded(px(8.0))
                .border_1()
                .border_color(if current {
                    chrome::acc_line(cx)
                } else {
                    orbit::alpha(skin.line1)
                })
                .bg(if current {
                    chrome::acc_bg(cx)
                } else {
                    orbit::alpha(skin.hover)
                })
                .child(t(clock::week_title(&days), 11.0, 400, skin.text3, cx))
                .child(t(track.clone(), 13.0, 700, skin.text1, cx).truncate()),
        );
    }
    let source = chrome::card(cx)
        .flex_none()
        .p(px(16.0))
        .gap(px(8.0))
        .child(section_title("Circuito por semana", None, cx))
        .child(rotation)
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(t("Procedencia del dato", 12.0, 400, skin.text3, cx))
                .child(if series.is_fallback() {
                    pill("RaceControl (respaldo)", Tone::Warn, cx)
                } else {
                    pill("LMU oficial", Tone::Ok, cx)
                }),
        );
    let right = div()
        .w(px(440.0))
        .flex_none()
        .flex()
        .flex_col()
        .gap(px(14.0))
        .child(alerts_card)
        .child(rules)
        .child(source);

    let page = div()
        .id("calendar-serie")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .gap(px(14.0))
        .child(
            div().flex_none().flex().child(
                btn("calendar-serie-back", back_label, true, cx)
                    .child(icon("chevron-left", 14.0, skin.text1))
                    .on_click(cx.listener(|this, _, _, cx| this.back(cx))),
            ),
        )
        .child(header)
        .child(
            div()
                .flex()
                .gap(px(14.0))
                .items_start()
                .child(left)
                .child(right),
        );
    div().flex_1().min_h_0().flex().flex_col().child(page)
}

fn dash(value: &str) -> String {
    if value.is_empty() {
        "—".into()
    } else {
        value.to_owned()
    }
}

/// Siete días por 24 horas: lo ya pasado, tu franja de aviso y el ahora.
fn heat_map(
    cal: &Calendar,
    series: &super::super::Series,
    from: DateTime<Utc>,
    now: DateTime<Utc>,
    cx: &gpui::App,
) -> Div {
    let skin = skin(cx);
    let zone = cal.zone();
    let days = clock::week_days(from);
    let band = cal.alerts.band(&series.id);
    let mut map = div().flex().flex_col().gap(px(3.0));
    let mut axis = div().flex().gap(px(3.0)).pl(px(58.0));
    for h in 0..24 {
        axis = axis.child(div().flex_1().min_w_0().h(px(14.0)).child(if h % 3 == 0 {
            chrome::mono(format!("{h:02}"), 10.0, skin.cap, cx)
        } else {
            div()
        }));
    }
    map = map.child(axis);
    for day in days {
        let start = zone.day_start(day);
        let is_today = zone.date(now) == day;
        let mut row = div().flex().items_center().gap(px(3.0)).child(
            t(
                zone.day_rel(start, now),
                11.5,
                if is_today { 700 } else { 500 },
                if is_today { acct(cx) } else { skin.text2 },
                cx,
            )
            .w(px(55.0)),
        );
        for h in 0..24 {
            let (a, b) = (start + Duration::hours(h), start + Duration::hours(h + 1));
            let past = b <= now;
            let current = now >= a && now < b;
            let in_band = band.is_some_and(|band| {
                let m = u16::try_from(chrono::Timelike::hour(&zone.naive(a)) * 60).unwrap_or(0);
                band.from <= m && m < band.to
            });
            row = row.child(
                div()
                    .flex_1()
                    .min_w_0()
                    .h(px(21.0))
                    .rounded(px(4.0))
                    .bg(rgb(if in_band { acc(cx) } else { skin.l3 }))
                    .when(past, |c| c.opacity(0.4))
                    .when(current, |c| c.border_2().border_color(rgb(skin.text1))),
            );
        }
        map = map.child(row);
    }
    map
}
