//! Mes: cuadrícula de semanas LMU (martes a lunes) con su estado y su densidad.
use super::super::{
    Calendar, Health, Schedule,
    alerts::Alerts,
    chrome::{self, Tone, acc, acc_bg, acct, bold_mono, cap, disp, ib, icon, pill, skin, t},
    clock, rows,
};
use super::{full_button, span_seg};
use crate::orbit;
use chrono::{DateTime, Datelike, Duration, NaiveDate, Utc};
use gpui::{Context, Div, div, prelude::*, px, relative, rgb};

#[derive(Clone, Copy, PartialEq, Eq)]
enum State {
    Past,
    Now,
    Waiting,
    Unpublished,
    Unsaved,
}

/// Salidas por hora que llenan la barra entera de la minigráfica.
const DENSITY_MAX: f32 = 40.0;

/// Lo que el Mes necesita saber de un día; sale de expandir las recurrencias.
#[derive(Clone, Default)]
pub(crate) struct DayFacts {
    /// Posición en `schedule.series` de las series con tandas de evento ese día.
    event_series: Vec<usize>,
    per_hour: [u32; 24],
    event_hours: [bool; 24],
    total: u32,
    /// Avisos de lo que queda del día (depende del minuto actual).
    alerts: usize,
}

/// Hechos por día del Mes. Se rehacen cuando cambian los datos (`revision`) o
/// el minuto; los repintados de cada segundo los reutilizan.
#[derive(Default)]
pub(crate) struct MonthCache {
    key: (u64, i64),
    days: std::collections::HashMap<NaiveDate, DayFacts>,
}

impl MonthCache {
    fn facts(
        &mut self,
        key: (u64, i64),
        day: NaiveDate,
        make: impl FnOnce() -> DayFacts,
    ) -> &DayFacts {
        if self.key != key {
            self.days.clear();
            self.key = key;
        }
        self.days.entry(day).or_insert_with(make)
    }
}

pub(super) fn render(cal: &mut Calendar, cx: &mut Context<Calendar>) -> Div {
    let mut cache = std::mem::take(&mut cal.ui.month_cache);
    let page = render_with(cal, &mut cache, cx);
    cal.ui.month_cache = cache;
    page
}

#[allow(clippy::too_many_lines)] // Cabecera, cuadrícula de cinco semanas y leyenda.
fn render_with(cal: &mut Calendar, cache: &mut MonthCache, cx: &mut Context<Calendar>) -> Div {
    let skin = skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let compact = cal.adapt.width < 1400.0;
    let today = zone.date(now);
    let first_of_month = today
        .with_day(1)
        .and_then(|d| {
            let months = cal.ui.month;
            let index = d.year() * 12 + d.month0() as i32 + months;
            NaiveDate::from_ymd_opt(index.div_euclid(12), (index.rem_euclid(12) + 1) as u32, 1)
        })
        .unwrap_or(today);
    let next_month = if first_of_month.month() == 12 {
        NaiveDate::from_ymd_opt(first_of_month.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(first_of_month.year(), first_of_month.month() + 1, 1)
    }
    .unwrap_or(first_of_month);
    // Semanas LMU (martes) que cubren el mes.
    let mut start = first_of_month;
    while start.weekday() != chrono::Weekday::Tue {
        start -= Duration::days(1);
    }
    let weeks: Vec<NaiveDate> =
        std::iter::successors(Some(start), |d| Some(*d + Duration::days(7)))
            .take_while(|d| *d < next_month)
            .collect();
    let current_start = clock::week_start(now);
    let schedules: Vec<&Schedule> = [
        cal.current.as_ref(),
        cal.last_week.as_ref(),
        cal.previous.as_ref(),
    ]
    .into_iter()
    .flatten()
    .collect();
    let schedule_of = |week: NaiveDate| {
        schedules
            .iter()
            .copied()
            .find(|s| s.window().is_ok_and(|(from, _)| from.date_naive() == week))
    };

    let title = format!(
        "{} {}",
        month_label(first_of_month.month()),
        first_of_month.year()
    );
    let bar = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(10.0))
        .px(px(16.0))
        .py(px(12.0))
        .child(
            ib(
                "calendar-month-prev",
                "chevron-left",
                "Mes anterior",
                false,
                false,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.month -= 1;
                cx.notify();
            })),
        )
        .child(
            disp(title, 19.0, skin.text1, cx)
                .min_w(px(if compact { 150.0 } else { 170.0 }))
                .text_center(),
        )
        .child(
            ib(
                "calendar-month-next",
                "right",
                "Mes siguiente",
                false,
                false,
                cx,
            )
            .on_click(cx.listener(|this, _, _, cx| {
                this.ui.month += 1;
                cx.notify();
            })),
        )
        .child(
            chrome::btn("calendar-month-today", "Hoy", true, cx).on_click(cx.listener(
                |this, _, _, cx| {
                    this.ui.month = 0;
                    cx.notify();
                },
            )),
        )
        .when(!compact, |bar| {
            bar.child(t("semanas LMU, de martes a lunes", 12.0, 400, skin.cap, cx))
        })
        .child(div().flex_1())
        .child(full_button(cal, cx))
        .child(span_seg(cal, cx));

    let week_w = if compact { 104.0 } else { 132.0 };
    let header = div()
        .flex_none()
        .flex()
        .border_t_1()
        .border_b_1()
        .border_color(orbit::alpha(skin.line1))
        .child(div().w(px(week_w)).flex_none())
        .children(["MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM", "LUN"].map(|d| {
            div()
                .flex_1()
                .h(px(30.0))
                .flex()
                .items_center()
                .justify_center()
                .child(cap(d, skin.cap, cx))
        }));

    let mut grid = div().flex_1().min_h_0().flex().flex_col();
    for (row_index, week) in weeks.iter().enumerate() {
        let schedule = schedule_of(*week);
        let state = if *week == current_start.date_naive() {
            State::Now
        } else if *week < current_start.date_naive() {
            if schedule.is_some() {
                State::Past
            } else {
                State::Unsaved
            }
        } else if schedule.is_none()
            && *week == current_start.date_naive() + Duration::days(7)
            && cal.health() == Health::Expired
        {
            State::Waiting
        } else {
            State::Unpublished
        };
        let (label, tone, note) = match state {
            State::Past => ("Pasada", Tone::Neutral, "desde tu caché"),
            State::Now => ("Esta semana", Tone::Acc, ""),
            State::Waiting => ("Esperando", Tone::Warn, "LMU publica cada lunes"),
            State::Unpublished => ("Sin publicar", Tone::Neutral, "LMU publica cada lunes"),
            State::Unsaved => ("Sin guardar", Tone::Neutral, ""),
        };
        let last_day = *week + Duration::days(6);
        let range = if compact {
            format!("{} {}", week.day(), month_short(week.month()))
        } else {
            format!(
                "{} {} – {} {}",
                week.day(),
                month_short(week.month()),
                last_day.day(),
                month_short(last_day.month())
            )
        };
        let mut row = div()
            .relative()
            .min_h(px(60.0))
            .flex()
            .border_b_1()
            .border_color(orbit::alpha(skin.line1))
            .child(
                div()
                    .w(px(week_w))
                    .flex_none()
                    .px(px(12.0))
                    .py(px(10.0))
                    .gap(px(5.0))
                    .flex()
                    .flex_col()
                    .items_start()
                    .when(state == State::Now, |c| {
                        c.border_l_2().border_color(rgb(acc(cx))).bg(acc_bg(cx))
                    })
                    .child(disp(range, 15.0, skin.text1, cx))
                    .child(pill(label, tone, cx))
                    .when(!compact && !note.is_empty(), |c| {
                        c.child(t(note, 11.0, 400, skin.cap, cx))
                    }),
            );
        // Las dos primeras semanas ocupan más; las demás van más bajas.
        row = row.flex_basis(relative(0.0));
        row.style().flex_grow = Some(if row_index < 2 { 1.0 } else { 0.6 });
        let past_week = *week < current_start.date_naive();
        let key = (cal.revision, now.timestamp().div_euclid(60));
        let week_facts: Vec<Option<DayFacts>> = (0..7)
            .map(|offset| {
                let day = *week + Duration::days(offset);
                let span = (zone.day_start(day), zone.day_start(day + Duration::days(1)));
                schedule.map(|s| {
                    let alerts = (state == State::Now).then_some(&cal.alerts);
                    cache
                        .facts(key, day, || day_facts(s, span, (now, alerts)))
                        .clone()
                })
            })
            .collect();
        // Carriles de la fila entera; cada día reserva hasta el más bajo que lo cruza.
        let bars = lanes(&week_facts);
        let reserve = reserved(&bars);
        for offset in 0..7 {
            let day = *week + Duration::days(offset);
            let is_today = day == today;
            let outside = day.month() != first_of_month.month();
            let b = zone.day_start(day + Duration::days(1));
            let mut cell = div()
                .flex_1()
                .min_w_0()
                .relative()
                .flex()
                .flex_col()
                .gap(px(5.0))
                .py(px(7.0))
                .border_l_1()
                .border_color(orbit::alpha(skin.line1))
                .when(is_today, |c| {
                    c.border_2().border_color(rgb(acc(cx))).bg(acc_bg(cx))
                })
                .when(schedule.is_none(), |c| c.bg(chrome::stripe(cx)));
            let ran = cal.runs.iter().filter(|r| zone.date(r.at) == day).count();
            let facts = &week_facts[offset as usize];
            let alerts = facts.as_ref().map_or(0, |f| f.alerts);
            let mut head = div().flex().items_center().gap(px(4.0)).px(px(8.0));
            head = head.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(6.0))
                    .flex_1()
                    .when(is_today, |d| d.child(cap("Hoy", acct(cx), cx)))
                    .child(disp(
                        day.day().to_string(),
                        17.0,
                        if outside { skin.cap } else { skin.text1 },
                        cx,
                    )),
            );
            if ran > 0 {
                head = head.child(day_pill(
                    chrome::tint(skin.ok, 0.13).into(),
                    chrome::ok_text(cx),
                    "check",
                    ran,
                    cx,
                ));
            }
            if alerts > 0 {
                head = head.child(day_pill(
                    orbit::ramp(skin.button, 180.0),
                    0x00ff_ffff,
                    "bell-fill",
                    alerts,
                    cx,
                ));
            }
            cell = cell.child(head);
            if let Some(facts) = facts {
                // Reserva los carriles de eventos que cruzan este día: se dibujan
                // encima de toda la fila y no pueden pisar la densidad.
                cell = cell.child(
                    div()
                        .h(px(23.0 * reserve[offset as usize] as f32))
                        .flex_none(),
                );
                cell = cell.child(density(facts, b <= now, cx));
                if !compact {
                    cell = cell.child(div().px(px(8.0)).when(b <= now, |d| d.opacity(0.55)).child(
                        chrome::mono(format!("{} salidas", facts.total), 10.5, skin.cap, cx),
                    ));
                }
            }
            row = row.child(cell);
        }
        if let Some(schedule) = schedule {
            row = row.child(event_bars(schedule, &bars, week_w, past_week, cx));
        }
        grid = grid.child(row);
    }

    let legend = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(18.0))
        .px(px(14.0))
        .py(px(9.0))
        .border_t_1()
        .border_color(orbit::alpha(skin.line1))
        .child(legend_bar("WEC Weekly", false, cx))
        .child(t("Semanal", 11.5, 400, skin.text3, cx))
        .child(legend_bar("10 Hours", true, cx))
        .child(t("Especial", 11.5, 400, skin.text3, cx))
        .child(
            div()
                .w(px(22.0))
                .h(px(14.0))
                .flex()
                .items_end()
                .gap(px(1.0))
                .child(div().flex_1().h(relative(0.6)).bg(orbit::alpha(skin.line3)))
                .child(div().flex_1().h(relative(0.9)).bg(rgb(acc(cx))))
                .child(div().flex_1().h(relative(0.6)).bg(orbit::alpha(skin.line3))),
        )
        .child(div().min_w_0().child(t(
            if compact {
                "Salidas por hora"
            } else {
                "Salidas por hora (rojo: tandas de evento)"
            },
            11.5,
            400,
            skin.text3,
            cx,
        )))
        .child(day_pill(
            chrome::tint(skin.ok, 0.13).into(),
            chrome::ok_text(cx),
            "check",
            3,
            cx,
        ))
        .child(div().min_w_0().child(t(
            if compact {
                "Corridas"
            } else {
                "Carreras que corriste"
            },
            11.5,
            400,
            skin.text3,
            cx,
        )))
        .child(day_pill(
            orbit::ramp(skin.button, 180.0),
            0x00ff_ffff,
            "bell-fill",
            2,
            cx,
        ))
        .child(t("Avisos", 11.5, 400, skin.text3, cx));

    chrome::card(cx)
        .flex_1()
        .child(bar)
        .child(header)
        .child(grid)
        .child(legend)
}

fn legend_bar(label: &str, special: bool, cx: &gpui::App) -> Div {
    div()
        .h(px(20.0))
        .px(px(8.0))
        .flex()
        .items_center()
        .rounded(px(5.0))
        .when(special, |d| d.bg(orbit::ramp(skin(cx).button, 180.0)))
        .when(!special, |d| {
            d.bg(acc_bg(cx))
                .border_1()
                .border_color(chrome::acc_line(cx))
        })
        .child(t(
            label.to_owned(),
            11.0,
            600,
            if special {
                0x00ff_ffff
            } else {
                chrome::acct(cx)
            },
            cx,
        ))
}

/// Pastilla de recuento de un día (`.mpill`): corridas en verde, avisos en carmín.
fn day_pill(
    bg: gpui::Background,
    color: u32,
    glyph: &'static str,
    count: usize,
    cx: &gpui::App,
) -> Div {
    div()
        .h(px(18.0))
        .px(px(5.0))
        .flex()
        .flex_none()
        .items_center()
        .gap(px(3.0))
        .rounded(px(5.0))
        .bg(bg)
        .child(icon(glyph, 10.0, color))
        .child(bold_mono(count.to_string(), 10.5, color, cx))
}

/// Un tramo continuo de una serie de evento dentro de la fila (días 0..=6).
struct Bar {
    series: usize,
    from: usize,
    to: usize,
    lane: usize,
}

/// Carriles: cada tramo ocupa el primer carril libre en sus días.
fn lanes(week: &[Option<DayFacts>]) -> Vec<Bar> {
    let mut indexes: Vec<usize> = week
        .iter()
        .flatten()
        .flat_map(|f| f.event_series.iter().copied())
        .collect();
    indexes.sort_unstable();
    indexes.dedup();
    let mut lane_ends: Vec<usize> = vec![];
    let mut bars = vec![];
    for series in indexes {
        // Días de la semana con tandas de esta serie.
        let present: Vec<bool> = week
            .iter()
            .map(|day| {
                day.as_ref()
                    .is_some_and(|f| f.event_series.contains(&series))
            })
            .collect();
        let mut offset = 0;
        while offset < present.len() {
            if !present[offset] {
                offset += 1;
                continue;
            }
            let from = offset;
            while offset < present.len() && present[offset] {
                offset += 1;
            }
            let lane = lane_ends
                .iter()
                .position(|end| *end <= from)
                .unwrap_or_else(|| {
                    lane_ends.push(0);
                    lane_ends.len() - 1
                });
            lane_ends[lane] = offset;
            bars.push(Bar {
                series,
                from,
                to: offset - 1,
                lane,
            });
        }
    }
    bars
}

/// Carriles que reserva cada día: hasta el más bajo de las barras que lo cruzan.
fn reserved(bars: &[Bar]) -> [usize; 7] {
    let mut reserve = [0; 7];
    for bar in bars {
        for slot in &mut reserve[bar.from..=bar.to] {
            *slot = (*slot).max(bar.lane + 1);
        }
    }
    reserve
}

/// Barras continuas de los eventos de la semana, encima de las siete celdas.
fn event_bars(
    schedule: &Schedule,
    bars: &[Bar],
    week_w: f32,
    past_week: bool,
    cx: &gpui::App,
) -> Div {
    let mut layer = div()
        .absolute()
        .top(px(31.0))
        .left(px(week_w))
        .right_0()
        .h(px(60.0));
    for &Bar {
        series,
        from,
        to,
        lane,
    } in bars
    {
        let series = &schedule.series[series];
        let special = series.kind() == crate::calendar::model::Kind::Special;
        {
            let name = if special {
                series.name.clone()
            } else {
                format!("{} · {}", series.name, series.track_short())
            };
            layer = layer.child(
                div()
                    .absolute()
                    .top(px(lane as f32 * 23.0))
                    .left(relative(from as f32 / 7.0))
                    .right(relative((6 - to) as f32 / 7.0))
                    .ml(px(6.0))
                    .mr(px(6.0))
                    .h(px(20.0))
                    .px(px(8.0))
                    .flex()
                    .items_center()
                    .rounded(px(5.0))
                    .when(past_week, |d| d.opacity(0.55))
                    .when(special, |d| d.bg(orbit::ramp(skin(cx).button, 180.0)))
                    .when(!special, |d| {
                        d.bg(acc_bg(cx))
                            .border_1()
                            .border_color(chrome::acc_line(cx))
                    })
                    .child(
                        t(
                            name,
                            11.0,
                            600,
                            if special {
                                0x00ff_ffff
                            } else {
                                chrome::acct(cx)
                            },
                            cx,
                        )
                        .whitespace_nowrap()
                        .truncate(),
                    ),
            );
        }
    }
    layer
}

/// Barritas: salidas por hora de las series, en rojo si hay tandas de evento.
fn density(facts: &DayFacts, past_day: bool, cx: &gpui::App) -> Div {
    let skin = skin(cx);
    div()
        .flex()
        .items_end()
        .gap(px(1.0))
        .h(px(20.0))
        .px(px(8.0))
        .mt_auto()
        .when(past_day, |d| d.opacity(0.55))
        .children((0..24).map(|h| {
            div()
                .flex_1()
                .h(relative(
                    (facts.per_hour[h] as f32 / DENSITY_MAX).clamp(0.1, 1.0),
                ))
                .rounded_t(px(1.0))
                .bg(if facts.event_hours[h] {
                    rgb(acc(cx)).into()
                } else {
                    orbit::alpha(skin.text3 << 8 | 0x4d)
                })
        }))
}

/// Expande las recurrencias del día una sola vez: `(a, b)` son sus dos medianoches.
fn day_facts(
    schedule: &Schedule,
    (a, b): (DateTime<Utc>, DateTime<Utc>),
    (now, alerts): (DateTime<Utc>, Option<&Alerts>),
) -> DayFacts {
    let mut facts = DayFacts::default();
    for (index, series) in schedule.series.iter().enumerate() {
        let starts = schedule.starts(series, a, b).unwrap_or_default();
        let event = !rows::is_daily(series);
        // Una tanda de madrugada (antes de las 3:00) cuenta al día anterior, igual
        // que en Eventos y Serie: las barras de evento usan esa ventana.
        if event {
            let late = Duration::hours(3);
            if !schedule
                .starts(series, a + late, b + late)
                .unwrap_or_default()
                .is_empty()
            {
                facts.event_series.push(index);
            }
        }
        for start in &starts {
            let hour = ((*start - a).num_minutes() / 60).clamp(0, 23) as usize;
            facts.per_hour[hour] += 1;
            facts.event_hours[hour] |= event;
            facts.total += 1;
        }
        // Avisos de lo que queda del día; solo la semana en curso los lleva.
        if let Some(alerts) = alerts {
            facts.alerts += starts
                .iter()
                .filter(|at| **at >= now)
                .filter(|at| alerts.cause(schedule, series, **at).is_some())
                .count();
        }
    }
    facts
}

fn month_label(month: u32) -> &'static str {
    [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
    ][month as usize - 1]
}

fn month_short(month: u32) -> &'static str {
    [
        "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
    ][month as usize - 1]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::calendar::model::timestamp;

    #[test]
    fn every_day_reserves_the_lanes_that_cross_it() {
        // Serie 0 solo el día 3 (carril 0); serie 1 solo el día 0, pero el carril 0
        // ya está ocupado hasta el 3: va al carril 1. El día 0 tiene un único evento
        // y aun así debe reservar dos carriles, o su barra pisaría la densidad.
        let day = |series: &[usize]| {
            Some(DayFacts {
                event_series: series.to_vec(),
                ..DayFacts::default()
            })
        };
        let week = [day(&[1]), None, None, day(&[0]), None, None, None];
        let bars = lanes(&week);
        let lane_of = |s: usize| bars.iter().find(|b| b.series == s).map(|b| b.lane);
        assert_eq!((lane_of(0), lane_of(1)), (Some(0), Some(1)));
        assert_eq!(reserved(&bars), [2, 0, 0, 1, 0, 0, 0]);
    }

    #[test]
    fn a_small_hours_session_extends_the_event_bar_only_to_the_night_before() {
        let schedule = Schedule::parse(include_bytes!(
            "../../../reference/fixtures/calendar-lmu-2026-10-06.json"
        ))
        .expect("horario");
        let wec = schedule
            .series
            .iter()
            .position(|s| s.id == "weekly-wec-weekly")
            .expect("serie");
        let zone = clock::Zone::Fixed(2 * 3600);
        let now = timestamp("2026-10-08T17:47:13Z").expect("fecha");
        let facts = |day: u32| {
            let day = NaiveDate::from_ymd_opt(2026, 10, day).expect("fecha");
            let (a, b) = (zone.day_start(day), zone.day_start(day + Duration::days(1)));
            day_facts(&schedule, (a, b), (now, None))
        };
        // La última tanda de WEC Weekly sale a las 01:00 del viernes 9: su barra
        // acaba el jueves 8, como en el diseño, y no «invade» el viernes.
        assert!(facts(8).event_series.contains(&wec));
        assert!(!facts(9).event_series.contains(&wec));
        // La densidad por hora sigue siendo la del día civil.
        assert!(facts(9).total > 0);
    }

    #[test]
    fn day_facts_are_expanded_once_per_revision_and_minute() {
        let day = NaiveDate::from_ymd_opt(2026, 10, 8).expect("fecha");
        let mut cache = MonthCache::default();
        let expansions = std::cell::Cell::new(0);
        let ask = |cache: &mut MonthCache, key| {
            cache
                .facts(key, day, || {
                    expansions.set(expansions.get() + 1);
                    DayFacts::default()
                })
                .total
        };
        // Un repintado por segundo dentro del mismo minuto: una sola expansión.
        for _ in 0..60 {
            ask(&mut cache, (1, 100));
        }
        assert_eq!(expansions.get(), 1);
        // Cambia el minuto o los datos: se rehace.
        ask(&mut cache, (1, 101));
        ask(&mut cache, (2, 101));
        assert_eq!(expansions.get(), 3);
    }
}
