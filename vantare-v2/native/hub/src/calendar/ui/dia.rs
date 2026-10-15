//! Día: un horario de tren, una columna por serie y las horas en vertical.
use super::super::{
    Calendar, Series,
    alerts::Cause,
    chrome::{self, acc, acc_bg, bold_mono, cap, center_message, disp, mono, skin, t, tier},
    clock, rows,
};
use super::{fav_seg, full_button, span_seg};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, Timelike, Utc};
use gpui::{Context, Div, div, point, prelude::*, px, rgb};

const HOUR_H: f32 = 30.0;

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let skin = skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let Some(schedule) = cal.schedule().cloned() else {
        return div();
    };
    let days = clock::week_days(clock::week_start(now));
    let today = days.iter().position(|d| *d == zone.date(now));
    let index = cal.ui.day.unwrap_or_else(|| today.unwrap_or(0)).min(6);
    let a = zone.day_start(days[index]);
    let b = zone.day_start(days[index] + Duration::days(1));
    let line = orbit::alpha(skin.line1);

    // Series: favoritas primero, luego por nivel.
    let mut series: Vec<&Series> = schedule
        .series
        .iter()
        .filter(|s| !cal.ui.filter.only_favs || rows::is_fav(cal.favorites(), s))
        .collect();
    series.sort_by_key(|s| (!rows::is_fav(cal.favorites(), s), s.rank(), s.name.clone()));
    let starts: Vec<Vec<DateTime<Utc>>> = series
        .iter()
        .map(|s| schedule.starts(s, a, b).unwrap_or_default())
        .collect();
    let total: usize = starts.iter().map(Vec::len).sum();

    let chips = div()
        .flex()
        .gap(px(5.0))
        .children(days.iter().enumerate().map(|(i, d)| {
            let on = i == index;
            let is_today = Some(i) == today;
            let past = zone.day_start(*d + Duration::days(1)) <= now;
            div()
                .id(("calendar-day-chip", i))
                .w(px(46.0))
                .h(px(44.0))
                .flex()
                .flex_col()
                .items_center()
                .justify_center()
                .rounded(px(8.0))
                .cursor_pointer()
                .border_1()
                .border_color(if on || is_today {
                    rgb(acc(cx)).into()
                } else {
                    line
                })
                .when(on, |c| c.bg(acc_bg(cx)))
                .child(cap(
                    if is_today { "HOY" } else { clock::day_name(*d) },
                    if on {
                        chrome::acct(cx)
                    } else if past {
                        skin.text3
                    } else {
                        skin.cap
                    },
                    cx,
                ))
                .child(disp(
                    d.day().to_string(),
                    17.0,
                    if past && !on { skin.text3 } else { skin.text1 },
                    cx,
                ))
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.ui.day = Some(i);
                    this.ui.scrolled_day = None;
                    cx.notify();
                }))
        }));
    let bar = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(8.0))
        .px(px(12.0))
        .py(px(10.0))
        .child(chips)
        .child(div().w(px(84.0)).flex_none().child(t(
            if cal.adapt.width < 1400.0 {
                format!("{total} salidas")
            } else {
                format!("{total} salidas · {}", zone.long(now))
            },
            12.0,
            400,
            skin.cap,
            cx,
        )))
        .child(div().flex_1())
        .child(full_button(cal, cx))
        .child(span_seg(cal, cx))
        .child(fav_seg(cal, None, cx));
    if series.is_empty() {
        return chrome::card(cx).flex_1().child(bar).child(center_message(
            "star-line",
            skin.text2,
            "Ninguna favorita todavía",
            "Marca series con la estrella o quita el filtro.",
            vec![],
            cx,
        ));
    }

    let compact = cal.adapt.width < 1400.0;
    let head = div()
        .flex_none()
        .flex()
        .border_t_1()
        .border_b_1()
        .border_color(line)
        .child(div().w(px(46.0)).flex_none())
        .children(series.iter().map(|s| {
            let fav = rows::is_fav(cal.favorites(), s);
            div()
                .flex_1()
                .min_w(px(52.0))
                .px(px(7.0))
                .py(px(6.0))
                .gap(px(3.0))
                .flex()
                .flex_col()
                .border_l_1()
                .border_color(line)
                .when(fav, |c| {
                    c.bg(acc_bg(cx)).border_t_2().border_color(rgb(acc(cx)))
                })
                .child(
                    t(s.name.clone(), 11.5, 700, skin.text1, cx)
                        .h(px(30.0))
                        .overflow_hidden(),
                )
                .child(div().flex().child(tier(s, cx)))
                .when(!compact, |c| {
                    c.child(t(s.track_short().to_owned(), 10.5, 400, skin.text3, cx).truncate())
                })
        }));

    let mut grid = div().relative().flex().flex_col();
    for hour in 0..24u32 {
        let (h0, h1) = (
            a + Duration::hours(i64::from(hour)),
            a + Duration::hours(i64::from(hour) + 1),
        );
        let local_hour = zone.naive(h0).hour();
        let is_now = now >= h0 && now < h1;
        let past = h1 <= now;
        let mut row = div()
            .flex_none()
            .flex()
            .h(px(HOUR_H))
            .border_b_1()
            .border_color(line)
            .child(
                div()
                    .w(px(46.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .justify_end()
                    .pr(px(8.0))
                    .child(bold_mono(
                        format!("{local_hour:02}h"),
                        11.5,
                        if is_now {
                            chrome::acct(cx)
                        } else if past {
                            skin.text3
                        } else {
                            skin.text2
                        },
                        cx,
                    )),
            );
        for (i, s) in series.iter().enumerate() {
            let in_hour: Vec<_> = starts[i]
                .iter()
                .copied()
                .filter(|t| *t >= h0 && *t < h1)
                .collect();
            let in_band = cal.alerts.band(&s.id).is_some_and(|band| {
                let m = u16::try_from(local_hour * 60).unwrap_or(0);
                band.from <= m && m < band.to
            });
            let next = schedule.next_start(s, now);
            let daily = rows::is_daily(s);
            let mut cell = div()
                .flex_1()
                .min_w(px(52.0))
                .flex()
                .items_center()
                .gap(px(3.0))
                .px(px(5.0))
                .overflow_hidden()
                .border_l_1()
                .border_color(line)
                .when(in_band, |c| c.bg(chrome::tint(acc(cx), 0.26)));
            for start in in_hour {
                let label = if daily {
                    format!("{:02}", zone.naive(start).minute())
                } else {
                    zone.hm(start)
                };
                let alerted = cal.alerts.cause(&schedule, s, start) == Some(Cause::Slot);
                let gone = start < now;
                let (sid, st) = (s.id.clone(), start);
                cell = cell.child(
                    div()
                        .id((
                            "calendar-day-min",
                            (i << 20) | (start.timestamp() as usize & 0xfffff),
                        ))
                        .flex_none()
                        .px(px(3.0))
                        .rounded(px(4.0))
                        .cursor_pointer()
                        .when(Some(start) == next, |c| {
                            c.border_1().border_color(rgb(skin.text1))
                        })
                        .when(alerted, |c| c.bg(rgb(acc(cx))))
                        .child(if alerted || Some(start) == next {
                            bold_mono(
                                label,
                                11.0,
                                if alerted { 0x00ff_ffff } else { skin.text1 },
                                cx,
                            )
                        } else {
                            mono(label, 11.0, if gone { skin.text3 } else { skin.text2 }, cx)
                        })
                        .when(gone, |c| c.opacity(0.7))
                        .on_click(cx.listener(move |this, _, _, cx| {
                            this.open_ficha(sid.clone(), Some(st), cx);
                        })),
                );
            }
            row = row.child(cell);
        }
        grid = grid.child(row);
    }
    // Línea de ahora, solo si el día mostrado es hoy.
    if today == Some(index) {
        let y = (now - a).num_seconds() as f32 / 3600.0 * HOUR_H;
        grid = grid.child(
            div()
                .absolute()
                .top(px(y))
                .left_0()
                .right_0()
                .h(px(2.0))
                .bg(rgb(acc(cx)))
                .child(
                    div()
                        .absolute()
                        .left(px(40.0))
                        .top(px(-3.0))
                        .size(px(8.0))
                        .rounded_full()
                        .bg(rgb(acc(cx))),
                ),
        );
    }
    // Se abre colocado unas horas antes de la actual (gpui lo recorta al layout).
    if cal.ui.scrolled_day != Some(index) {
        // El alto de la lista no se conoce hasta pintar: se reintenta unos fotogramas.
        cal.ui.scroll_tries += 1;
        if cal.ui.scroll.max_offset().y > px(0.0) || cal.ui.scroll_tries > 8 {
            cal.ui.scrolled_day = Some(index);
            cal.ui.scroll_tries = 0;
        } else {
            cx.notify();
        }
        let hour = if today == Some(index) {
            zone.naive(now).hour().saturating_sub(6)
        } else {
            5
        };
        cal.ui
            .scroll
            .set_offset(point(px(0.0), px(-(hour as f32) * HOUR_H)));
    }
    let item = |swatch: Div, label: &str| {
        div()
            .flex()
            .items_center()
            .gap(px(7.0))
            .child(swatch)
            .child(t(label.to_owned(), 11.5, 400, skin.text3, cx))
    };
    let legend = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(18.0))
        .px(px(14.0))
        .py(px(9.0))
        .border_t_1()
        .border_color(line)
        .child(item(
            mono("15", 11.0, skin.text3, cx),
            "Minuto de salida dentro de esa hora",
        ))
        .child(item(
            div()
                .px(px(4.0))
                .rounded(px(4.0))
                .border_1()
                .border_color(rgb(skin.text1))
                .child(bold_mono("00", 11.0, skin.text1, cx)),
            "Tu próxima",
        ))
        .child(item(
            div()
                .w(px(18.0))
                .h(px(12.0))
                .rounded(px(3.0))
                .bg(chrome::tint(acc(cx), 0.32)),
            "Tu franja de aviso",
        ))
        .child(item(
            div()
                .px(px(4.0))
                .rounded(px(4.0))
                .bg(rgb(acc(cx)))
                .child(bold_mono("22", 11.0, 0x00ff_ffff, cx)),
            "Tanda con aviso",
        ))
        .child(div().flex_1())
        .child(t(
            "Pulsa una hora para abrir su ficha",
            11.5,
            400,
            skin.text3,
            cx,
        ));
    chrome::card(cx)
        .flex_1()
        .child(bar)
        .child(head)
        .child(
            grid.id("calendar-day-grid")
                .flex_1()
                .min_h_0()
                .overflow_y_scroll()
                .track_scroll(&cal.ui.scroll),
        )
        .child(legend)
}
