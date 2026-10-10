//! R6: tres presentaciones de la publicación pública recibida por services.
//! v2 incorpora áreas, etiquetas de versión y fechas previstas de `ClickUp`;
//! v1 mantiene sus estados vacíos sin inventar esos metadatos.
use crate::services::protocol::roadmap_document::{Item, Publication};
use crate::{orbit, services::view::Remote};
use gpui::{Context, Div, Stateful, div, prelude::*, px};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
enum View {
    #[default]
    Circuit,
    Board,
    Season,
}

pub(crate) struct State {
    view: View,
    capture_publication: Option<Publication>,
}
impl State {
    pub(crate) fn load() -> Self {
        #[cfg(feature = "parity-capture")]
        if std::env::args().any(|argument| argument == "--capture") {
            let view = match std::env::var("VANTARE_CAPTURE_ROADMAP_VIEW").as_deref() {
                Ok("b") => View::Board,
                Ok("c") => View::Season,
                _ => View::Circuit,
            };
            let capture_publication = std::env::args()
                .collect::<Vec<_>>()
                .windows(2)
                .any(|pair| pair[0] == "--capture" && pair[1] == "roadmap-clickup-prueba")
                .then(|| {
                    serde_json::from_str(include_str!(
                        "../reference/fixtures/roadmap-clickup-v2-test.json"
                    ))
                    .expect("fixture ClickUp explícita")
                });
            return Self {
                view,
                capture_publication,
            };
        }
        Self {
            view: View::default(),
            capture_publication: None,
        }
    }
    pub(crate) fn publication<'a>(
        &'a self,
        actual: Option<&'a Publication>,
    ) -> Option<&'a Publication> {
        self.capture_publication.as_ref().or(actual)
    }
    pub(crate) fn is_capture(&self) -> bool {
        self.capture_publication.is_some()
    }
}

fn items<'a>(publication: &'a Publication, section: &'a str) -> impl Iterator<Item = &'a Item> {
    publication
        .document
        .items
        .iter()
        .filter(move |item| item.section == section)
}
fn note(value: impl Into<gpui::SharedString>, cx: &gpui::App) -> Div {
    orbit::text(value, 12.0, 400, orbit::ink_3(cx), cx)
}
fn item_card(item: &Item, cx: &gpui::App) -> Div {
    orbit::neo_card(cx)
        .flex_none()
        .min_w_0()
        .p(px(12.0))
        .gap(px(8.0))
        .child(orbit::text(
            item.title.es.clone(),
            15.0,
            600,
            orbit::ink(cx),
            cx,
        ))
        .child(note(item.body.es.clone(), cx))
        .child(note(
            format!(
                "{} · {}",
                item.version.as_deref().unwrap_or("Sin versión"),
                item.due_date.as_deref().unwrap_or("Sin fecha")
            ),
            cx,
        ))
}
fn lane(
    publication: Option<&Publication>,
    section: &'static str,
    title: &'static str,
    cx: &gpui::App,
) -> Div {
    let mut list = div()
        .id(format!("roadmap-{section}"))
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .gap(px(10.0));
    if let Some(publication) = publication {
        for item in items(publication, section) {
            list = list.child(item_card(item, cx));
        }
    }
    if publication.is_none_or(|publication| items(publication, section).next().is_none()) {
        list = list.child(note("Sin hitos publicados", cx));
    }
    orbit::neo_card(cx)
        .flex_1()
        .min_w_0()
        .min_h_0()
        .p(px(14.0))
        .gap(px(10.0))
        .child(orbit::section_header(title, "v-roadmap", None, cx))
        .child(list)
}
fn current(publication: Option<&Publication>, adapt: orbit::Adapt, cx: &gpui::App) -> Div {
    let compact = adapt.density != orbit::adapt::Density::A;
    let mut hero = orbit::hero_surface(cx)
        .flex_none()
        .child(orbit::eyebrow("En qué estamos", cx));
    if let Some(item) = publication.and_then(|publication| items(publication, "now").next()) {
        hero = hero
            .child(
                orbit::text(
                    item.title.es.clone(),
                    if compact { 26.0 } else { 34.0 },
                    600,
                    orbit::ink(cx),
                    cx,
                )
                .font_family(cx.global::<orbit::design::Tokens>().fonts.display.clone())
                .w_full()
                .min_w_0()
                .line_clamp(2)
                .id("roadmap-current-title")
                .role(gpui::Role::Label)
                .aria_label(item.title.es.clone())
                .tooltip({
                    let title = item.title.es.clone();
                    move |_, cx| cx.new(|_| orbit::Tooltip(title.clone())).into()
                }),
            )
            .when(!compact, |hero| hero.child(note(item.body.es.clone(), cx)));
    } else {
        hero = hero.child(note("Aún no hay hitos actuales publicados", cx));
    }
    hero.child(
        div()
            .flex()
            .items_center()
            .gap(px(12.0))
            .pt(px(12.0))
            .children(
                [
                    ("done", "Entregado"),
                    ("now", "Ahora"),
                    ("next", "Siguiente"),
                    ("later", "Más adelante"),
                ]
                .map(|(section, label)| {
                    div()
                        .flex_1()
                        .min_w_0()
                        .flex()
                        .flex_col()
                        .gap(px(8.0))
                        .child(
                            div()
                                .h(px(2.0))
                                .w_full()
                                .bg(orbit::alpha(orbit::skin(cx).line3)),
                        )
                        .child(orbit::meta(label, 11.0, orbit::skin(cx).text2, cx))
                        .child(note(
                            publication.map_or_else(
                                || "—".into(),
                                |p| format!("{} tareas", items(p, section).count()),
                            ),
                            cx,
                        ))
                }),
            ),
    )
}
fn version_calendar(publication: Option<&Publication>, cx: &gpui::App) -> Div {
    let mut list = div()
        .id("roadmap-versions")
        .flex_1()
        .min_h_0()
        .overflow_y_scroll()
        .flex()
        .flex_col()
        .gap(px(10.0));
    let mut scheduled: Vec<_> = publication
        .into_iter()
        .flat_map(|p| &p.document.items)
        .filter(|item| item.version.is_some() || item.due_date.is_some())
        .collect();
    scheduled.sort_by_key(|item| {
        (
            item.due_date.is_none(),
            item.due_date.as_deref(),
            item.version.as_deref(),
        )
    });
    if scheduled.is_empty() {
        list = list.child(note("Sin versiones o fechas previstas publicadas", cx));
    }
    for item in scheduled {
        list = list.child(item_card(item, cx));
    }
    div().flex().flex_col().flex_1().min_h_0().child(list)
}
impl Remote {
    pub(crate) fn roadmap_tabs(&self, cx: &mut Context<Self>) -> Div {
        div().flex().h_full().gap(px(18.0)).children(
            [
                (View::Circuit, "Circuito", "roadmap-circuit"),
                (View::Board, "Tablero", "roadmap-board"),
                (View::Season, "Temporada", "roadmap-season"),
            ]
            .map(|(view, label, id)| {
                orbit::topbar_tab(id, label, self.manual_roadmap.view == view, cx).on_click(
                    cx.listener(move |this, _, _, cx| {
                        this.manual_roadmap.view = view;
                        cx.notify();
                    }),
                )
            }),
        )
    }
    pub fn roadmap(&mut self, _window: &gpui::Window, cx: &mut Context<Self>) -> Stateful<Div> {
        if !self.manual_roadmap.is_capture() {
            self.ensure_roadmap(cx);
        }
        let publication = self.roadmap_publication();
        let adapt = self.adapt;
        let mut page = div()
            .id("roadmap")
            .size_full()
            .min_h_0()
            .min_w_0()
            .flex()
            .flex_col()
            .gap(px(adapt.gap()))
            .child(orbit::neo_page_header(
                "Roadmap",
                "Qué hay, qué viene y en qué estamos",
                adapt,
                cx,
            ))
            .child(note(
                if self.manual_roadmap.is_capture() {
                    "QA · ejemplo ClickUp, sin publicación remota".to_owned()
                } else {
                    self.roadmap_status().to_owned()
                },
                cx,
            ));
        if self.manual_roadmap.view != View::Board {
            page = page.child(current(publication, adapt, cx));
        }
        let body = if self.manual_roadmap.view == View::Season {
            orbit::neo_card(cx)
                .flex_1()
                .min_h_0()
                .child(orbit::section_header("Temporada", "v-calendar", None, cx))
                .child(note(
                    "Calendario de versiones · fechas previstas de ClickUp, sin garantía de release",
                    cx,
                ))
                .when_some(publication, |card, publication| {
                    card.child(note(
                        format!("Última publicación: {}", publication.published_at),
                        cx,
                    ))
                })
                .child(version_calendar(publication, cx))
        } else {
            div()
                .flex()
                .flex_col()
                .gap(px(adapt.gap()))
                .flex_1()
                .min_h_0()
                .child(orbit::section_header("Qué viene", "v-roadmap", None, cx))
                .child(
                    div()
                        .flex_1()
                        .min_h_0()
                        .flex()
                        .gap(px(adapt.gap()))
                        .child(lane(publication, "now", "Ahora", cx))
                        .child(lane(publication, "next", "Siguiente", cx))
                        .child(lane(publication, "later", "Más adelante", cx)),
                )
        };
        page.child(body)
    }
    pub(crate) fn roadmap_rail(&self, cx: &mut Context<Self>) -> Vec<orbit::RailSection> {
        let mut areas = div().flex().flex_col().gap(px(10.0));
        if let Some(publication) = self.roadmap_publication() {
            let mut groups = std::collections::BTreeMap::<&str, (u16, u16)>::new();
            for item in &publication.document.items {
                let counts = groups
                    .entry(item.area.as_deref().unwrap_or("Sin área"))
                    .or_default();
                counts.1 += 1;
                counts.0 += u16::from(item.section == "done");
            }
            for (area, (done, total)) in groups {
                areas = areas
                    .child(note(
                        format!(
                            "{area} · {done}/{total} tareas completadas · {}%",
                            done * 100 / total
                        ),
                        cx,
                    ))
                    .child(
                        div()
                            .h(px(4.0))
                            .w_full()
                            .bg(orbit::alpha(orbit::skin(cx).line3))
                            .child(
                                div()
                                    .h_full()
                                    .w(gpui::relative(f32::from(done) / f32::from(total)))
                                    .bg(gpui::rgb(orbit::carmine(cx))),
                            ),
                    );
            }
        }
        if self
            .roadmap_publication()
            .is_none_or(|p| p.document.items.is_empty())
        {
            areas = areas.child(note("Sin datos de progreso publicados", cx));
        }
        let mut delivered = div()
            .id("roadmap-delivered")
            .flex_1()
            .min_h_0()
            .overflow_y_scroll()
            .flex()
            .flex_col()
            .gap(px(10.0));
        if let Some(publication) = self.roadmap_publication() {
            for item in items(publication, "done") {
                delivered = delivered.child(item_card(item, cx));
            }
        }
        if self
            .roadmap_publication()
            .is_none_or(|publication| items(publication, "done").next().is_none())
        {
            delivered = delivered.child(note("Sin entregas publicadas", cx));
        }
        vec![
            orbit::RailSection::new("Por áreas", "layers", areas),
            orbit::RailSection::new("Recién entregado", "check", delivered).grow(),
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::protocol::roadmap_document::{Document, Localized};
    fn publication() -> Publication {
        let localized = |text: &str| Localized {
            es: text.into(),
            en: text.into(),
            pt: text.into(),
            it: text.into(),
        };
        Publication {
            id: "publicada".into(),
            published_at: "2026-10-08T10:00:00Z".into(),
            document: Document {
                schema_version: 1,
                items: ["now", "next", "later", "done"]
                    .into_iter()
                    .map(|section| Item {
                        id: section.into(),
                        section: section.into(),
                        area: None,
                        version: None,
                        due_date: None,
                        title: localized(section),
                        body: localized("Publicación del servicio"),
                    })
                    .collect(),
            },
        }
    }
    #[test]
    fn published_lanes_preserve_content_in_all_four_sections() {
        let publication = publication();
        let board: Vec<_> = ["now", "next", "later", "done"]
            .into_iter()
            .flat_map(|section| items(&publication, section))
            .map(|item| item.id.as_str())
            .collect();
        assert_eq!(board, vec!["now", "next", "later", "done"]);
        assert_eq!(
            items(&publication, "done")
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>(),
            vec!["done"]
        );
        assert_eq!(
            items(&publication, "now")
                .next()
                .expect("publicado")
                .body
                .es,
            "Publicación del servicio"
        );
    }
    #[test]
    fn empty_publication_remains_empty_without_local_fallback() {
        let mut publication = publication();
        publication.document.items.clear();
        for section in ["now", "next", "later", "done"] {
            assert_eq!(items(&publication, section).count(), 0);
        }
    }
}
