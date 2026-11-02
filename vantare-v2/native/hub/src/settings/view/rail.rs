//! Carril contextual existente, separado para conservar el presupuesto del Hub.
use super::{Action, Context, Hub, Page, Section, Tone, div, orbit, px, stack, text};
use gpui::prelude::*;

impl Hub {
    #[allow(clippy::too_many_lines)] // Composición del carril de las ocho páginas, sin lógica de negocio.
    pub(in crate::shell) fn settings_rail(
        &self,
        cx: &mut Context<Self>,
    ) -> Vec<orbit::RailSection> {
        let mut rail = Vec::new();
        let (title, icon, note) = match self.settings.page {
            Page::Account => (
                "Perfil privado",
                "v-helmet",
                "Tu perfil solo lo ves tú. Cuando lleguen los equipos podrás decidir qué compartes.",
            ),
            Page::Appearance => (
                "Estilo de los overlays",
                "v-studio",
                "Los widgets tienen su propia apariencia en Overlay Studio.",
            ),
            Page::Performance => (
                "Ahora mismo",
                "v-gauge",
                "El nivel limita la actualización de los widgets. Los cambios de estado y las banderas se aplican inmediatamente.",
            ),
            Page::Hotkeys => (
                "Atajos",
                "v-keys",
                if cfg!(windows) {
                    "Edita las combinaciones globales en cada perfil del Launcher. Un conflicto de Windows se muestra como error de registro."
                } else {
                    "Los atajos del Hub funcionan con su ventana activa; los de Studio, con el lienzo activo."
                },
            ),
            Page::Privacy => (
                "Qué sale de tu equipo",
                "v-shield",
                "El envío de fallos y uso anónimo depende de tu consentimiento. Los informes de Testing Center solo se envían al confirmarlos.",
            ),
            Page::Updates => (
                "Instalación",
                "v-download",
                "Consulta la versión y el canal instalados en este equipo.",
            ),
            Page::Diagnostics => (
                "Informe de diagnóstico",
                "v-monitor",
                "Prepara un informe del estado de Vantare, sin contraseñas ni datos de la carrera.",
            ),
            Page::Application => (
                "Preferencias del Hub",
                "v-gauge",
                "Los cambios se guardan en este equipo. Empezar minimizado se aplica en el siguiente arranque.",
            ),
        };
        rail.push(orbit::RailSection::new(
            title,
            icon,
            stack()
                .gap(px(12.0))
                .child(text(note, 13.0, 400, orbit::ink_2(cx), cx))
                .when(self.settings.page == Page::Performance, |card| {
                    let performance = self.studio.read(cx).performance();
                    card.child(orbit::pill(performance.level.label(), Tone::Accent, cx))
                        .child(text(
                            format!(
                                "{} {} con frecuencia propia",
                                performance.widgets.len(),
                                if performance.widgets.len() == 1 {
                                    "widget"
                                } else {
                                    "widgets"
                                }
                            ),
                            12.0,
                            400,
                            orbit::ink_2(cx),
                            cx,
                        ))
                })
                .when(self.settings.page == Page::Appearance, |card| {
                    card.child(
                        orbit::small_button("settings-open-studio", "Abrir Overlay Studio", cx)
                            .self_start()
                            .track_focus(&self.settings.custom_performance_focus)
                            .on_key_down(cx.listener(|hub, event: &gpui::KeyDownEvent, _, cx| {
                                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                    hub.navigate(Section::Studio, cx);
                                    cx.stop_propagation();
                                }
                            }))
                            .on_click(
                                cx.listener(|hub, _, _, cx| hub.navigate(Section::Studio, cx)),
                            ),
                    )
                }),
        ));
        let sections: &[(&str, &str, &str)] = match self.settings.page {
            Page::Hotkeys => &[
                (
                    "Antes de cambiar uno",
                    "v-keys",
                    "Comprueba si otra aplicación ya usa la combinación. Los atajos del Hub funcionan con su ventana activa.",
                ),
                (
                    "Prueba un atajo",
                    "v-keys",
                    "Con Vantare en primer plano, pulsa Ctrl K para abrir la búsqueda.",
                ),
            ],
            Page::Updates => &[
                (
                    "Canales",
                    "v-download",
                    "Nightly recibe cambios en pruebas. Testers recibe el conjunto validado. Estable llegará tras la beta.",
                ),
                (
                    "Si algo va mal",
                    "v-shield",
                    "Reinicia Vantare. Si el problema continúa, prepara un informe en Diagnóstico.",
                ),
            ],
            Page::Privacy => &[(
                "Lo que nunca sale",
                "v-lock",
                "Tus contraseñas y claves de acceso no se incluyen en los informes de diagnóstico.",
            )],
            Page::Diagnostics => &[
                (
                    "Tu equipo",
                    "v-monitor",
                    "El informe incluye la versión de Vantare y el estado observado en este equipo.",
                ),
                (
                    "Problemas frecuentes",
                    "v-shield",
                    "Si no llegan datos, comprueba que el simulador esté abierto y en pista. Para un fallo repetido, adjunta un informe.",
                ),
            ],
            Page::Account => &[(
                "Bandera en los widgets",
                "flag",
                "Con un país elegido, los widgets podrán mostrar su bandera junto a tu nombre.",
            )],
            Page::Performance | Page::Appearance | Page::Application => &[],
        };
        for (title, icon, note) in sections {
            rail.push(orbit::RailSection::new(
                *title,
                icon,
                text(*note, 13.0, 400, orbit::ink_2(cx), cx),
            ));
        }
        if self.settings.page == Page::Appearance {
            rail.push(orbit::RailSection::new(
                "Vista previa",
                "v-palette",
                self.settings_appearance_preview(cx),
            ));
        }
        if self.settings.page == Page::Application {
            let version = self
                .settings
                .update
                .presentation(crate::version_label(), crate::product::CHANNEL)
                .map_or("…", |(version, _)| version);
            rail.push(orbit::RailSection::new(
                "Versión",
                "v-download",
                stack()
                    .gap(px(12.0))
                    .child(text(version.to_owned(), 22.0, 700, orbit::ink(cx), cx))
                    .child(
                        orbit::small_button("settings-open-updates", "Actualizaciones", cx)
                            .self_start()
                            .on_click(cx.listener(|hub, _, _, cx| {
                                hub.select_settings_page(Page::Updates, cx);
                            })),
                    ),
            ));
            rail.push(orbit::RailSection::new(
                "Diagnóstico",
                "v-monitor",
                stack()
                    .gap(px(8.0))
                    .child(self.settings_button(
                        "settings-rail-prepare",
                        "Preparar informe",
                        Action::PrepareDiagnostic,
                        cx,
                    ))
                    .child(self.settings_button(
                        "settings-rail-copy",
                        "Copiar informe",
                        Action::CopyDiagnostic,
                        cx,
                    )),
            ));
            rail.push(orbit::RailSection::new(
                "Atajos del Hub",
                "v-keys",
                stack().children(
                    [
                        ("Lanzar perfil", "Ctrl L"),
                        ("Buscar", "Ctrl K"),
                        ("Contraer barra", "Ctrl B"),
                    ]
                    .map(|(label, key)| {
                        div()
                            .flex()
                            .justify_between()
                            .items_center()
                            .min_h(px(42.0))
                            .child(text(label, 13.0, 400, orbit::ink_2(cx), cx))
                            .child(orbit::keycap(key, cx))
                    }),
                ),
            ));
        }
        if self.settings.page == Page::Diagnostics {
            let details = self.settings_diagnostic_report(cx);
            if !details.is_empty() {
                rail.push(
                    orbit::RailSection::new(
                        "Contenido del informe",
                        "v-monitor",
                        stack().children(details),
                    )
                    .grow(),
                );
            }
        }
        rail
    }
}
