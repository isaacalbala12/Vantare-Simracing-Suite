//! Ficha de una salida: cajón lateral con fases, reglas y acciones.
use super::super::{
    Calendar,
    chrome::{
        self, Tone, acc, acct, btn, btn_pri, class_chip, disp, ib, icon, kv, mono, pill, rule,
        section_title, t, tier,
    },
    clock::duration_txt,
    rows,
};
use super::Ficha;
use crate::orbit;
use chrono::{DateTime, Duration, Utc};
use gpui::{Context, IntoElement, div, prelude::*, px, rgb};

pub(super) fn render(
    cal: &mut Calendar,
    ficha: &Ficha,
    cx: &mut Context<Calendar>,
) -> impl IntoElement {
    let skin = chrome::skin(cx);
    let (now, zone) = (cal.now(), cal.zone());
    let Some(schedule) = cal.schedule().cloned() else {
        return div().into_any_element();
    };
    let Some(series) = schedule.by_id(&ficha.id).cloned() else {
        return div().into_any_element();
    };
    let (_, until) = schedule.window().unwrap_or((now, now));
    let upcoming: Vec<DateTime<Utc>> = schedule
        .starts(&series, now, until.min(now + Duration::days(2)))
        .unwrap_or_default()
        .into_iter()
        .take(8)
        .collect();
    let at = ficha.at.or_else(|| upcoming.first().copied());
    let fav = rows::is_fav(cal.favorites(), &series);
    let daily = rows::is_daily(&series);
    let id = series.id.clone();

    let mut picks = div().flex().flex_wrap().gap(px(6.0));
    for (index, start) in upcoming.iter().enumerate() {
        let (sid, start) = (id.clone(), *start);
        picks = picks.child(
            chrome::seg_button(
                ("calendar-ficha-pick", index),
                &zone.hm(start),
                Some(start) == at,
                cx,
            )
            .on_click(
                cx.listener(move |this, _, _, cx| this.open_ficha(sid.clone(), Some(start), cx)),
            ),
        );
    }

    let phases = series.phases();
    let total: u32 = phases.iter().map(|p| p.0).sum::<u32>().max(1);
    let names = ["Práctica", "Clasificación", "Carrera"];
    let mut bar = div().flex().gap(px(3.0)).h(px(26.0));
    let mut marks = div().flex().gap(px(3.0));
    let mut cursor = at;
    for (index, (minutes, estimated)) in phases.iter().enumerate() {
        let weight = *minutes as f32 / total as f32;
        bar = bar.child(
            div()
                .w(gpui::relative(weight))
                .min_w(px(40.0))
                .rounded(px(5.0))
                .flex()
                .items_center()
                .justify_center()
                .bg(rgb(if index == 2 { acc(cx) } else { skin.l3 }))
                .child(t(
                    format!(
                        "{}{}",
                        duration_txt(*minutes),
                        if *estimated { "~" } else { "" }
                    ),
                    11.0,
                    600,
                    if index == 2 { 0x00ff_ffff } else { skin.text2 },
                    cx,
                )),
        );
        marks = marks.child(
            div()
                .w(gpui::relative(weight))
                .min_w(px(40.0))
                .child(t(names[index], 10.5, 400, skin.cap, cx))
                .child(mono(
                    cursor.map_or("—".to_owned(), |c| zone.hm(c)),
                    11.0,
                    skin.text2,
                    cx,
                )),
        );
        cursor = cursor.map(|c| c + Duration::minutes(i64::from(*minutes)));
    }

    let alert_row = if daily {
        let band = cal.alerts.band(&series.id).cloned();
        div()
            .flex()
            .items_center()
            .gap(px(10.0))
            .child(icon(
                "bell-fill",
                15.0,
                if band.is_some() { acct(cx) } else { skin.text3 },
            ))
            .child(
                t(
                    band.as_ref()
                        .map_or("Sin aviso para esta serie".to_owned(), |b| {
                            format!(
                                "Franja {}–{}",
                                super::avisos::minutes_txt(b.from),
                                super::avisos::minutes_txt(b.to)
                            )
                        }),
                    13.0,
                    500,
                    skin.text1,
                    cx,
                )
                .flex_1(),
            )
            .child(
                btn("calendar-ficha-band", "Editar avisos", true, cx).on_click(
                    cx.listener(|this, _, _, cx| this.open_modal(super::Modal::Avisos, cx)),
                ),
            )
    } else {
        let on = at.is_some_and(|a| cal.alerts.slot_at(&series.id, a));
        let (sid, slot) = (id.clone(), at);
        div()
            .flex()
            .items_center()
            .gap(px(10.0))
            .child(icon(
                "bell-fill",
                15.0,
                if on { acct(cx) } else { skin.text3 },
            ))
            .child(
                t(
                    if on {
                        "Te avisaremos de esta tanda"
                    } else {
                        "Sin aviso en esta tanda"
                    },
                    13.0,
                    500,
                    skin.text1,
                    cx,
                )
                .flex_1(),
            )
            .child(
                btn(
                    "calendar-ficha-slot",
                    if on { "Quitar aviso" } else { "Avisarme" },
                    true,
                    cx,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    if let Some(slot) = slot {
                        this.toggle_slot_alert(&sid, slot, cx);
                    }
                })),
            )
    };

    let (fid, sid2, lid) = (id.clone(), id.clone(), id.clone());
    let launch_at = at.map(|a| a - Duration::minutes(3));
    let body = div()
        .id("calendar-ficha-body")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .gap(px(14.0))
        .p(px(18.0))
        .child(
            div()
                .flex()
                .items_center()
                .gap(px(8.0))
                .child(tier(&series, cx))
                .when(series.is_fallback(), |r| r.child(chrome::rc_tag(cx)))
                .children(series.class_chips().iter().map(|c| class_chip(c, cx)))
                .child(div().flex_1())
                .child(
                    ib("calendar-ficha-fav", "star", "Favorita", true, fav, cx)
                        .on_click(cx.listener(move |this, _, _, cx| this.toggle_fav(&fid, cx))),
                ),
        )
        .child(
            div()
                .child(chrome::cap("Circuito", skin.cap, cx))
                .child(disp(series.track.clone(), 22.0, skin.text1, cx)),
        )
        .child(section_title(
            "Elige salida",
            at.map(|a| zone.day_rel(a, now)),
            cx,
        ))
        .child(picks)
        .child(section_title("Fases", None, cx))
        .child(bar)
        .child(marks)
        .child(rule(cx))
        .child(alert_row)
        .child(rule(cx))
        .child(section_title("Reglas", None, cx))
        .child(
            div()
                .grid()
                .grid_cols(2)
                .gap_x(px(16.0))
                .gap_y(px(8.0))
                .child(kv("Licencia", series.license_label.clone(), cx))
                .child(kv("Safety Rating", or_dash(&series.safety_rating), cx))
                .child(kv("Reglaje", or_dash(&series.setup), cx))
                .child(kv("Ayudas", or_dash(&series.assists), cx))
                .child(kv(
                    "Neumáticos",
                    series.tyres.map_or("—".into(), |n| n.to_string()),
                    cx,
                ))
                .child(kv(
                    "Calentadores",
                    if series.tyre_warmers { "Sí" } else { "No" },
                    cx,
                ))
                .child(kv("Formato", or_dash(&series.format), cx))
                .child(kv(
                    "Divisiones",
                    series.splits.map_or("—".into(), |n| n.to_string()),
                    cx,
                )),
        )
        .children(
            series
                .notes
                .iter()
                .map(|note| t(note.clone(), 12.0, 400, skin.text3, cx)),
        )
        .when(series.is_fallback(), |b| {
            b.child(
                pill(
                    "Dato de RaceControl hasta que LMU lo publique",
                    Tone::Warn,
                    cx,
                )
                .self_start(),
            )
        });
    let footer = div()
        .flex_none()
        .flex()
        .items_center()
        .gap(px(8.0))
        .p(px(14.0))
        .border_t_1()
        .border_color(orbit::alpha(skin.line1))
        .child(
            btn("calendar-ficha-serie", "Ver serie", false, cx)
                .on_click(cx.listener(move |this, _, _, cx| this.open_serie(sid2.clone(), cx))),
        )
        .child(div().flex_1())
        .when_some(launch_at.filter(|l| *l > now), |f, launch| {
            f.child(
                btn(
                    "calendar-ficha-schedule",
                    &format!("Lanzar a las {}", zone.hm(launch)),
                    false,
                    cx,
                )
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.arm_launch(&lid, launch, cx);
                })),
            )
        })
        .child(
            btn_pri("calendar-ficha-launch", "Lanzar ahora", false, cx)
                .on_click(cx.listener(|this, _, _, cx| this.launch_profile(cx))),
        );
    chrome::window_layer(
        cal.ui.viewport,
        div()
            .id("calendar-ficha")
            .flex()
            .justify_end()
            .bg(chrome::tint(0x0000_0000, 0.4))
            .occlude()
            .on_click(cx.listener(|this, _, _, cx| {
                this.escape(cx);
            }))
            .child(
                chrome::card(cx)
                    .id("calendar-ficha-panel")
                    .w(px(440.0))
                    .h_full()
                    .rounded_r_none()
                    .on_click(|_, _, cx| cx.stop_propagation())
                    .child(
                        div()
                            .flex_none()
                            .flex()
                            .items_center()
                            .px(px(18.0))
                            .py(px(14.0))
                            .child(
                                disp(series.name.clone(), 22.0, skin.text1, cx)
                                    .flex_1()
                                    .truncate(),
                            )
                            .child(
                                ib(
                                    "calendar-ficha-close",
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
                    .child(body)
                    .child(footer),
            ),
    )
    .into_any_element()
}

fn or_dash(value: &str) -> String {
    if value.is_empty() {
        "—".into()
    } else {
        value.to_owned()
    }
}
