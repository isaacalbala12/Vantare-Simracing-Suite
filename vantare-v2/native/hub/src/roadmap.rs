//! R6: tres presentaciones de la publicación pública recibida por services.
//! El contrato actual no publica fases, áreas, progreso ni fechas por hito.
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
            return Self { view };
        }
        Self {
            view: View::default(),
        }
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
        list = list.child(note(
            if section == "later" {
                "Próximamente · sin hitos publicados a largo plazo"
            } else {
                "Sin hitos publicados"
            },
            cx,
        ));
    }
    div()
        .flex_1()
        .min_w_0()
        .min_h_0()
        .flex()
        .flex_col()
        .gap(px(10.0))
        .child(orbit::section_header(title, "v-roadmap", None, cx))
        .child(list)
}
fn current(publication: Option<&Publication>, cx: &gpui::App) -> Div {
    let compact = cx.global::<orbit::Adapt>().density != orbit::adapt::Density::A;
    let mut hero = orbit::neo_accent_card(cx)
        .flex_none()
        .child(orbit::eyebrow("En qué estamos", cx));
    if let Some(item) = publication.and_then(|publication| items(publication, "now").next()) {
        hero = hero
            .child(orbit::caps(
                &item.title.es,
                if compact { 26.0 } else { 34.0 },
                orbit::ink(cx),
                cx,
            ))
            .when(!compact, |hero| hero.child(note(item.body.es.clone(), cx)));
    } else {
        hero = hero.child(note("Aún no hay hitos actuales publicados", cx));
    }
    hero
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
        self.ensure_roadmap(cx);
        let publication = self.roadmap_publication();
        let adapt = *cx.global::<orbit::Adapt>();
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
                cx,
            ))
            .child(note(self.roadmap_status().to_owned(), cx));
        if self.manual_roadmap.view != View::Board {
            page = page.child(current(publication, cx));
        }
        let body = if self.manual_roadmap.view == View::Season {
            orbit::neo_card(cx)
                .flex_1()
                .min_h_0()
                .child(orbit::section_header("Temporada", "v-calendar", None, cx))
                .child(note(
                    "Fechas, versiones y canales por hito · Próximamente",
                    cx,
                ))
                .when_some(publication, |card, publication| {
                    card.child(note(
                        format!("Última publicación: {}", publication.published_at),
                        cx,
                    ))
                })
                .child(lane(publication, "next", "Siguiente", cx))
        } else {
            orbit::neo_card(cx)
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
        let areas = div().child(note(
            "Áreas y porcentajes · Próximamente. La publicación actual no contiene estos datos.",
            cx,
        ));
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
                items: ["now", "next", "done"]
                    .into_iter()
                    .map(|section| Item {
                        id: section.into(),
                        section: section.into(),
                        title: localized(section),
                        body: localized("Publicación del servicio"),
                    })
                    .collect(),
            },
        }
    }
    #[test]
    fn published_lanes_preserve_content_and_done_stays_out_of_board() {
        let publication = publication();
        let board: Vec<_> = ["now", "next", "later"]
            .into_iter()
            .flat_map(|section| items(&publication, section))
            .map(|item| item.id.as_str())
            .collect();
        assert_eq!(board, vec!["now", "next"]);
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
