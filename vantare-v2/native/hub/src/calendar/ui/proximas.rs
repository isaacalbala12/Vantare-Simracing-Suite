//! Próximas: «Tu próxima carrera» y una fila por serie con su línea de 90 min.
use super::super::{
    Calendar, Health,
    chrome::{
        self, Tone, acc, acc_bg, acc_line, bold_mono, btn, btn_pri, btn_text_pri, cap,
        center_message, class_chip, class_dot, disp, group_row, ib, icon, mono, pill, star, t,
        tier, tint,
    },
    clock::{self, Zone, countdown, duration_txt, in_txt},
    model::Series,
    rows::{self, Board, LINE_BEFORE, LINE_SPAN, Row},
};
use super::View;
use crate::orbit;
use chrono::{DateTime, Duration, Utc};
use gpui::{Context, Div, Stateful, div, prelude::*, px, relative, rgb};

const TIERS: [(&str, Option<&str>); 5] = [
    ("Todos", None),
    ("Bronce", Some("beginner")),
    ("Plata", Some("intermediate")),
    ("Oro", Some("advanced")),
    ("Semanal", Some("weekly")),
];

fn tier_dot_color(tier: &str, cx: &gpui::App) -> u32 {
    match tier {
        "beginner" => 0xCD_7F32,
        "intermediate" => 0xB8_C0C8,
        "advanced" => 0xE2_B93B,
        _ => acc(cx),
    }
}

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let health = cal.health();
    let compact = cal.adapt.width < 1400.0;
    let mut page = div()
        .flex_1()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(if compact { 12.0 } else { 14.0 }));
    if health == Health::Loading {
        return page
            .child(hero_skeleton(compact, cx))
            .child(board_skeleton(compact, cx));
    }
    if health == Health::Missing {
        return missing(cal, cx);
    }
    if health == Health::Expired {
        return expired(cal, cx);
    }
    if cal.ui.search.is_none() {
        let input = cx.new(|cx| orbit::Input::new(String::new(), "Buscar serie", cx));
        cx.observe(&input, |this, input, cx| {
            this.ui.filter.query.clone_from(&input.read(cx).value);
            cx.notify();
        })
        .detach();
        cal.ui.search = Some(input);
    }
    page = page.child(hero(cal, compact, cx));
    page.child(board(cal, compact, cx))
}

fn hero_skeleton(compact: bool, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    div()
        .flex_none()
        .h(px(if compact { 96.0 } else { 128.0 }))
        .flex()
        .items_center()
        .justify_between()
        .px(px(22.0))
        .rounded(px(12.0))
        .bg(rgb(skin.l2))
        .child(
            div()
                .flex()
                .flex_col()
                .gap(px(12.0))
                .child(orbit::skeleton(0.0, 12.0, cx).w(px(140.0)))
                .child(orbit::skeleton(0.0, 26.0, cx).w(px(320.0)))
                .child(orbit::skeleton(0.0, 12.0, cx).w(px(260.0))),
        )
        .child(orbit::skeleton(0.0, 44.0, cx).w(px(180.0)))
}

fn board_skeleton(compact: bool, cx: &gpui::App) -> Div {
    let skin = chrome::skin(cx);
    let (pad, gap) = if compact { (12.0, 10.0) } else { (16.0, 12.0) };
    let mut card = chrome::card(cx).flex_1().child(
        div()
            .flex_none()
            .flex()
            .items_center()
            .px(px(16.0))
            .py(px(12.0))
            .child(orbit::caps("Salidas", 13.0, skin.text1, cx)),
    );
    card = card.child(
        div()
            .h(px(30.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(gap))
            .px(px(pad))
            .border_t_1()
            .border_b_1()
            .border_color(orbit::alpha(skin.line1))
            .child(div().w(px(34.0)).flex_none())
            .child(cap("Serie", skin.cap, cx).flex_1())
            .child(cap("Clases", skin.cap, cx).w(px(104.0)).flex_none())
            .child(cap("Próxima", skin.cap, cx).w(px(92.0)).flex_none())
            .child(div().flex_1()),
    );
    for _ in 0..9 {
        card = card.child(
            div()
                .h(px(46.0))
                .flex_none()
                .flex()
                .items_center()
                .gap(px(gap))
                .px(px(pad))
                .border_b_1()
                .border_color(orbit::alpha(skin.line1))
                .child(div().w(px(34.0)).flex_none())
                .child(
                    div()
                        .flex_1()
                        .flex()
                        .flex_col()
                        .gap(px(6.0))
                        .child(orbit::skeleton(0.0, 10.0, cx).w(px(140.0)))
                        .child(orbit::skeleton(0.0, 8.0, cx).w(px(90.0))),
                )
                .child(orbit::skeleton(0.0, 10.0, cx).w(px(104.0)).flex_none())
                .child(
                    orbit::skeleton(0.0, 10.0, cx)
                        .w(px(54.0))
                        .mr(px(38.0))
                        .flex_none(),
                )
                .child(orbit::skeleton(0.0, 22.0, cx).flex_1()),
        );
    }
    card
}

/// Sin favoritas: invita a marcarlas con tres series de ejemplo, una por nivel.
fn suggestions(cal: &Calendar, now: DateTime<Utc>, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let Some(schedule) = cal.schedule() else {
        return div();
    };
    let mut row = div().flex().gap(px(10.0));
    for tier in ["beginner", "intermediate", "advanced"] {
        let Some(series) = schedule
            .series
            .iter()
            .find(|s| s.tier == tier && s.every().is_some())
        else {
            continue;
        };
        let id = series.id.clone();
        let next = schedule.next_start(series, now);
        row = row.child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .items_center()
                .gap(px(10.0))
                .px(px(12.0))
                .py(px(10.0))
                .rounded(px(9.0))
                .bg(rgb(skin.l1))
                .border_1()
                .border_color(orbit::alpha(skin.line2))
                .child(tier_badge(series, cx))
                .child(
                    div()
                        .flex_1()
                        .min_w_0()
                        .child(t(series.name.clone(), 13.0, 600, skin.text1, cx).truncate())
                        .child(
                            t(
                                format!(
                                    "{} · cada {} min · próxima {}",
                                    series.track_short(),
                                    series.every().unwrap_or(0),
                                    next.map_or_else(|| "—".into(), |at| cal.zone().hm(at))
                                ),
                                11.5,
                                400,
                                skin.cap,
                                cx,
                            )
                            .truncate(),
                        ),
                )
                .child(
                    btn(("calendar-suggest", series.id.len()), "Favorita", true, cx)
                        .child(star(false, 13.0, cx))
                        .on_click(cx.listener(move |this, _, _, cx| this.toggle_fav(&id, cx))),
                ),
        );
    }
    row
}

fn tier_badge(series: &Series, cx: &gpui::App) -> Div {
    tier(series, cx)
}

fn hero(cal: &Calendar, compact: bool, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let now = cal.now();
    let zone = cal.zone();
    let Some(schedule) = cal.schedule() else {
        return div();
    };
    let Some(hero) = rows::hero(schedule, now, cal.favorites(), &cal.alerts) else {
        let surface = orbit::neo_card(cx).flex_none().gap(px(12.0));
        return surface
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(14.0))
                    .child(
                        div()
                            .size(px(44.0))
                            .flex_none()
                            .rounded(px(12.0))
                            .flex()
                            .items_center()
                            .justify_center()
                            .bg(rgb(skin.l2))
                            .child(star(false, 22.0, cx)),
                    )
                    .child(
                        div()
                            .child(disp(
                                "Marca tus series con ★ y aquí verás cuándo sale tu próxima carrera",
                                if compact { 21.0 } else { 24.0 }, skin.text1, cx,
                            ))
                            .child(
                                t(
                                    "Tus favoritas van primero en la lista, en Semana y en Inicio. Para empezar, una por nivel:",
                                    13.0, 400, skin.text3, cx,
                                )
                                .mt(px(4.0)),
                            ),
                    ),
            )
            .child(suggestions(cal, now, cx));
    };
    let series = hero.series;
    let at = hero.at;
    let name = series.name.clone();
    let bell = hero.alert;
    let id = series.id.clone();
    let chips = hero.after.iter().take(3).map(|(other, when)| {
        div()
            .h(px(24.0))
            .flex_none()
            .flex()
            .items_center()
            .gap(px(6.0))
            .px(px(9.0))
            .rounded(px(6.0))
            .bg(tint(
                0x00ff_ffff,
                if chrome::light(cx) { 0.75 } else { 0.07 },
            ))
            .border_1()
            .border_color(orbit::alpha(skin.line2))
            .when(*when == at, |chip| chip.child(star(true, 11.0, cx)))
            .child(mono(zone.hm(*when), 12.0, skin.text1, cx))
            .when(other.id != series.id, |chip| {
                chip.child(t(other.name.clone(), 12.0, 400, skin.text2, cx).whitespace_nowrap())
            })
    });
    let launch_label = cal.launch_label();
    let ficha_id = id.clone();

    chrome::hero_plain(cx)
        .flex_none()
        .flex()
        .flex_row()
        .items_center()
        .gap(px(if compact { 20.0 } else { 26.0 }))
        .px(px(22.0))
        .py(px(if compact { 12.0 } else { 18.0 }))
        .when(!compact, |hero_box| {
            hero_box.child(
                div()
                    .absolute()
                    .right(px(250.0))
                    .top(px(-10.0))
                    .bottom(px(-10.0))
                    .w(px(300.0))
                    .opacity(0.38)
                    .child(orbit::circuit(Some(&series.track), cx).size_full()),
            )
        })
        .child(
            div()
                .flex_1()
                .min_w_0()
                .flex()
                .flex_col()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(8.0))
                        .mb(px(if compact { 4.0 } else { 6.0 }))
                        .child(cap("Tu próxima carrera", chrome::acct(cx), cx))
                        .child(tier(series, cx))
                        .when(bell && !compact, |row| {
                            row.child(
                                pill(
                                    format!(
                                        "aviso a las {}",
                                        zone.hm(
                                            at - Duration::minutes(i64::from(cal.alerts.lead_min))
                                        )
                                    ),
                                    Tone::Acc,
                                    cx,
                                )
                                .child(icon(
                                    "bell-fill",
                                    11.0,
                                    chrome::acct(cx),
                                )),
                            )
                        }),
                )
                .child(disp(name, if compact { 28.0 } else { 34.0 }, skin.text1, cx).truncate())
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(10.0))
                        .mt(px(if compact { 6.0 } else { 8.0 }))
                        .flex_wrap()
                        .child(
                            t(series.track_short().to_owned(), 13.0, 600, skin.text2, cx)
                                .whitespace_nowrap(),
                        )
                        .child(
                            t(series.track_layout().to_owned(), 13.0, 400, skin.text3, cx)
                                .whitespace_nowrap(),
                        )
                        .child(div().w(px(1.0)).h(px(12.0)).bg(orbit::alpha(skin.line3)))
                        .child(
                            div()
                                .flex()
                                .gap(px(10.0))
                                .children(series.class_chips().iter().map(|c| class_chip(c, cx))),
                        )
                        .when(!compact, |row| {
                            row.child(div().w(px(1.0)).h(px(12.0)).bg(orbit::alpha(skin.line3)))
                                .child(
                                    t(
                                        format!("Carrera {}", duration_txt(series.race_minutes())),
                                        13.0,
                                        400,
                                        skin.text2,
                                        cx,
                                    )
                                    .whitespace_nowrap(),
                                )
                        }),
                )
                .when(!compact, |info| {
                    info.child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(6.0))
                            .mt(px(10.0))
                            .overflow_hidden()
                            .child(t("Después:", 12.0, 400, skin.cap, cx).mr(px(2.0)))
                            .children(chips),
                    )
                }),
        )
        .child(
            div()
                .flex_none()
                .flex()
                .flex_col()
                .items_end()
                .child(
                    cap(
                        &format!("Sale {} a las {}", zone.day_rel(at, now), zone.hm(at)),
                        skin.cap,
                        cx,
                    )
                    .mb(px(6.0)),
                )
                .child(
                    orbit::mono_text(
                        countdown(at - now),
                        if compact { 38.0 } else { 46.0 },
                        skin.text1,
                        cx,
                    )
                    .line_height(px(if compact { 40.0 } else { 48.0 })),
                )
                .child(
                    div()
                        .flex()
                        .gap(px(4.0))
                        .mt(px(6.0))
                        .child(t("Carrera a las", 12.0, 400, skin.text2, cx))
                        .child(bold_mono(zone.hm(hero.race_at), 12.0, skin.text1, cx))
                        .child(t(format!("· {}", zone.long(at)), 12.0, 400, skin.text2, cx)),
                ),
        )
        .child(
            div()
                .flex_none()
                .flex()
                .flex_col()
                .gap(px(8.0))
                .min_w(px(if compact { 190.0 } else { 212.0 }))
                .child(
                    btn_pri("calendar-hero-launch", &launch_label, true, cx)
                        .child(chrome::keycap("Ctrl L", cx))
                        .on_click(cx.listener(|this, _, _, cx| this.launch_profile(cx))),
                )
                .child(
                    div()
                        .flex()
                        .gap(px(8.0))
                        .child(
                            btn("calendar-hero-ficha", "Ficha", false, cx)
                                .flex_1()
                                .child(icon("info", 15.0, skin.text1))
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    this.open_ficha(ficha_id.clone(), Some(at), cx);
                                })),
                        )
                        .child(
                            btn(
                                "calendar-hero-schedule",
                                &format!("Lanzar a las {}", zone.hm(at - Duration::minutes(3))),
                                false,
                                cx,
                            )
                            .flex_1()
                            .on_click(cx.listener(
                                move |this, _, _, cx| {
                                    this.schedule_launch(at - Duration::minutes(3), cx);
                                },
                            )),
                        ),
                ),
        )
}

fn tier_filter(cal: &Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let mut row = div()
        .flex()
        .flex_none()
        .items_center()
        .gap(px(2.0))
        .p(px(3.0))
        .rounded(px(9.0))
        .bg(rgb(skin.l2))
        .border_1()
        .border_color(orbit::alpha(skin.line1));
    for (index, (label, value)) in TIERS.iter().enumerate() {
        let on = cal.ui.filter.tier.as_deref() == *value;
        let value = value.map(str::to_owned);
        let dot = value.as_deref().map(|tier| {
            div()
                .size(px(8.0))
                .rounded(px(2.0))
                .bg(rgb(tier_dot_color(tier, cx)))
        });
        let button = chrome::seg_button_with(("calendar-tier", index), label, on, dot, cx);
        row = row.child(button.on_click(cx.listener(move |this, _, _, cx| {
            this.ui.filter.tier.clone_from(&value);
            cx.notify();
        })));
    }
    row
}

fn class_filter(cal: &Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let mut classes: Vec<String> = cal
        .schedule()
        .map(|s| {
            s.series
                .iter()
                .flat_map(super::super::model::Series::class_chips)
                .map(|c| c.name)
                .collect()
        })
        .unwrap_or_default();
    classes.sort();
    classes.dedup();
    let label = cal
        .ui
        .filter
        .class
        .clone()
        .unwrap_or_else(|| "Clase".into());
    let mut holder = div().relative().flex_none().child(
        div()
            .id("calendar-class")
            .role(gpui::Role::Button)
            .aria_label("Filtrar por clase")
            .tab_index(0)
            .h(px(28.0))
            .flex()
            .items_center()
            .gap(px(7.0))
            .px(px(11.0))
            .rounded_full()
            .border_1()
            .border_color(orbit::alpha(skin.line2))
            .cursor_pointer()
            .when(cal.ui.filter.class.is_some(), |chip| chip.bg(rgb(skin.l3)))
            .child(t(label, 12.5, 400, skin.text2, cx).whitespace_nowrap())
            .child(icon("down", 12.0, skin.text3))
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.class_menu = !this.ui.class_menu;
                cx.notify();
            })),
    );
    if cal.ui.class_menu {
        let mut menu = div()
            .id("calendar-class-menu")
            .absolute()
            .top(px(32.0))
            .right_0()
            .w(px(160.0))
            .p(px(4.0))
            .rounded(px(8.0))
            .bg(rgb(skin.l2))
            .border_1()
            .border_color(orbit::alpha(skin.line2))
            .occlude();
        for (index, name) in std::iter::once(None)
            .chain(classes.into_iter().map(Some))
            .enumerate()
        {
            let shown = name.clone().unwrap_or_else(|| "Todas las clases".into());
            menu = menu.child(
                div()
                    .id(("calendar-class-option", index))
                    .h(px(28.0))
                    .px(px(8.0))
                    .flex()
                    .items_center()
                    .gap(px(7.0))
                    .rounded(px(6.0))
                    .cursor_pointer()
                    .hover(|s| s.bg(orbit::alpha(skin.hover)))
                    .when_some(name.clone(), |row, name| row.child(class_dot(&name, cx)))
                    .child(t(shown, 12.5, 400, skin.text1, cx))
                    .on_click(cx.listener(move |this, _, _, cx| {
                        this.ui.filter.class.clone_from(&name);
                        this.ui.class_menu = false;
                        cx.notify();
                    })),
            );
        }
        holder = holder.child(gpui::deferred(menu).with_priority(orbit::MENU_Z));
    }
    holder
}

fn board(cal: &Calendar, compact: bool, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let now = cal.now();
    let zone = cal.zone();
    let Some(schedule) = cal.schedule() else {
        return div();
    };
    let board = rows::board(schedule, now, cal.favorites(), &cal.ui.filter);
    let total = schedule.series.len();
    let favs = cal.favorites().len();
    let from = now - Duration::minutes(LINE_BEFORE);
    let to = from + Duration::minutes(LINE_SPAN);
    let header = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(8.0))
        .px(px(14.0))
        .py(px(12.0))
        .child(
            div()
                .when(!compact, |title| title.w(px(80.0)))
                .child(orbit::caps("Salidas", 13.0, skin.text1, cx))
                .when(!compact, |title| {
                    title.child(
                        t(
                            format!("próximos 90 min · {}", zone.long(now)),
                            11.5,
                            400,
                            skin.cap,
                            cx,
                        )
                        .mt(px(3.0)),
                    )
                }),
        )
        .child(div().flex_1())
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(6.0))
                .children(
                    cal.ui
                        .search
                        .clone()
                        .filter(|input| cal.ui.search_open || !input.read(cx).value.is_empty())
                        .map(|input| {
                            div()
                                .relative()
                                .w(px(if compact { 130.0 } else { 180.0 }))
                                .child(input.clone())
                                .when(input.read(cx).value.is_empty(), |field| {
                                    field.child(
                                        t("Buscar serie", 13.0, 400, skin.text3, cx)
                                            .absolute()
                                            .left(px(14.0))
                                            .top(px(10.0)),
                                    )
                                })
                        }),
                )
                .child(super::fav_seg(cal, Some((total, favs)), cx))
                .child(tier_filter(cal, cx))
                .child(class_filter(cal, cx))
                .child(
                    chrome::ib(
                        "calendar-search",
                        "search",
                        "Buscar serie",
                        false,
                        cal.ui.search_open,
                        cx,
                    )
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.ui.search_open = !this.ui.search_open;
                        cx.notify();
                    })),
                ),
        );
    let (name_min, class_w, next_w, pad, gap) = if compact {
        (170.0, 92.0, 84.0, 12.0, 10.0)
    } else {
        (200.0, 104.0, 92.0, 16.0, 12.0)
    };
    let columns = |row: Div| row.flex().items_center().gap(px(gap)).px(px(pad));
    // Eje de la línea de tiempo: etiquetas cada 15 min.
    let ticks = ticks(from, to);
    let axis = columns(div())
        .h(px(30.0))
        .flex_none()
        .border_t_1()
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(div().w(px(if compact { 30.0 } else { 34.0 })).flex_none())
        .child(cap("Serie", skin.cap, cx).flex_1().min_w(px(name_min)))
        .child(cap("Clases", skin.cap, cx).w(px(class_w)).flex_none())
        .child(cap("Próxima", skin.cap, cx).w(px(next_w)).flex_none())
        .child(
            div()
                .relative()
                .h_full()
                .flex_1()
                .min_w_0()
                .children(ticks.iter().map(|tick| {
                    let f = rows::fraction(*tick, from, to);
                    mono(zone.hm(*tick), 10.5, skin.cap, cx)
                        .absolute()
                        .top(px(9.0))
                        .left(relative(f))
                        .ml(px(-22.0))
                        .w(px(44.0))
                        .text_center()
                        .whitespace_nowrap()
                }))
                .child(
                    div()
                        .absolute()
                        .top(px(22.0))
                        .left(relative(rows::fraction(now, from, to)))
                        .ml(px(-3.0))
                        .size(px(8.0))
                        .rounded_full()
                        .bg(rgb(acc(cx)))
                        .shadow(vec![orbit::kit_shadow(
                            acc(cx) << 8 | 0xff,
                            0.0,
                            8.0,
                            0.0,
                            false,
                        )]),
                ),
        );
    let mut list = div().flex().flex_col();
    let mut sorted = |label: &str, extra: &str, rows_in: &[Row<'_>], list: Div| -> Div {
        let mut list = list.child(group_row(label, extra, cx));
        for row in rows_in {
            list = list.child(series_row(
                cal,
                schedule,
                row,
                now,
                zone,
                from,
                to,
                &ticks,
                (compact, name_min, class_w, next_w, pad, gap),
                cx,
            ));
        }
        list
    };
    let Board {
        favs: fav_rows,
        rest,
    } = board;
    if !fav_rows.is_empty() {
        list = sorted("Tus favoritas", "· la más cercana arriba", &fav_rows, list);
    }
    if !rest.is_empty() {
        let label = if fav_rows.is_empty() {
            "Todas las series"
        } else {
            "Resto de series"
        };
        list = sorted(label, "· Bronce → Oro → Semanal", &rest, list);
    }
    if fav_rows.is_empty() && rest.is_empty() {
        list = list.child(
            center_message(
                "search",
                skin.text3,
                "Ninguna serie con estos filtros",
                "Prueba otra clase o nivel.",
                vec![],
                cx,
            )
            .py(px(40.0)),
        );
    }
    chrome::card(cx)
        .flex_1()
        .child(header)
        .child(axis)
        .child(orbit::scroll_fade(
            list.id("calendar-board").overflow_y_scroll(),
            chrome::skin(cx).neo.to,
        ))
}

fn ticks(from: DateTime<Utc>, to: DateTime<Utc>) -> Vec<DateTime<Utc>> {
    let step = 15 * 60;
    let first = (from.timestamp() + step - 1) / step * step;
    std::iter::successors(Some(first), |t| Some(t + step))
        .take_while(|t| *t < to.timestamp())
        .filter_map(|t| DateTime::from_timestamp(t, 0))
        .collect()
}

#[allow(clippy::too_many_arguments, clippy::type_complexity)]
fn series_row(
    cal: &Calendar,
    schedule: &super::super::Schedule,
    row: &Row<'_>,
    now: DateTime<Utc>,
    zone: Zone,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
    ticks: &[DateTime<Utc>],
    (compact, name_min, class_w, next_w, pad, gap): (bool, f32, f32, f32, f32, f32),
    cx: &mut Context<Calendar>,
) -> Stateful<Div> {
    let skin = chrome::skin(cx);
    let series = row.series;
    let id = series.id.clone();
    let soon = row.next.is_some_and(|at| at - now < Duration::minutes(10));
    let chips = series.class_chips();
    let band = cal.alerts.band(&series.id);
    let line = |f: f32, strong: bool| {
        div()
            .absolute()
            .top_0()
            .bottom_0()
            .left(relative(f))
            .w(px(1.0))
            .bg(orbit::alpha(if strong { skin.line2 } else { skin.line1 }))
    };
    let mut timeline = div()
        .relative()
        .h_full()
        .flex_1()
        .min_w_0()
        .overflow_hidden()
        .child(
            div()
                .absolute()
                .top_1_2()
                .left_0()
                .right_0()
                .h(px(2.0))
                .bg(orbit::alpha(skin.line1)),
        );
    for tick in ticks {
        timeline = timeline.child(line(
            rows::fraction(*tick, from, to),
            zone.minute_of_day(*tick).is_multiple_of(60),
        ));
    }
    // Franja de aviso de hoy sobre la línea de tiempo.
    if let Some(band) = band {
        let day = zone.date(now);
        let start = Zone::Local.day_start(day) + Duration::minutes(i64::from(band.from));
        let end = Zone::Local.day_start(day) + Duration::minutes(i64::from(band.to));
        let (a, b) = (start.max(from), end.min(to));
        if b > a {
            let (fa, fb) = (rows::fraction(a, from, to), rows::fraction(b, from, to));
            timeline = timeline.child(
                div()
                    .absolute()
                    .top(px(5.0))
                    .bottom(px(5.0))
                    .left(relative(fa))
                    .w(relative(fb - fa))
                    .rounded(px(6.0))
                    .bg(acc_bg(cx))
                    .border_t_2()
                    .border_color(rgb(acc(cx))),
            );
        }
    }
    timeline = timeline.child(
        div()
            .absolute()
            .top_0()
            .bottom_0()
            .left(relative(rows::fraction(now, from, to)))
            .ml(px(-1.0))
            .w(px(2.0))
            .bg(rgb(acc(cx)))
            .shadow(vec![orbit::kit_shadow(
                acc(cx) << 8 | 0xff,
                0.0,
                10.0,
                0.0,
                false,
            )]),
    );
    let margin = 5.5;
    let mut has_future = false;
    for start in &row.starts {
        if (*start - from).num_seconds() as f32 / 60.0 <= margin
            || (to - *start).num_seconds() as f32 / 60.0 <= margin
        {
            continue;
        }
        has_future |= *start >= now;
        let is_next = row.next == Some(*start);
        // Con franja, solo la próxima salida cubierta enseña la campana; las demás
        // quedan dentro de la banda y las tandas sueltas con aviso, marcadas.
        let covered = cal.alerts.cause(schedule, series, *start).is_some();
        let alerted = if band.is_some() {
            cal.alerts.slot_at(&series.id, *start) || (is_next && covered)
        } else {
            covered
        };
        timeline = timeline.child(start_pill(
            zone.hm(*start),
            *start < now,
            row.fav,
            is_next,
            alerted,
            rows::fraction(*start, from, to),
            cx,
        ));
    }
    if !has_future && let Some(next) = row.next {
        let tag = match series.kind() {
            super::super::model::Kind::Special => " · tandas de fin de semana",
            super::super::model::Kind::Weekly => " · tandas mar–jue",
            super::super::model::Kind::Daily => "",
        };
        timeline = timeline.child(
            div()
                .absolute()
                .right(px(6.0))
                .top(px(if compact { 10.0 } else { 11.0 }))
                .h(px(24.0))
                .flex()
                .items_center()
                .gap(px(4.0))
                .pl(px(9.0))
                .pr(px(6.0))
                .rounded(px(5.0))
                .bg(if row.fav {
                    acc_bg(cx)
                } else {
                    rgb(skin.l2).into()
                })
                .border_1()
                .border_color(if row.fav {
                    acc_line(cx)
                } else {
                    orbit::alpha(skin.line2)
                })
                .child(
                    t(
                        format!("{} {}{tag}", zone.day_rel(next, now), zone.hm(next)),
                        12.0,
                        400,
                        if row.fav { skin.text1 } else { skin.text2 },
                        cx,
                    )
                    .whitespace_nowrap(),
                )
                .child(icon("right", 12.0, skin.text3)),
        );
    }
    let name_open = id.clone();
    let fav_id = id.clone();
    let open_id = id.clone();

    div()
        .id(("calendar-row", series.id.len() * 1000 + series.name.len()))
        .relative()
        .h(px(46.0))
        .flex_none()
        .flex()
        .items_center()
        .gap(px(gap))
        .px(px(pad))
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .cursor_pointer()
        .hover(move |s| s.bg(orbit::alpha(skin.hover)))
        .when(row.fav, |r| {
            r.bg(gpui::linear_gradient(
                90.0,
                gpui::linear_color_stop(acc_bg(cx), 0.0),
                gpui::linear_color_stop(tint(0, 0.0), 0.6),
            ))
            .child(
                div()
                    .absolute()
                    .left_0()
                    .top(px(8.0))
                    .bottom(px(8.0))
                    .w(px(3.0))
                    .rounded_r(px(3.0))
                    .bg(rgb(acc(cx))),
            )
        })
        .child(
            ib(
                ("calendar-fav", series.id.len() * 1000 + series.name.len()),
                "star",
                if row.fav {
                    "Quitar de favoritas"
                } else {
                    "Añadir a favoritas"
                },
                true,
                row.fav,
                cx,
            )
            .on_click(cx.listener(move |this, _, _, cx| {
                cx.stop_propagation();
                this.toggle_fav(&fav_id, cx);
            })),
        )
        .child(
            div()
                .flex_1()
                .min_w(px(name_min))
                .flex()
                .flex_col()
                .child(
                    div()
                        .flex()
                        .items_center()
                        .child(
                            t(series.name.clone(), 13.5, 600, skin.text1, cx)
                                .truncate()
                                .id((
                                    "calendar-row-name",
                                    series.id.len() * 1000 + series.name.len(),
                                ))
                                .cursor_pointer()
                                .hover(gpui::Styled::underline)
                                .on_click(cx.listener(move |this, _, _, cx| {
                                    cx.stop_propagation();
                                    this.open_serie(name_open.clone(), cx);
                                })),
                        )
                        .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx))),
                )
                .child(
                    div()
                        .flex()
                        .items_center()
                        .gap(px(6.0))
                        .overflow_hidden()
                        .child(tier(series, cx))
                        .child(
                            t(
                                format!(
                                    "{}{} · {}",
                                    series.track_short(),
                                    if series.track_layout().is_empty() {
                                        String::new()
                                    } else {
                                        format!(" {}", series.track_layout())
                                    },
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
        .child(
            div()
                .w(px(class_w))
                .flex_none()
                .overflow_hidden()
                .flex()
                .flex_col()
                .gap(px(2.0))
                .child(if chips.len() > 2 {
                    div()
                        .flex()
                        .items_center()
                        .gap(px(5.0))
                        .children(chips.iter().map(|c| class_dot(&c.name, cx)))
                        .child(
                            t(format!("{} clases", chips.len()), 11.5, 400, skin.text2, cx)
                                .whitespace_nowrap(),
                        )
                } else {
                    div()
                        .flex()
                        .flex_col()
                        .gap(px(2.0))
                        .children(chips.iter().map(|c| {
                            class_chip(
                                &super::super::model::ClassChip {
                                    extra: None,
                                    ..c.clone()
                                },
                                cx,
                            )
                        }))
                }),
        )
        .child(next_cell(row.next, now, zone, soon, next_w, cx))
        .child(timeline)
        .on_click(cx.listener(move |this, _, _, cx| this.open_ficha(open_id.clone(), None, cx)))
}

fn next_cell(
    next: Option<DateTime<Utc>>,
    now: DateTime<Utc>,
    zone: Zone,
    soon: bool,
    width: f32,
    cx: &gpui::App,
) -> Div {
    let skin = chrome::skin(cx);
    let cell = div().w(px(width)).flex_none().flex().flex_col();
    let Some(next) = next else {
        return cell.child(t("—", 12.0, 400, skin.text3, cx));
    };
    let sub = if zone.date(next) == zone.date(now) {
        in_txt(next - now)
    } else {
        zone.day_rel(next, now)
    };
    cell.child(bold_mono(zone.hm(next), 15.0, skin.text1, cx).line_height(px(17.0)))
        .child(t(
            sub,
            11.5,
            if soon { 600 } else { 400 },
            if soon { chrome::acct(cx) } else { skin.text3 },
            cx,
        ))
}

#[allow(clippy::fn_params_excessive_bools)]
fn start_pill(
    label: String,
    gone: bool,
    fav: bool,
    next: bool,
    alert: bool,
    f: f32,
    cx: &gpui::App,
) -> Div {
    let skin = chrome::skin(cx);
    let width = if alert { 58.0 } else { 46.0 };
    let (bg, fg, ring): (gpui::Background, u32, Option<gpui::Hsla>) = if alert || (fav && next) {
        (orbit::ramp(skin.button, 180.0), 0x00ff_ffff, None)
    } else if fav {
        (acc_bg(cx).into(), skin.text1, Some(acc_line(cx)))
    } else if next {
        (
            rgb(skin.l1).into(),
            skin.text1,
            Some(orbit::alpha(skin.text3)),
        )
    } else if gone {
        (
            rgb(skin.l2).into(),
            skin.text3,
            Some(orbit::alpha(skin.line2)),
        )
    } else {
        (
            rgb(skin.l3).into(),
            skin.text2,
            Some(orbit::alpha(skin.line2)),
        )
    };
    div()
        .absolute()
        .top_1_2()
        .mt(px(-11.0))
        .left(relative(f))
        .ml(px(-width / 2.0))
        .w(px(width))
        .h(px(22.0))
        .flex()
        .items_center()
        .justify_center()
        .gap(px(3.0))
        .rounded(px(5.0))
        .bg(bg)
        .when(gone, |p| p.opacity(0.5))
        .when_some(ring, |p, ring| p.border_1().border_color(ring))
        .when(alert, |p| p.child(icon("bell-fill", 10.0, fg)))
        .child(
            orbit::mono_text(label, 11.0, fg, cx)
                .when(next, |s| s.font_weight(gpui::FontWeight(700.0)))
                .whitespace_nowrap(),
        )
}

/// Sin horario: nunca se ha descargado nada.
pub(super) fn missing(cal: &Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let _ = cal;
    chrome::card(cx).flex_1().child(center_message(
        "wifi-off",
        skin.err,
        "No hemos podido descargar el horario",
        "Hace falta conexión la primera vez. En cuanto lo descarguemos queda guardado en este equipo y el calendario funciona sin internet.",
        vec![
            btn_text_pri("calendar-missing-retry", "", cx)
                .gap(px(8.0))
                .child(icon("refresh", 15.0, 0x00ff_ffff))
                .child(
                    orbit::text("Reintentar", 13.0, 600, 0x00ff_ffff, cx).whitespace_nowrap(),
                )
                .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))),
        ],
        cx,
    ))
}

/// Semana terminada y la nueva sin publicar: mensaje y última semana en solo lectura.
pub(super) fn expired(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = chrome::skin(cx);
    let title = cal
        .last_week
        .as_ref()
        .and_then(|s| s.window().ok())
        .map(|(from, _)| clock::week_title(&clock::week_days(from)))
        .unwrap_or_default();
    let next = cal
        .last_week
        .as_ref()
        .and_then(|s| s.window().ok())
        .map(|(_, to)| clock::week_title(&clock::week_days(to)))
        .unwrap_or_default();
    let favs = cal.favorites().len();
    let banner = orbit::neo_card(cx)
        .flex_none()
        .flex_row()
        .items_center()
        .gap(px(18.0))
        .child(
            div()
                .size(px(56.0))
                .flex_none()
                .rounded(px(16.0))
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(skin.l2))
                .child(icon("clock", 26.0, skin.warn)),
        )
        .child(
            div()
                .flex_1()
                .min_w_0()
                .child(disp(format!("La semana {title} terminó. Esperando la del {next}"), 24.0, skin.text1, cx))
                .child(
                    t(
                        format!("LMU suele publicarla el lunes por la mañana. La buscamos sola cada 15 min; tus {favs} favoritas y tus avisos pasarán a la nueva semana sin hacer nada."),
                        13.0, 400, skin.text3, cx,
                    )
                    .mt(px(6.0)),
                ),
        )
        .child(
            div()
                .flex_none()
                .flex()
                .flex_col()
                .items_end()
                .gap(px(6.0))
                .child(
                    btn("calendar-expired-refresh", "Buscar ahora", false, cx)
                        .child(icon("refresh", 15.0, skin.text1))
                        .on_click(cx.listener(|this, _, _, cx| this.refresh(cx))),
                )
                .child(
                    super::avisos::toggle(
                        "calendar-notify-week",
                        "Avisarme al llegar",
                        "",
                        cal.alerts.notify_week,
                        cx,
                    )
                    .on_click(super::avisos::edit(cx, |a| {
                        a.notify_week = !a.notify_week;
                        Ok(())
                    })),
                ),
        );
    let readonly = super::semana::card(cal, true, cx);
    let _ = View::Proximas;
    div()
        .flex_1()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(14.0))
        .child(banner)
        .child(readonly)
}
