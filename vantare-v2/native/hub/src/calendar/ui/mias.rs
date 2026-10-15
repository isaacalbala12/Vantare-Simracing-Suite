//! Mis carreras: tu semana por días, con tus franjas y tandas con aviso.
use super::super::{
    Calendar, Series,
    alerts::Cause,
    chrome::{self, acct, btn, btn_pri, center_message, disp, ib, icon, skin, t, tier, tint},
    clock::{self, duration_txt, in_txt},
    history::Run,
    rows,
};
use super::{
    Modal, View,
    avisos::minutes_txt,
    semana::{Chip, time_chip_sized},
};
use crate::orbit;
use chrono::{DateTime, Duration, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px, rgb};

enum Entry<'a> {
    Band {
        series: &'a Series,
        first: DateTime<Utc>,
        last: DateTime<Utc>,
        count: usize,
        from: u16,
        to: u16,
    },
    Open {
        series: &'a Series,
        at: DateTime<Utc>,
    },
    Event {
        series: &'a Series,
        starts: Vec<DateTime<Utc>>,
    },
}

impl Entry<'_> {
    fn at(&self) -> DateTime<Utc> {
        match self {
            Self::Band { first: at, .. } | Self::Open { at, .. } => *at,
            Self::Event { starts, .. } => starts[0],
        }
    }
    fn series(&self) -> &Series {
        match self {
            Self::Band { series, .. } | Self::Open { series, .. } | Self::Event { series, .. } => {
                series
            }
        }
    }
}

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = skin(cx);
    let (Some(schedule), now, zone) = (cal.schedule().cloned(), cal.now(), cal.zone()) else {
        return div();
    };
    if cal.favorites().is_empty() && cal.alerts.count() == 0 {
        return chrome::card(cx).flex_1().child(center_message(
            "star",
            acct(cx),
            "Aquí aparecerán tus carreras",
            "Marca series con ★ y pon avisos: verás tu semana en una sola lista, ordenada por hora, con lo que ya corriste.",
            vec![
                btn_pri("calendar-mias-series", "Ver series", false, cx).on_click(
                    cx.listener(|this, _, _, cx| {
                        this.ui.span = super::Span::Semana;
                        this.go(View::Calendario, cx);
                    }),
                ),
                btn("calendar-mias-go", "Ver Próximas", false, cx)
                    .on_click(cx.listener(|this, _, _, cx| this.go(View::Proximas, cx))),
            ],
            cx,
        ));
    }
    let compact = cal.adapt.width < 1400.0;
    let hero = rows::hero(&schedule, now, cal.favorites(), &cal.alerts);
    let stat = |label: &str, value: String, hint: String, cx: &gpui::App| {
        chrome::card(cx)
            .flex_1()
            .min_w_0()
            .px(px(if compact { 12.0 } else { 14.0 }))
            .py(px(if compact { 8.0 } else { 12.0 }))
            .child(chrome::cap(label, skin.cap, cx))
            .child(disp(value, if compact { 18.0 } else { 22.0 }, skin.text1, cx).mt(px(4.0)))
            .child(t(hint, 11.5, 400, skin.text3, cx).truncate())
    };
    let bands: Vec<String> = cal
        .alerts
        .bands
        .iter()
        .filter_map(|b| {
            schedule
                .by_id(&b.series_id)
                .map(|s| format!("{} {}–{}", s.name, minutes_txt(b.from), minutes_txt(b.to)))
        })
        .collect();
    // Carreras corridas desde el inicio de la semana LMU.
    let week_from = clock::week_start(now);
    let ran: Vec<&Run> = cal.runs.iter().filter(|r| r.at >= week_from).collect();
    let best_run = ran
        .iter()
        .filter_map(|r| r.best_lap.as_ref().map(|lap| (lap, r)))
        .min_by(|a, b| a.0.cmp(b.0));
    let stats = div()
        .flex_none()
        .flex()
        .gap(px(if compact { 8.0 } else { 12.0 }))
        .child(stat(
            "Tu próxima",
            hero.as_ref().map_or("—".to_owned(), |h| zone.hm(h.at)),
            hero.as_ref().map_or("nada pendiente".to_owned(), |h| {
                format!("{} · {}", h.series.name, in_txt(h.at - now))
            }),
            cx,
        ))
        .child(stat(
            "Franjas activas",
            cal.alerts.bands.len().to_string(),
            if bands.is_empty() {
                "—".to_owned()
            } else {
                bands.join(" · ")
            },
            cx,
        ))
        .child(stat(
            "Corriste",
            match ran.len() {
                0 => "Ninguna".to_owned(),
                1 => "1 carrera".to_owned(),
                n => format!("{n} carreras"),
            },
            best_run.map_or_else(
                || "sin sesiones grabadas".to_owned(),
                |(lap, run)| format!("mejor: {lap} en {}", run.circuit),
            ),
            cx,
        ))
        .child(stat(
            "En tu calendario",
            ".ics".to_owned(),
            "descarga tus favoritas cuando quieras".to_owned(),
            cx,
        ));

    // Entradas por día desde hoy hasta el final de la semana publicada.
    let (_, until) = schedule.window().unwrap_or((now, now));
    let mut day = zone.date(now);
    let mut days: Vec<(chrono::NaiveDate, Vec<Entry<'_>>)> = vec![];
    while zone.day_start(day) < until {
        let (a, b) = (
            zone.day_start(day).max(now),
            zone.day_start(day + Duration::days(1)),
        );
        let mut entries: Vec<Entry<'_>> = vec![];
        for series in schedule
            .series
            .iter()
            .filter(|s| rows::is_fav(cal.favorites(), s) || cal.alerts.band(&s.id).is_some())
        {
            let starts = schedule.starts(series, a, b).unwrap_or_default();
            if rows::is_daily(series) {
                let covered: Vec<_> = starts
                    .iter()
                    .copied()
                    .filter(|at| cal.alerts.cause(&schedule, series, *at) == Some(Cause::Band))
                    .collect();
                match (covered.first(), covered.last(), cal.alerts.band(&series.id)) {
                    (Some(first), Some(last), Some(band)) => entries.push(Entry::Band {
                        series,
                        first: *first,
                        last: *last,
                        count: covered.len(),
                        from: band.from,
                        to: band.to,
                    }),
                    _ if cal.alerts.band(&series.id).is_none() => {
                        if let Some(at) = starts.first() {
                            entries.push(Entry::Open { series, at: *at });
                        }
                    }
                    _ => {}
                }
            } else if !starts.is_empty() {
                entries.push(Entry::Event { series, starts });
            }
        }
        entries.sort_by_key(|e| (e.at(), e.series().name.clone()));
        if !entries.is_empty() {
            days.push((day, entries));
        }
        day += Duration::days(1);
    }
    let alerts_only = cal.ui.only_alerts;
    let total: usize = days.iter().map(|(_, e)| e.len()).sum();

    let head = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(12.0))
        .px(px(16.0))
        .py(px(12.0))
        .child(
            div()
                .flex()
                .items_baseline()
                .gap(px(10.0))
                .flex_1()
                .child(disp("Tu semana", 19.0, skin.text1, cx))
                .child(t(
                    format!("favoritas, franjas y tandas con aviso · {}", zone.long(now)),
                    12.0,
                    400,
                    skin.cap,
                    cx,
                )),
        )
        .child(
            div()
                .flex()
                .gap(px(2.0))
                .p(px(3.0))
                .rounded(px(9.0))
                .bg(rgb(skin.l2))
                .border_1()
                .border_color(orbit::alpha(skin.line1))
                .child(
                    chrome::seg_button("calendar-mias-all", "Todo", !alerts_only, cx).on_click(
                        cx.listener(|this, _, _, cx| {
                            this.ui.only_alerts = false;
                            cx.notify();
                        }),
                    ),
                )
                .child(
                    chrome::seg_button("calendar-mias-alerted", "Con aviso", alerts_only, cx)
                        .on_click(cx.listener(|this, _, _, cx| {
                            this.ui.only_alerts = true;
                            cx.notify();
                        })),
                ),
        )
        .child(
            btn("calendar-mias-ics", "", true, cx)
                .aria_label("Exportar")
                .child(icon("v-calendar", 15.0, skin.text1))
                .child(t("Exportar", 12.5, 500, skin.text1, cx))
                .on_click(cx.listener(|this, _, _, cx| this.open_modal(Modal::Ics, cx))),
        );

    let mut list = div()
        .id("calendar-mias-days")
        .flex()
        .flex_col()
        .overflow_y_scroll()
        .flex_1()
        .min_h_0();
    let mut first_row = true;
    for (day, entries) in days {
        let shown: Vec<_> = entries
            .into_iter()
            .filter(|e| {
                !alerts_only
                    || match e {
                        Entry::Band { .. } => true,
                        Entry::Open { .. } => false,
                        Entry::Event { series, starts } => {
                            starts.iter().any(|at| cal.alerts.slot_at(&series.id, *at))
                        }
                    }
            })
            .collect();
        if shown.is_empty() {
            continue;
        }
        let rel = zone
            .day_rel(zone.day_start(day).max(now), now)
            .to_uppercase();
        list = list.child(chrome::group_row(
            &rel,
            &format!(
                "· {} entrada{}",
                shown.len(),
                if shown.len() == 1 { "" } else { "s" }
            ),
            cx,
        ));
        for (index, entry) in shown.into_iter().enumerate() {
            let key = day.format("%j").to_string().parse::<usize>().unwrap_or(0) * 100 + index;
            let first = std::mem::take(&mut first_row);
            list = list.child(entry_row(cal, &entry, key, first, cx));
        }
    }
    if !ran.is_empty() && !alerts_only {
        list = list.child(chrome::group_row("Ya corriste esta semana", "", cx));
        let mut done: Vec<&Run> = ran.clone();
        done.sort_by_key(|r| std::cmp::Reverse(r.at));
        for (index, run) in done.into_iter().enumerate() {
            list = list.child(done_row(cal, run, index, cx));
        }
    }
    if total == 0 && ran.is_empty() {
        list = list.child(div().p(px(20.0)).child(t(
            "No hay salidas de tus series lo que queda de semana.",
            13.0,
            400,
            skin.text3,
            cx,
        )));
    }
    div()
        .flex_1()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(12.0))
        .child(stats)
        .child(chrome::card(cx).flex_1().child(head).child(list))
}

fn row_shell(key: (&'static str, usize), compact: bool) -> Stateful<Div> {
    div()
        .id(key)
        .flex_none()
        .flex()
        .items_center()
        .gap(px(if compact { 10.0 } else { 14.0 }))
        .px(px(if compact { 12.0 } else { 16.0 }))
        .h(px(54.0))
}

/// Carrera ya corrida: atenuada, con su resultado.
fn done_row(cal: &Calendar, run: &Run, index: usize, cx: &mut Context<Calendar>) -> Stateful<Div> {
    let skin = skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let compact = cal.adapt.width < 1400.0;
    let series = cal.schedule().and_then(|s| s.by_id(&run.series_id));
    let name = series.map_or_else(|| run.series_id.clone(), |s| s.name.clone());
    let class = series
        .and_then(|s| s.class_chips().first().map(|c| c.name.clone()))
        .unwrap_or_default();
    row_shell(("calendar-mias-done", index), compact)
        .opacity(0.8)
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(
            div()
                .w(px(if compact { 70.0 } else { 84.0 }))
                .flex_none()
                .flex()
                .flex_col()
                .child(chrome::bold_mono(zone.hm(run.at), 17.0, skin.text1, cx))
                .child(t(zone.day_rel(run.at, now), 11.5, 400, skin.text3, cx)),
        )
        .child(
            div()
                .w(px(4.0))
                .h(px(30.0))
                .flex_none()
                .rounded(px(2.0))
                .bg(rgb(chrome::class_color(&class, cx))),
        )
        .child(
            div()
                .w(px(if compact { 150.0 } else { 190.0 }))
                .flex_none()
                .child(t(name, 13.5, 600, skin.text1, cx).truncate())
                .child(
                    t(
                        format!("{} · desde tu telemetría", run.circuit),
                        11.5,
                        400,
                        skin.text3,
                        cx,
                    )
                    .truncate(),
                ),
        )
        .child(
            div().flex_1().min_w_0().flex().items_center().child(
                div()
                    .h(px(22.0))
                    .flex()
                    .items_center()
                    .gap(px(5.0))
                    .px(px(8.0))
                    .rounded(px(6.0))
                    .bg(tint(skin.ok, 0.13))
                    .child(icon("check", 10.0, chrome::ok_text(cx)))
                    .child(t(run.summary(), 11.5, 600, chrome::ok_text(cx), cx)),
            ),
        )
        .child(ib(
            ("calendar-mias-open", index),
            "chevron-right",
            "Abrir sesión",
            true,
            false,
            cx,
        ))
}

fn entry_row(
    cal: &Calendar,
    entry: &Entry<'_>,
    key: usize,
    first: bool,
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let skin = skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let compact = cal.adapt.width < 1400.0;
    let at = entry.at();
    let series = entry.series();
    let (sid, open, launch_id) = (series.id.clone(), series.id.clone(), series.id.clone());
    let soon = at - now < Duration::hours(6);
    let middle = match entry {
        Entry::Band {
            count,
            first,
            last,
            from,
            to,
            series,
        } => div()
            .flex()
            .items_center()
            .gap(px(6.0))
            .overflow_hidden()
            .child(
                div()
                    .h(px(22.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(5.0))
                    .px(px(8.0))
                    .rounded(px(6.0))
                    .bg(chrome::acc_bg(cx))
                    .border_1()
                    .border_color(chrome::acc_line(cx))
                    .child(icon("bell-fill", 10.0, acct(cx)))
                    .child(
                        t(
                            format!("Franja {}–{}", minutes_txt(*from), minutes_txt(*to)),
                            11.5,
                            600,
                            acct(cx),
                            cx,
                        )
                        .whitespace_nowrap(),
                    ),
            )
            .child(
                t(
                    format!(
                        "{count} salidas, cada {} min · {} → {}",
                        series.every().unwrap_or(0),
                        zone.hm(*first),
                        zone.hm(*last)
                    ),
                    12.0,
                    400,
                    skin.cap,
                    cx,
                )
                .whitespace_nowrap()
                .truncate(),
            ),
        Entry::Open { series, .. } => div()
            .flex()
            .items_center()
            .gap(px(6.0))
            .child(
                div()
                    .h(px(22.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(5.0))
                    .px(px(8.0))
                    .rounded(px(6.0))
                    .bg(rgb(skin.l3))
                    .child(chrome::star(true, 10.0, cx))
                    .child(
                        t("Favorita · sin aviso", 11.5, 600, skin.text2, cx).whitespace_nowrap(),
                    ),
            )
            .child(
                t(
                    format!("sale cada {} min", series.every().unwrap_or(0)),
                    12.0,
                    400,
                    skin.cap,
                    cx,
                )
                .whitespace_nowrap(),
            ),
        Entry::Event { series, starts } => {
            let mut row = div()
                .flex()
                .items_center()
                .gap(px(6.0))
                .overflow_hidden()
                .child(
                    div()
                        .h(px(22.0))
                        .flex_none()
                        .flex()
                        .items_center()
                        .gap(px(5.0))
                        .px(px(8.0))
                        .rounded(px(6.0))
                        .bg(rgb(skin.l3))
                        .child(chrome::star(true, 10.0, cx))
                        .child(t("Favorita", 11.5, 600, skin.text2, cx)),
                );
            for start in starts {
                let alerted = cal.alerts.slot_at(&series.id, *start);
                row = row.child(time_chip_sized(
                    &zone.hm(*start),
                    if alerted { Chip::Bell } else { Chip::Fav },
                    true,
                    cx,
                ));
            }
            row
        }
    };
    let class = series
        .class_chips()
        .first()
        .map(|c| c.name.clone())
        .unwrap_or_default();
    row_shell(("calendar-mias-row", key), compact)
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .cursor_pointer()
        .hover(move |s| s.bg(orbit::alpha(skin.hover)))
        .when(first, |r| {
            r.bg(orbit::ramp_alpha(
                orbit::skin::Ramp {
                    from: chrome::skin(cx).accent_tint,
                    to: chrome::skin(cx).accent_tint & 0xffff_ff00,
                    end: 0.7,
                },
                90.0,
            ))
        })
        .on_click(cx.listener(move |this, _, _, cx| this.open_ficha(open.clone(), Some(at), cx)))
        .child(
            div()
                .w(px(if compact { 70.0 } else { 84.0 }))
                .flex_none()
                .flex()
                .flex_col()
                .child(chrome::bold_mono(zone.hm(at), 17.0, skin.text1, cx))
                .when(soon, |c| {
                    c.child(t(in_txt(at - now), 11.5, 400, acct(cx), cx))
                }),
        )
        .child(
            div()
                .w(px(4.0))
                .h(px(30.0))
                .flex_none()
                .rounded(px(2.0))
                .bg(rgb(chrome::class_color(&class, cx))),
        )
        .child(
            div()
                .w(px(if compact { 150.0 } else { 190.0 }))
                .flex_none()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.0))
                        .child(t(series.name.clone(), 13.5, 600, skin.text1, cx).truncate())
                        .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx))),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.0))
                        .child(tier(series, cx))
                        .child(
                            t(
                                format!(
                                    "{} · carrera {}",
                                    series.track_short(),
                                    duration_txt(series.race_minutes())
                                ),
                                11.5,
                                400,
                                skin.text3,
                                cx,
                            )
                            .truncate(),
                        ),
                ),
        )
        .child(div().flex_1().min_w_0().child(middle))
        .child(
            div()
                .flex_none()
                .flex()
                .items_center()
                .gap(px(4.0))
                .when(first, |d| {
                    d.child(
                        btn_pri(("calendar-mias-launch", key), "Lanzar", true, cx)
                            .h(px(28.0))
                            .px(px(10.0))
                            .on_click(cx.listener(|this, _, _, cx| {
                                cx.stop_propagation();
                                this.launch_profile(cx);
                            })),
                    )
                })
                .when(!first, |d| {
                    d.child(
                        ib(
                            ("calendar-mias-arm", key),
                            "clock",
                            "Lanzar 3 min antes",
                            true,
                            false,
                            cx,
                        )
                        .on_click(cx.listener(move |this, _, _, cx| {
                            cx.stop_propagation();
                            this.arm_launch(&launch_id, at - Duration::minutes(3), cx);
                        })),
                    )
                })
                .child(
                    ib(
                        ("calendar-mias-info", key),
                        "info",
                        "Ver ficha",
                        true,
                        false,
                        cx,
                    )
                    .on_click(cx.listener(move |this, _, _, cx| {
                        cx.stop_propagation();
                        this.open_ficha(sid.clone(), Some(at), cx);
                    })),
                ),
        )
}
