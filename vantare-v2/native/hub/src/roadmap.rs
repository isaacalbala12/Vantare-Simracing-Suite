//! Roadmap editorial local: mismo vocabulario schemaVersion/items del servicio.
use crate::{orbit, services::view::Remote};
use gpui::{Context, Div, Stateful, div, prelude::*, px};
use serde::Deserialize;
use std::collections::BTreeSet;
use vantare_services::protocol::roadmap_document::Localized;

fn readable_date(value: &str) -> String {
    use chrono::Datelike;
    let Ok(date) = chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d") else {
        return value.to_owned();
    };
    let month = [
        "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
    ][date.month0() as usize];
    format!("{} {month} {}", date.day(), date.year())
}

const DATA: &str = include_str!("../roadmap/roadmap.json");

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Document {
    schema_version: u32,
    updated_at: String,
    current_phase: String,
    phases: Vec<Phase>,
    areas: Vec<Area>,
    items: Vec<Item>,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Phase {
    id: String,
    title: String,
    body: String,
    progress: u8,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Area {
    id: String,
    title: String,
    progress: u8,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct Item {
    id: String,
    section: String,
    title: Localized,
    body: Localized,
    area: String,
    progress: Option<u8>,
    date: Option<String>,
}
impl Document {
    pub fn parse(json: &str) -> Result<Self, String> {
        if json.len() > 128 * 1024 {
            return Err("Roadmap supera 128 KiB".into());
        }
        let document: Self =
            serde_json::from_str(json).map_err(|error| format!("Roadmap inválido: {error}"))?;
        let valid_text = |value: &str| !value.trim().is_empty() && value.len() <= 800;
        let valid_date = |value: &str| {
            chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
                .is_ok_and(|date| date.to_string() == value)
        };
        let unique = |ids: Vec<&str>| {
            ids.iter().all(|id| valid_text(id))
                && ids.iter().copied().collect::<BTreeSet<_>>().len() == ids.len()
        };
        if document.schema_version != 1
            || !valid_date(&document.updated_at)
            || document.phases.is_empty()
            || document.phases.len() > 8
            || document.areas.is_empty()
            || document.areas.len() > 12
            || document.items.len() > 100
            || !unique(
                document
                    .phases
                    .iter()
                    .map(|phase| phase.id.as_str())
                    .collect(),
            )
            || !unique(document.areas.iter().map(|area| area.id.as_str()).collect())
            || !unique(document.items.iter().map(|item| item.id.as_str()).collect())
            || !document
                .phases
                .iter()
                .any(|phase| phase.id == document.current_phase)
            || document.phases.iter().any(|phase| {
                phase.progress > 100 || !valid_text(&phase.title) || !valid_text(&phase.body)
            })
            || document
                .areas
                .iter()
                .any(|area| area.progress > 100 || !valid_text(&area.title))
            || document.items.iter().any(|item| {
                !matches!(item.section.as_str(), "now" | "next" | "later" | "done")
                    || !document.areas.iter().any(|area| area.id == item.area)
                    || item.progress.is_some_and(|value| value > 100)
                    || [
                        &item.title.es,
                        &item.title.en,
                        &item.title.pt,
                        &item.title.it,
                        &item.body.es,
                        &item.body.en,
                        &item.body.pt,
                        &item.body.it,
                    ]
                    .iter()
                    .any(|value| !valid_text(value))
                    || (item.section == "done" && item.date.is_none())
                    || item.date.as_ref().is_some_and(|date| !valid_date(date))
            })
        {
            return Err(
                "Roadmap: versión, identidad, fecha, progreso o referencia inválidos".into(),
            );
        }
        Ok(document)
    }
    fn items(&self, section: &str, area: Option<&str>) -> impl Iterator<Item = &Item> {
        self.items.iter().filter(move |item| {
            item.section == section && area.is_none_or(|area| item.area == area)
        })
    }
}
pub(crate) struct State {
    document: Result<Document, String>,
    area: Option<String>,
    published: bool,
}
impl State {
    pub(crate) fn load() -> Self {
        Self {
            document: Document::parse(DATA),
            area: None,
            published: false,
        }
    }
}
fn label(text: impl Into<gpui::SharedString>, cx: &gpui::App) -> Div {
    orbit::text(text, 13.0, 400, orbit::ink_3(cx), cx)
}
fn item_card(item: &Item, compact: bool, cx: &gpui::App) -> Div {
    orbit::neo_card(cx)
        .p(px(14.0))
        .gap(px(8.0))
        .flex_none()
        .child(orbit::text(
            item.title.es.clone(),
            15.0,
            600,
            orbit::ink(cx),
            cx,
        ))
        .when(!compact, |card| card.child(label(item.body.es.clone(), cx)))
        .when_some(item.progress, |card, progress| {
            card.child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(10.0))
                    .child(
                        div()
                            .flex_1()
                            .child(orbit::progress(f32::from(progress) / 100.0, cx)),
                    )
                    .child(label(format!("{progress} %"), cx)),
            )
        })
}
impl Remote {
    #[allow(clippy::too_many_lines)] // Composición de cuatro tarjetas con el kit compartido.
    pub fn roadmap(&mut self, window: &gpui::Window, cx: &mut Context<Self>) -> Stateful<Div> {
        let compact = f32::from(window.viewport_size().width) < 1700.0;
        let toggle = orbit::ghost_button(
            "roadmap-source",
            if self.manual_roadmap.published {
                "Volver al roadmap"
            } else {
                "Ver publicación"
            },
            cx,
        )
        .on_click(cx.listener(|this, _, _, cx| {
            this.manual_roadmap.published = !this.manual_roadmap.published;
            cx.notify();
        }));
        if self.manual_roadmap.published {
            return div()
                .id("roadmap-publication")
                .size_full()
                .flex()
                .flex_col()
                .min_h_0()
                .gap(px(12.0))
                .child(toggle)
                .child(
                    div()
                        .id("roadmap-publication-scroll")
                        .flex_1()
                        .min_h_0()
                        .overflow_y_scroll()
                        // La vista anterior restaba la cabecera Wails; este shell ya la retiró.
                        .child(
                            self.published_roadmap(cx)
                                .mt(px(0.0))
                                .min_h(px(0.0))
                                .flex_none(),
                        ),
                );
        }
        let header = div()
            .flex()
            .items_center()
            .justify_between()
            .child(
                div()
                    .flex()
                    .flex_col()
                    .gap(px(4.0))
                    .child(orbit::text("Roadmap", 30.0, 600, orbit::ink(cx), cx))
                    .child(label("Qué hay, qué viene y en qué estamos.", cx)),
            )
            .child(
                div()
                    .flex()
                    .items_center()
                    .gap(px(12.0))
                    .when_some(
                        self.manual_roadmap.document.as_ref().ok(),
                        |row, document| {
                            row.child(label(
                                format!("Actualizado {}", readable_date(&document.updated_at)),
                                cx,
                            ))
                        },
                    )
                    .child(toggle),
            );
        let document = match &self.manual_roadmap.document {
            Ok(document) => document,
            Err(error) => {
                return div()
                    .id("roadmap-error")
                    .child(header)
                    .child(orbit::callout(error.clone(), cx));
            }
        };
        let gap = cx.global::<orbit::design::Tokens>().geometry.gap;
        let phase = document
            .phases
            .iter()
            .find(|phase| phase.id == document.current_phase);
        let mut current = orbit::neo_card(cx)
            .flex_none()
            .bg(gpui::linear_gradient(
                120.0,
                gpui::linear_color_stop(orbit::tint(orbit::carmine(cx), 0.12), 0.0),
                gpui::linear_color_stop(gpui::rgb(orbit::surface_1(cx)), 1.0),
            ))
            .gap(px(16.0))
            .child(orbit::neo_header("En qué estamos", "v-roadmap", cx));
        if let Some(phase) = phase {
            current = current
                .child(
                    div()
                        .flex()
                        .items_center()
                        .justify_between()
                        .child(
                            div()
                                .flex_1()
                                .min_w_0()
                                .flex()
                                .flex_col()
                                .gap(px(8.0))
                                .child(
                                    orbit::text(phase.title.clone(), 32.0, 600, orbit::ink(cx), cx)
                                        .font_family(
                                            cx.global::<orbit::design::Tokens>()
                                                .fonts
                                                .display
                                                .clone(),
                                        ),
                                )
                                .when(!compact, |card| card.child(label(phase.body.clone(), cx))),
                        )
                        .child(orbit::text(
                            format!("{} %", phase.progress),
                            44.0,
                            600,
                            orbit::ink(cx),
                            cx,
                        )),
                )
                .child(orbit::progress(f32::from(phase.progress) / 100.0, cx));
        }
        current = current.child(div().flex().gap(px(16.0)).children(
            document.phases.iter().enumerate().map(|(index, phase)| {
                div()
                    .flex_1()
                    .min_w_0()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .child(
                        div()
                            .flex()
                            .items_center()
                            .gap(px(8.0))
                            .child(
                                div()
                                    .size(px(32.0))
                                    .flex_none()
                                    .rounded_full()
                                    .flex()
                                    .items_center()
                                    .justify_center()
                                    .bg(gpui::rgb(if phase.id == document.current_phase {
                                        orbit::carmine(cx)
                                    } else {
                                        orbit::surface_3(cx)
                                    }))
                                    .child(orbit::text(
                                        if phase.progress == 100 {
                                            "✓".into()
                                        } else {
                                            (index + 1).to_string()
                                        },
                                        14.0,
                                        600,
                                        if phase.progress == 100 {
                                            orbit::green(cx)
                                        } else {
                                            orbit::ink(cx)
                                        },
                                        cx,
                                    )),
                            )
                            .when(index + 1 < document.phases.len(), |row| {
                                row.child(
                                    div()
                                        .h(px(2.0))
                                        .flex_1()
                                        .bg(gpui::rgb(orbit::surface_3(cx))),
                                )
                            }),
                    )
                    .child(orbit::text(
                        phase.title.clone(),
                        14.0,
                        600,
                        orbit::ink(cx),
                        cx,
                    ))
                    .when(!compact, |card| card.child(label(phase.body.clone(), cx)))
                    .child(
                        orbit::pill(
                            if phase.progress == 100 {
                                "Hecha"
                            } else if phase.id == document.current_phase {
                                "En curso"
                            } else {
                                "Planificada"
                            },
                            if phase.progress == 100 {
                                orbit::Tone::Success
                            } else if phase.id == document.current_phase {
                                orbit::Tone::Accent
                            } else {
                                orbit::Tone::Neutral
                            },
                            cx,
                        )
                        .self_start(),
                    )
            }),
        ));
        let area = self.manual_roadmap.area.as_deref();
        let mut filters = div().flex().flex_wrap().gap(px(4.0));
        for (id, title) in std::iter::once((None, "Todo")).chain(
            document
                .areas
                .iter()
                .map(|area| (Some(area.id.clone()), area.title.as_str())),
        ) {
            let selected = id.as_deref() == area;
            filters = filters.child(
                orbit::button(
                    format!("roadmap-filter-{}", id.as_deref().unwrap_or("all")),
                    title,
                    cx,
                )
                .aria_label(format!("Filtrar {title}"))
                .when(selected, |button| {
                    button.bg(gpui::rgb(orbit::surface_3(cx)))
                })
                .on_click(cx.listener(move |this, _, _, cx| {
                    this.manual_roadmap.area.clone_from(&id);
                    cx.notify();
                })),
            );
        }
        let columns = div().flex_1().min_h_0().flex().gap(px(12.0)).children(
            [
                ("now", "Ahora"),
                ("next", "Siguiente"),
                ("later", "Más adelante"),
            ]
            .map(|(section, title)| {
                div()
                    .flex_1()
                    .min_w_0()
                    .min_h_0()
                    .flex()
                    .flex_col()
                    .gap(px(10.0))
                    .child(orbit::text(
                        format!("{title} · {}", document.items(section, area).count()),
                        15.0,
                        600,
                        orbit::ink(cx),
                        cx,
                    ))
                    .child(
                        div()
                            .id(format!("roadmap-{section}"))
                            .flex_1()
                            .min_h_0()
                            .overflow_y_scroll()
                            .flex()
                            .flex_col()
                            .gap(px(10.0))
                            .when(document.items(section, area).next().is_none(), |list| {
                                list.child(label("Sin hitos en este filtro", cx))
                            })
                            .children(
                                document
                                    .items(section, area)
                                    .map(|item| item_card(item, compact, cx)),
                            ),
                    )
            }),
        );
        let upcoming = orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .gap(px(16.0))
            .child(
                div()
                    .flex()
                    .flex_wrap()
                    .items_center()
                    .justify_between()
                    .gap(px(8.0))
                    .child(orbit::neo_header("Qué viene", "v-roadmap", cx))
                    .child(filters),
            )
            .child(columns);
        let areas = orbit::neo_card(cx)
            .flex_none()
            .gap(px(16.0))
            .child(orbit::neo_header("Por áreas", "layers", cx))
            .children(document.areas.iter().map(|area| {
                div()
                    .flex()
                    .flex_col()
                    .gap(px(8.0))
                    .child(
                        div()
                            .flex()
                            .justify_between()
                            .child(orbit::text(
                                area.title.clone(),
                                14.0,
                                600,
                                orbit::ink(cx),
                                cx,
                            ))
                            .child(label(format!("{} %", area.progress), cx)),
                    )
                    .child(orbit::progress(f32::from(area.progress) / 100.0, cx))
            }));
        let mut delivered: Vec<_> = document.items("done", None).collect();
        delivered.sort_by(|a, b| b.date.cmp(&a.date));
        let delivered = orbit::neo_card(cx)
            .flex_1()
            .min_h_0()
            .gap(px(12.0))
            .child(orbit::neo_header("Recién entregado", "check", cx))
            .child(
                div()
                    .id("roadmap-delivered")
                    .flex_1()
                    .min_h_0()
                    .overflow_y_scroll()
                    .flex()
                    .flex_col()
                    .gap(px(10.0))
                    .children(delivered.iter().map(|item| {
                        div()
                            .flex()
                            .flex_col()
                            .gap(px(4.0))
                            .py(px(10.0))
                            .child(label(
                                item.date.as_deref().map(readable_date).unwrap_or_default(),
                                cx,
                            ))
                            .child(orbit::text(
                                item.title.es.clone(),
                                14.0,
                                600,
                                orbit::ink(cx),
                                cx,
                            ))
                            .child(label(item.body.es.clone(), cx))
                    })),
            );
        div()
            .id("roadmap")
            .size_full()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(gap))
            .child(header)
            .child(
                div()
                    .flex_1()
                    .min_h_0()
                    .flex()
                    .gap(px(gap))
                    .child(
                        div()
                            .flex_grow(2.0)
                            .flex_basis(gpui::relative(2.0 / 3.0))
                            .min_w_0()
                            .min_h_0()
                            .flex()
                            .flex_col()
                            .gap(px(gap))
                            .child(current)
                            .child(upcoming),
                    )
                    .child(
                        div()
                            .flex_grow(1.0)
                            .flex_basis(gpui::relative(1.0 / 3.0))
                            .min_w_0()
                            .min_h_0()
                            .flex()
                            .flex_col()
                            .gap(px(gap))
                            .child(areas)
                            .child(delivered),
                    ),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn dates_use_readable_spanish_months_and_keep_the_year() {
        assert_eq!(readable_date("2026-10-05"), "5 oct 2026");
        assert_eq!(readable_date("2027-01-01"), "1 ene 2027");
        assert_eq!(readable_date("2024-02-29"), "29 feb 2024");
    }
    #[test]
    fn manual_document_is_valid_and_filters_preserve_lanes() {
        let document = Document::parse(DATA).expect("documento versionado");
        for section in ["now", "next", "later", "done"] {
            assert!(document.items(section, None).next().is_some());
            for area in &document.areas {
                assert!(
                    document
                        .items(section, Some(&area.id))
                        .all(|item| item.area == area.id)
                );
            }
        }
        assert_eq!(document.items("now", Some("missing")).count(), 0);
    }
    #[test]
    fn malformed_editorial_data_is_rejected() {
        let original: serde_json::Value = serde_json::from_str(DATA).expect("JSON");
        for (path, replacement) in [
            ("/schemaVersion", serde_json::json!(2)),
            ("/phases/0/progress", serde_json::json!(101)),
            ("/items/0/section", serde_json::json!("unknown")),
            ("/items/0/area", serde_json::json!("unknown")),
            ("/currentPhase", serde_json::json!("missing")),
            ("/updatedAt", serde_json::json!("not a date")),
            ("/updatedAt", serde_json::json!("2026-1-5")),
            ("/items/0/title/es", serde_json::json!("")),
        ] {
            let mut value = original.clone();
            *value.pointer_mut(path).expect("campo") = replacement;
            assert!(Document::parse(&value.to_string()).is_err(), "{path}");
        }
        let mut value = original;
        value["items"][1]["id"] = value["items"][0]["id"].clone();
        assert!(Document::parse(&value.to_string()).is_err());
    }
}
