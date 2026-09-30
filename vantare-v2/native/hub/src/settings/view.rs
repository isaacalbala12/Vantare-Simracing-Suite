use super::{Action, Hub, Page, updates::LocalUpdate};
use crate::{Section, orbit};
use gpui::{Context, Div, IntoElement, Window, div, prelude::*, px};
use orbit::{Tone, card, card_body, setting_row, text};

fn stack() -> Div {
    div().flex().flex_col().w_full().min_w_0().gap(px(20.0))
}
fn columns() -> Div {
    div().flex().w_full().min_w_0().gap(px(20.0)).items_start()
}
fn pending(label: &str, help: &str, control: impl IntoElement) -> Div {
    setting_row(label, &format!("{help} · pendiente"), control)
}
fn disabled_button(id: &'static str, label: &str) -> gpui::Stateful<Div> {
    orbit::button(id, label)
        .tab_stop(false)
        .opacity(orbit::DISABLED)
        .aria_description("Pendiente: sin contrato nativo")
}
fn pending_toggle(id: &'static str, label: &str, help: &str) -> Div {
    pending(
        label,
        help,
        orbit::toggle(id, label, false, false).tab_stop(false),
    )
}
impl Hub {
    fn settings_button(
        &self,
        id: &'static str,
        label: &str,
        action: Action,
        cx: &mut Context<Self>,
    ) -> gpui::Stateful<Div> {
        let enabled = match action {
            Action::RefreshUpdate => !self.settings.update_busy,
            Action::PrepareDiagnostic => !self.settings.busy,
            Action::CopyDiagnostic => self.settings.diagnostic.is_some(),
        };
        orbit::button(id, label)
            .track_focus(&self.settings.action_focus[action as usize])
            .tab_stop(enabled)
            .when(!enabled, |button| button.opacity(orbit::DISABLED))
            .on_click(cx.listener(move |this, _, window, cx| {
                if enabled {
                    this.settings.action_focus[action as usize].focus(window, cx);
                    this.settings_action(action, cx);
                }
            }))
            .on_key_down(cx.listener(move |this, event: &gpui::KeyDownEvent, _, cx| {
                if enabled && matches!(event.keystroke.key.as_str(), "enter" | "space") {
                    this.settings_action(action, cx);
                    cx.stop_propagation();
                }
            }))
    }
    pub(in crate::shell) fn settings_header(&self) -> Div {
        orbit::page_header(
            "Preferencias",
            self.settings.page.title(),
            self.settings.page.description(),
        )
    }
    pub(in crate::shell) fn settings_column(&self, window: &Window, cx: &mut Context<Self>) -> Div {
        let query = super::search_text(&self.settings.query.read(cx).value);
        let mut rows = stack().gap_1();
        let mut found = false;
        for (index, (section, label, subtitle)) in [
            (Section::Account, "Cuenta", "Sesión, plan y dispositivos"),
            (Section::Licenses, "Licencias", "Plan y módulos"),
        ]
        .into_iter()
        .enumerate()
        {
            if super::search_text(&format!("{label} {subtitle}")).contains(&query) {
                found = true;
                rows = rows.child(
                    orbit::nav_item(label, label, subtitle, false)
                        .track_focus(&self.settings.nav_focus[index])
                        .on_click(cx.listener(move |this, _, window, cx| {
                            this.settings.nav_focus[index].focus(window, cx);
                            this.navigate(section, cx);
                        }))
                        .on_key_down(cx.listener(
                            move |this, event: &gpui::KeyDownEvent, _, cx| {
                                if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                    this.navigate(section, cx);
                                    cx.stop_propagation();
                                }
                            },
                        )),
                );
            }
        }
        for (index, page) in Page::ALL.into_iter().enumerate() {
            let focus_index = index + 2;
            if page.matches(&query) {
                found = true;
                rows = rows.child(
                    orbit::nav_item(
                        page.label(),
                        page.label(),
                        page.subtitle(),
                        page == self.settings.page,
                    )
                    .track_focus(&self.settings.nav_focus[focus_index])
                    .on_click(cx.listener(move |this, _, window, cx| {
                        this.settings.nav_focus[focus_index].focus(window, cx);
                        this.select_settings_page(page, cx);
                    }))
                    .on_key_down(cx.listener(
                        move |this, event: &gpui::KeyDownEvent, _, cx| {
                            if matches!(event.keystroke.key.as_str(), "enter" | "space") {
                                this.select_settings_page(page, cx);
                                cx.stop_propagation();
                            }
                        },
                    )),
                );
            }
        }
        if !found {
            rows = rows.child(orbit::empty_state(
                "Sin resultados",
                "Busca otra sección o ajuste.",
            ));
        }
        orbit::column("Ajustes", env!("CARGO_PKG_VERSION"))
            .w(px(orbit::column_width(f32::from(
                window.viewport_size().width,
            ))))
            .child(
                div()
                    .px(px(24.0))
                    .pt(px(24.0))
                    .child(orbit::eyebrow("Secciones")),
            )
            .child(
                div()
                    .px(px(14.0))
                    .py(px(18.0))
                    .child(orbit::text(
                        "Buscar ajustes…",
                        orbit::SECONDARY,
                        400,
                        orbit::INK_3,
                    ))
                    .child(self.settings.query.clone()),
            )
            .child(
                div()
                    .id("settings-nav")
                    .flex_1()
                    .min_w_0()
                    .min_h_0()
                    .overflow_y_scroll()
                    .child(rows),
            )
    }
    pub(in crate::shell) fn settings(&self, cx: &mut Context<Self>) -> Div {
        self.sync_settings_preferences(cx);
        stack()
            .when_some(self.settings.status.clone(), |view, status| {
                view.child(orbit::callout(status))
            })
            .child(match self.settings.page {
                Page::Application => self.settings_application(),
                Page::Appearance => self.settings_appearance(),
                Page::Performance => Self::settings_performance(),
                Page::Updates => self.settings_updates(cx),
                Page::Hotkeys => Self::settings_hotkeys(),
                Page::Privacy => Self::settings_privacy(),
                Page::Diagnostics => self.settings_diagnostics(cx),
            })
    }
    fn settings_application(&self) -> Div {
        let interface = card("Interfaz").flex_1().min_w_0().child(
            card_body()
                .child(pending(
                    "Zoom de la interfaz",
                    "Amplía o reduce toda la app.",
                    self.settings.zoom.clone(),
                ))
                .child(pending(
                    "Idioma",
                    "Idioma de la interfaz del hub.",
                    self.settings.hub_language.clone(),
                ))
                .child(pending(
                    "Densidad",
                    "Altura de filas, espaciado y radios.",
                    self.settings.density.clone(),
                )),
        );
        let system = card("Sistema").flex_1().min_w_0().child(card_body()
            .child(pending_toggle("settings-startup", "Inicio con Windows", "Abre Vantare al iniciar sesión."))
            .child(pending_toggle("settings-minimized", "Empezar minimizado", "Arranca en la bandeja, sin abrir la ventana."))
            .child(pending_toggle("settings-notify-update", "Avisos de actualización", "Banner en la shell cuando hay una versión nueva."))
            .child(pending_toggle("settings-notify-launcher", "Avisos del Launcher", "Toast cuando termina una cadena de arranque."))
            .child(pending_toggle("settings-notify-system", "Notificaciones del sistema", "Avisos de escritorio."))
            .child(pending("Probar notificación", "Envía un aviso ahora sin cambiar tus preferencias.", disabled_button("settings-notify-test", "Enviar prueba")))
            .child(orbit::callout("Sin contrato nativo de preferencias del sistema. No se guardan valores ni se solicita permiso a Windows.")));
        stack()
            .child(columns().child(interface).child(system))
            .child(
                card("Formato de los widgets").child(
                    card_body()
                        .child(setting_row(
                            "Idioma de los widgets",
                            "Etiquetas y formato; independiente del idioma del Hub.",
                            self.settings.language.clone(),
                        ))
                        .child(setting_row(
                            "Unidades de los widgets",
                            "Guardadas en el layout compartido con Studio, Workshop y overlays.",
                            self.settings.units.clone(),
                        )),
                ),
            )
    }
    fn settings_appearance(&self) -> Div {
        let mut palettes = div().flex().flex_wrap().gap(px(8.0));
        for (index, name) in [
            "Vantare", "Rosa", "Bosque", "Océano", "Ámbar", "Iris", "Grises",
        ]
        .into_iter()
        .enumerate()
        {
            palettes = palettes.child(card("").w(px(160.0)).child(orbit::list_row(
                ("settings-palette", index),
                name,
                "pendiente",
                index == 0,
                false,
            )));
        }
        card("Apariencia").child(card_body()
            .child(text("Paleta de colores", orbit::BODY, 700, orbit::INK))
            .child(text("Cambia los colores de la interfaz sin alterar su diseño. · pendiente", orbit::SECONDARY, 400, orbit::INK_3))
            .child(palettes)
            .child(pending("Apariencia", "Elige claro, oscuro o sigue el ajuste de Windows.", self.settings.scheme.clone()))
            .child(pending("Contraste", "Ajusta la legibilidad del texto secundario y los bordes.", self.settings.contrast.clone()))
            .child(pending("Opacidad del cristal", "Controla cuánto dejan ver el fondo los paneles y la cabecera.", self.settings.opacity.clone()))
            .child(pending("Fuente de interfaz", "Se aplica a menús, controles y textos de la aplicación.", self.settings.font.clone()))
            .child(pending("Fuente monoespaciada", "Se aplica a cifras y textos técnicos de la interfaz.", self.settings.mono.clone()))
            .child(text("Vista previa de la interfaz y sus cifras · 0123456789", orbit::BODY, 500, orbit::INK_2))
            .child(pending_toggle("settings-motion", "Reducir animaciones", "Limita el movimiento de la interfaz."))
            .child(orbit::callout("Orbit oscuro es fijo en el Hub nativo. La apariencia de los widgets del overlay se configura por separado en Overlay Studio.")))
    }
    fn settings_performance() -> Div {
        let mut levels = div().flex().gap(px(12.0));
        for (index, (name, rate, description)) in [
            ("Máximo", "Frecuencia del monitor", "Sin recortes. Todo a la tasa de tu monitor. Para PCs sobrados."),
            ("Alto", "60 fps", "Frescura máxima. Sin animaciones de adorno."),
            ("Equilibrado", "40 fps", "Recorta lo que el ojo no distingue. Recomendado."),
            ("Ahorro", "30 fps", "Solo datos, sin efectos. Para portátiles y gráficas integradas."),
            ("Mínimo", "20 fps", "Vantare casi invisible para el sistema. Para VR, streaming en el mismo PC o PCs apurados."),
        ].into_iter().enumerate() {
            levels = levels.child(card("").flex_1().min_w_0().child(orbit::list_row(("settings-level", index), name, description, false, false).child(text(rate, orbit::MICRO, 500, orbit::INK_3)).child(orbit::chip("pendiente", Tone::Neutral))));
        }
        stack().child(card("Nivel de rendimiento").child(card_body().gap(px(12.0))
            .child(orbit::pill("Estado efectivo pendiente", Tone::Warning))
            .child(levels)
            .child(columns()
                .child(orbit::list_row("settings-custom", "Personalizado", "Elige la cadencia widget a widget; cada aumento muestra su coste de CPU. · pendiente", false, false).flex_1().min_w_0())
                .child(orbit::list_row("settings-auto", "Automático", "Vantare mide tu PC en carrera y se ajusta solo (entre Alto y Mínimo). · pendiente", false, false).flex_1().min_w_0()))
            .child(text("Personalizado se guarda en el perfil activo; los cinco niveles son el valor predeterminado de la app.", orbit::SECONDARY, 400, orbit::INK_3))
            .child(orbit::callout("Pendiente: sin contrato nativo de configuración de rendimiento. Las cadencias anteriores describen las opciones Wails, no el estado actual del núcleo."))))
            .child(card("Widgets del perfil activo").child(orbit::empty_state("Cadencia pendiente", "Sin contrato de overrides por widget ni medida de coste de CPU.")))
    }
    fn settings_updates(&self, cx: &mut Context<Self>) -> Div {
        let (version, state) = match &self.settings.update {
            LocalUpdate::Unread => ("—".into(), "Estado local sin leer".into()),
            LocalUpdate::Development => (
                env!("CARGO_PKG_VERSION").to_owned(),
                "Build de desarrollo · sin instalación local detectada".to_owned(),
            ),
            LocalUpdate::Package {
                version,
                channel,
                previous,
            } => (
                version.clone(),
                format!(
                    "{channel} · estado local leído · referencia anterior {}",
                    if *previous { "presente" } else { "ausente" }
                ),
            ),
            LocalUpdate::Invalid => ("—".into(), "Estado local inválido o no legible".into()),
        };
        let mut channels = columns();
        for (name, description) in [
            ("Stable", "Versiones probadas para todo el mundo."),
            (
                "Testers",
                "Candidatas a Stable con el Testing Center activo. Requiere invitación.",
            ),
            (
                "Nightly",
                "Cada cambio publicado. Puede romperse. Requiere invitación.",
            ),
        ] {
            channels = channels.child(
                card(name).flex_1().min_w_0().child(
                    card_body()
                        .child(text(description, orbit::SECONDARY, 400, orbit::INK_3))
                        .child(orbit::chip("Publicación pendiente", Tone::Warning)),
                ),
            );
        }
        stack().child(card("").child(card_body().child(columns().items_center()
            .child(stack().gap_2().flex_1().min_w_0().child(orbit::eyebrow("Versión instalada")).child(text(version, 28.0, 800, orbit::INK)).child(text(state, orbit::SECONDARY, 400, orbit::INK_3)))
            .child(self.settings_button("settings-update-refresh", if self.settings.update_busy { "Leyendo…" } else { "Actualizar estado local" }, Action::RefreshUpdate, cx))
            .child(disabled_button("settings-update-check", "Buscar actualizaciones")))))
            .child(channels)
            .child(card("Novedades").child(orbit::empty_state("Publicación pendiente", "Sin catálogo nativo de versiones o notas empaquetadas.")))
            .child(orbit::callout("Estado local informativo, sin verificar la instalación. Búsqueda de actualizaciones, instalación y cambio de canal: pendiente."))
    }
    fn settings_hotkeys() -> Div {
        let mut body = card_body();
        for (index, (label, help)) in [
            ("Toggle overlay", "Muestra u oculta el overlay activo."),
            ("Siguiente perfil", "Cambia al siguiente perfil guardado."),
            ("Perfil anterior", "Cambia al perfil anterior."),
            (
                "Cambiar referencia Delta",
                "Rota la referencia del widget Delta.",
            ),
        ]
        .into_iter()
        .enumerate()
        {
            body = body.child(
                pending(label, help, orbit::chip("Sin registrar", Tone::Neutral))
                    .id(("settings-hotkey", index)),
            );
        }
        stack().child(columns().justify_between()
            .child(stack().gap_2().child(orbit::eyebrow("Atajos globales")).child(text("Funcionan aunque Vantare esté en segundo plano. Pulsa una fila y después la combinación para reasignarla.", orbit::BODY, 400, orbit::INK_2)))
            .child(disabled_button("settings-hotkeys-reset", "Restablecer todos")))
            .child(card("Overlay").child(body))
            .child(orbit::callout("Pendiente: sin contrato nativo de teclas globales. Estas cuatro acciones son las del producto actual; no se inventan combinaciones ni se afirma ausencia de conflictos."))
    }
    fn settings_privacy() -> Div {
        stack().child(card("Consentimiento de contribución").child(card_body()
            .child(text("Si aceptas, Vantare puede preparar y subir automáticamente paquetes seudonimizados de Strategy. Cada paquete queda visible e inspeccionable antes del envío.", orbit::BODY, 600, orbit::INK_2))
            .child(columns()
                .child(stack().gap_2().flex_1().min_w_0().child(text("Se comparte", orbit::BODY, 700, orbit::INK)).child(text("Consumos, stints, pits, estrategias observadas y calidad ya derivados. Combinación del catálogo y semana ISO, nunca fecha u hora exactas. Un identificador administrativo separado para cuota y borrado.", orbit::BODY, 400, orbit::INK_2)))
                .child(stack().gap_2().flex_1().min_w_0().child(text("Nunca se comparte", orbit::BODY, 700, orbit::INK)).child(text("Telemetría cruda ni archivos de sesión. Nombres, SteamID, correo ni rutas del equipo. Voz, audio, estrategias editables ni perfiles completos.", orbit::BODY, 400, orbit::INK_2))))
            .child(orbit::callout("Contrato de contribución pendiente en nativo. No se prepara ni envía nada desde esta sección."))
            .child(columns().flex_wrap().child(disabled_button("settings-consent", "Aceptar y participar")).child(disabled_button("settings-revoke", "Revocar consentimiento")).child(disabled_button("settings-delete-remote", "Solicitar borrado remoto")))
            .child(orbit::pill("Consentimiento pendiente", Tone::Warning))))
            .child(card("Cola e historial de envíos").child(card_body()
                .child(orbit::empty_state("Cola pendiente", "Cola e historial de envíos todavía no disponibles."))
                .child(disabled_button("settings-send-next", "Enviar siguiente"))))
    }
    fn settings_events(&self, cx: &mut Context<Self>) -> Div {
        let observed = &self.testing.read(cx).observed;
        let filter = self
            .settings
            .event_filter
            .read(cx)
            .state
            .selected
            .unwrap_or(0);
        let query = self.settings.event_query.read(cx).value.to_lowercase();
        let mut events = card_body()
            .gap_2()
            .child(self.settings.event_filter.clone())
            .child(self.settings.event_query.clone());
        let rows: Vec<_> = observed
            .errors
            .iter()
            .filter(|error| super::event_matches(error, filter, &query))
            .map(|error| {
                vec![
                    error.observed_at_utc.to_string(),
                    "Error".into(),
                    error.module.label().into(),
                    format!("{:?}", error.code),
                ]
            })
            .collect();
        if rows.is_empty() {
            events = events.child(orbit::empty_state(
                "Sin eventos observados para este filtro",
                "Solo errores sanitizados instrumentados en esta sesión. Info y avisos pendientes.",
            ));
        } else {
            let table = orbit::Table {
                headers: vec![
                    "UTC".into(),
                    "Nivel".into(),
                    "Módulo".into(),
                    "Código".into(),
                ],
                rows,
            };
            match table.render() {
                Ok(table) => events = events.child(table),
                Err(error) => events = events.child(orbit::callout(error)),
            }
        }
        card("Últimos eventos").flex_1().min_w_0().child(events)
    }
    fn settings_diagnostics(&self, cx: &mut Context<Self>) -> Div {
        let mut stats = columns();
        for (label, value) in [
            (
                "Telemetry Core",
                self.settings.diagnostic.as_ref().map_or_else(
                    || "Sin diagnóstico preparado".into(),
                    super::Diagnostic::summary,
                ),
            ),
            ("Overlay", "Estado no instrumentado".into()),
            ("CPU · memoria", "Muestreo pendiente".into()),
            ("Datos locales", "Tamaño pendiente".into()),
        ] {
            stats = stats.child(card("").flex_1().min_w_0().child(
                card_body().child(orbit::eyebrow(label)).child(text(
                    value,
                    orbit::SECONDARY,
                    500,
                    orbit::INK_2,
                )),
            ));
        }
        let data = card("Datos y registros").flex_1().min_w_0().child(
            card_body()
                .child(pending(
                    "Carpeta de datos",
                    &self.settings.data.display().to_string(),
                    disabled_button("settings-data-open", "Abrir"),
                ))
                .child(pending(
                    "Carpeta de registros",
                    "Sin contrato nativo de registro del Hub.",
                    disabled_button("settings-logs-open", "Abrir"),
                ))
                .child(pending_toggle(
                    "settings-cpu",
                    "Muestreo de CPU",
                    "Métrica de diagnóstico local.",
                ))
                .child(setting_row(
                    "Informe de diagnóstico",
                    "Paquete saneado local, sin telemetría cruda ni rutas privadas.",
                    self.settings_button(
                        "settings-diagnostic-prepare",
                        if self.settings.busy {
                            "Preparando…"
                        } else {
                            "Preparar"
                        },
                        Action::PrepareDiagnostic,
                        cx,
                    ),
                )),
        );
        let mut view = stack()
            .child(stats)
            .child(columns().child(data).child(self.settings_events(cx)));
        if let Some(diagnostic) = &self.settings.diagnostic {
            let mut body = card_body();
            for binary in &diagnostic.binaries {
                body = body.child(setting_row(
                    binary.name,
                    binary.state,
                    orbit::chip(
                        if binary.sha256.is_some() {
                            "SHA-256 calculado"
                        } else {
                            "Hash no disponible"
                        },
                        Tone::Neutral,
                    ),
                ));
            }
            view = view.child(card("Informe de diagnóstico local").child(body));
            match serde_json::to_string_pretty(diagnostic) {
                Ok(json) => {
                    let copy = self.settings_button(
                        "settings-diagnostic-copy",
                        "Copiar informe",
                        Action::CopyDiagnostic,
                        cx,
                    );
                    view = view.child(
                        card("Contenido sanitizado").child(
                            card_body()
                                .child(text(json, orbit::SECONDARY, 400, orbit::INK_2))
                                .child(copy),
                        ),
                    );
                }
                Err(_) => {
                    view = view.child(orbit::callout("No se pudo serializar el diagnóstico."));
                }
            }
        }
        view
    }
}
