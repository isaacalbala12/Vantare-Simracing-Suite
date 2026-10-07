//! Navegación local de la shell. No verifica licencias ni concede derechos al núcleo.
use crate::Section;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
// Capacidades independientes del contrato beta; no forman estados excluyentes.
#[allow(clippy::struct_excessive_bools)]
pub struct Access {
    pub verified: bool,
    pub engineer: bool,
    pub strategy: bool,
    pub analysis: bool,
    pub calendar: bool,
    pub tester: bool,
    pub blocked: bool,
    #[cfg(feature = "parity-capture")]
    pub capture_locks: &'static [Section],
}

impl Access {
    pub fn from_policy(policy: &vantare_ipc::control::Policy, now_ms: u64) -> Self {
        if policy.error.is_some() {
            return Self {
                blocked: true,
                ..Self::default()
            };
        }
        if !policy.current_at(now_ms) {
            return Self::default();
        }
        Self {
            verified: policy.overlays_advanced,
            engineer: policy.engineer,
            strategy: policy.strategy,
            analysis: policy.analysis,
            calendar: policy.calendar,
            tester: policy.tester,
            ..Self::default()
        }
    }

    pub fn beta_visible(self, section: Section) -> bool {
        match section {
            Section::Workshop | Section::Analysis | Section::Licenses => false,
            Section::Testing | Section::Calendar => self.verified && !self.blocked && self.tester,
            _ => true,
        }
    }
    /// Los módulos futuros abren solo su presentación; las rutas ocultas nunca navegan.
    pub fn beta_navigate(
        self,
        current: &mut Section,
        destination: Section,
    ) -> Result<(), &'static str> {
        if !self.beta_visible(destination) {
            return Err("No disponible en la navegación beta");
        }
        if matches!(destination, Section::Strategy | Section::Engineer) {
            *current = destination;
            return Ok(());
        }
        self.navigate(current, destination)
    }
    pub fn beta_lock(self, section: Section) -> Option<&'static str> {
        if matches!(section, Section::Strategy | Section::Engineer) {
            return Some("Próximamente");
        }
        if !self.beta_visible(section) {
            return Some("No disponible en la navegación beta");
        }
        self.lock(section)
    }
    pub fn visible(self, section: Section) -> bool {
        match section {
            Section::Analysis => self.verified && !self.blocked && self.analysis,
            Section::Calendar => self.verified && !self.blocked && self.calendar,
            _ => true,
        }
    }
    /// Una solicitud bloqueada u oculta conserva la sección activa.
    pub fn navigate(self, current: &mut Section, destination: Section) -> Result<(), &'static str> {
        if let Some(reason) = self.lock(destination) {
            return Err(reason);
        }
        *current = destination;
        Ok(())
    }
    pub fn lock(self, section: Section) -> Option<&'static str> {
        #[cfg(feature = "parity-capture")]
        if self.capture_locks.contains(&section) {
            return Some("No incluido en el acceso demo");
        }
        if self.blocked {
            return Some("Licencia bloqueada");
        }
        if !self.verified {
            return Some("Acceso sin verificar");
        }
        let allowed = match section {
            Section::Strategy => self.strategy,
            Section::Engineer => self.engineer,
            Section::Analysis => self.analysis,
            Section::Calendar => self.calendar,
            _ => true,
        };
        if allowed { None } else { Some("Próximamente") }
    }
}

pub const RAIL: &[Section] = &[
    Section::Home,
    Section::Studio,
    Section::Launcher,
    Section::Calendar,
    Section::Strategy,
    Section::Engineer,
    Section::Analysis,
    Section::Roadmap,
    Section::Testing,
];

pub const BETA_RAIL: &[Section] = &[
    Section::Home,
    Section::Launcher,
    Section::Studio,
    Section::Roadmap,
    Section::Testing,
    Section::Calendar,
    Section::Strategy,
    Section::Engineer,
];
pub fn beta_commands(access: Access, query: &str) -> Vec<Item> {
    commands(access, query)
        .into_iter()
        .filter(|item| match item.command {
            Command::Navigate(section) => access.beta_visible(section),
            _ => true,
        })
        .map(|mut item| {
            if let Command::Navigate(section) = item.command {
                item.locked = access.beta_lock(section);
            }
            item
        })
        .collect()
}

pub fn icon(section: Section) -> &'static str {
    match section {
        Section::Home => "v-home",
        Section::Studio | Section::Workshop => "v-studio",
        Section::Launcher => "v-launch",
        Section::Calendar => "v-calendar",
        Section::Strategy => "v-strategy",
        Section::Engineer => "v-engineer",
        Section::Analysis => "i-telemetria",
        Section::Testing => "v-testing",
        Section::Roadmap => "v-roadmap",
        Section::Settings => "i-ajustes",
        Section::Notifications => "v-bell",
        Section::Account | Section::Licenses => "i-cuenta",
    }
}

/// Copia del marco Wails; no cambia los nombres internos de las secciones.
pub fn title(section: Section) -> &'static str {
    match section {
        Section::Studio => "Overlays Studio",
        Section::Strategy => "Estrategia",
        Section::Engineer => "Ingeniero",
        Section::Analysis => "Telemetría",
        _ => section.label(),
    }
}

pub fn trail(section: Section) -> &'static str {
    match section {
        Section::Home => "Tu resumen",
        Section::Studio => "Editor",
        Section::Launcher => "Abre tus apps",
        Section::Calendar => "Carreras de LMU",
        Section::Strategy => "Planificador",
        Section::Engineer => "Radio",
        Section::Analysis => "Análisis post-sesión",
        Section::Roadmap => "Producto",
        Section::Settings => "Preferencias locales",
        Section::Testing => "Envía informes",
        _ => section.subtitle(),
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Command {
    Navigate(Section),
    LaunchProfile(String),
    Save,
    ToggleColumn,
    Close,
}

#[derive(Clone, Debug)]
pub struct Item {
    pub command: Command,
    pub label: String,
    pub meta: &'static str,
    pub icon: &'static str,
    pub locked: Option<&'static str>,
}

impl Item {
    /// Mismo substring sin distinción de mayúsculas que `palette-filter.ts`.
    pub fn matches(&self, query: &str) -> bool {
        format!(
            "{} {} {}",
            self.label,
            self.meta,
            self.locked.unwrap_or_default()
        )
        .to_lowercase()
        .contains(&query.to_lowercase())
    }
}

pub fn commands(access: Access, query: &str) -> Vec<Item> {
    RAIL.iter()
        .chain(
            [
                Section::Settings,
                Section::Account,
                Section::Workshop,
                Section::Licenses,
                Section::Notifications,
            ]
            .iter(),
        )
        .copied()
        .filter(|section| access.visible(*section))
        .map(|section| Item {
            command: Command::Navigate(section),
            label: title(section).into(),
            meta: trail(section),
            icon: icon(section),
            locked: access.lock(section),
        })
        .chain([
            Item {
                command: Command::Save,
                label: "Guardar perfil".into(),
                meta: "Overlays Studio",
                icon: "v-studio",
                locked: None,
            },
            Item {
                command: Command::ToggleColumn,
                label: "Mostrar / ocultar contexto".into(),
                meta: "Columna de contexto",
                icon: "i-panel",
                locked: None,
            },
            Item {
                command: Command::Close,
                label: "Guardar y cerrar".into(),
                meta: "Hub",
                icon: "i-ajustes",
                locked: None,
            },
        ])
        .filter(|item| item.matches(query.trim()))
        .collect()
}

pub fn launch_commands(
    access: Access,
    query: &str,
    profiles: &[crate::launcher::Profile],
) -> Vec<Item> {
    profiles
        .iter()
        .map(|profile| Item {
            command: Command::LaunchProfile(profile.id.clone()),
            label: format!("Lanzar {}", profile.name),
            meta: "Perfil de Launcher",
            icon: "v-launch",
            locked: access.lock(Section::Launcher),
        })
        .filter(|item| item.matches(query.trim()))
        .collect()
}

pub fn move_cursor(current: usize, forward: bool, count: usize) -> usize {
    if count == 0 {
        return 0;
    }
    let current = current.min(count - 1);
    if forward {
        (current + 1) % count
    } else {
        (current + count - 1) % count
    }
}

/// No inventa pestañas que las entidades de sección aún no exponen.
pub fn context(section: Section) -> &'static [Section] {
    match section {
        Section::Studio | Section::Workshop => &[Section::Studio, Section::Workshop],
        Section::Settings | Section::Account | Section::Licenses => {
            &[Section::Account, Section::Settings, Section::Licenses]
        }
        Section::Notifications => &[Section::Notifications],
        Section::Home | Section::Engineer | Section::Testing => &[],
        Section::Launcher => &[Section::Launcher],
        Section::Calendar => &[Section::Calendar],
        Section::Strategy => &[Section::Strategy],
        Section::Analysis => &[Section::Analysis],
        Section::Roadmap => &[Section::Roadmap],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn beta_modules_control_visibility_locks_and_direct_navigation() {
        for (verified, engineer, strategy, analysis, calendar) in [
            (false, false, false, false, false),
            (true, false, false, false, false),
            (true, true, false, false, false),
            (true, false, true, false, false),
            (true, false, false, true, false),
            (true, false, false, false, true),
            (true, true, true, true, true),
        ] {
            let access = Access {
                verified,
                engineer,
                strategy,
                analysis,
                calendar,
                ..Access::default()
            };
            for &section in Section::ALL {
                let allowed = verified
                    && match section {
                        Section::Engineer => engineer,
                        Section::Strategy => strategy,
                        Section::Analysis => analysis,
                        Section::Calendar => calendar,
                        _ => true,
                    };
                let visible = match section {
                    Section::Analysis => verified && analysis,
                    Section::Calendar => verified && calendar,
                    _ => true,
                };
                assert_eq!(access.visible(section), visible, "{section:?}");
                let item = commands(access, "")
                    .into_iter()
                    .find(|item| item.command == Command::Navigate(section));
                assert_eq!(item.is_some(), visible);
                if let Some(item) = item {
                    assert_eq!(item.locked.is_none(), allowed);
                }
                let mut current = Section::Home;
                assert_eq!(access.navigate(&mut current, section).is_ok(), allowed);
                assert_eq!(current, if allowed { section } else { Section::Home });
                if verified && !allowed {
                    assert_eq!(access.lock(section), Some("Próximamente"));
                }
                assert!(
                    Access {
                        blocked: true,
                        ..access
                    }
                    .lock(section)
                    .is_some()
                );
            }
        }
    }
    #[test]
    fn roadmap_is_found_by_its_product_name_and_keeps_its_breadcrumb() {
        let access = Access {
            verified: true,
            ..Access::default()
        };
        let results = commands(access, "roadmap");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].command, Command::Navigate(Section::Roadmap));
        assert_eq!(results[0].label, "Roadmap");
        assert_eq!(title(Section::Roadmap), "Roadmap");
        assert!(commands(access, "Novedades").is_empty());
    }
    #[test]
    fn palette_filter_cursor_and_context_keep_their_contract() {
        let access = Access {
            verified: true,
            ..Access::default()
        };
        assert_eq!(commands(access, "próximamente").len(), 2);
        assert!(commands(access, "TELEMETRÍA").is_empty());
        assert!(commands(access, "CALENDARIO").is_empty());
        assert_eq!(move_cursor(0, false, 3), 2);
        assert_eq!(move_cursor(2, true, 3), 0);
        assert_eq!(move_cursor(9, true, 0), 0);
        for &section in Section::ALL {
            assert!(
                context(section)
                    .iter()
                    .all(|destination| Section::ALL.contains(destination))
            );
        }
    }

    #[test]
    fn launcher_palette_filters_names_preserves_ids_and_respects_access() {
        let profiles = vec![crate::launcher::Profile::new(
            "actual-id".into(),
            "Mi rig".into(),
        )];
        let items = launch_commands(
            Access {
                verified: true,
                engineer: true,
                strategy: true,
                analysis: true,
                calendar: true,
                ..Access::default()
            },
            "  RIG  ",
            &profiles,
        );
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].command, Command::LaunchProfile("actual-id".into()));
        assert!(items[0].locked.is_none());
        assert!(
            launch_commands(
                Access {
                    verified: true,
                    engineer: true,
                    strategy: true,
                    analysis: true,
                    calendar: true,
                    ..Access::default()
                },
                "missing",
                &profiles
            )
            .is_empty()
        );
        let access = Access {
            blocked: true,
            ..Default::default()
        };
        assert_eq!(
            launch_commands(access, "", &profiles)[0].locked,
            access.lock(Section::Launcher)
        );
    }

    #[test]
    fn filter_covers_label_meta_lock_case_trim_and_empty_results() {
        let access = Access {
            verified: true,
            analysis: true,
            calendar: true,
            ..Default::default()
        };
        assert!(
            commands(access, "  iNgEnIeRo  ")
                .iter()
                .any(|item| item.command == Command::Navigate(Section::Engineer))
        );
        assert!(
            commands(access, "PRÓXIMAMENTE")
                .iter()
                .all(|item| item.locked.is_some())
        );
        assert!(
            commands(access, "planificador")
                .iter()
                .any(|item| item.command == Command::Navigate(Section::Strategy))
        );
        assert_eq!(commands(access, "").len(), Section::ALL.len() + 3);
        let studio = commands(access, "Overlays Studio");
        assert_eq!(studio.len(), 2);
        assert_eq!(studio[0].meta, "Editor");
        assert_eq!(studio[1].command, Command::Save);
        assert!(commands(access, "no-existe-🏁").is_empty());
        assert!(
            !commands(access, "telemetria")
                .iter()
                .any(|item| item.command == Command::Navigate(Section::Analysis))
        );
        assert!(
            commands(access, "TELEMETRÍA")
                .iter()
                .any(|item| item.command == Command::Navigate(Section::Analysis))
        );
    }

    #[cfg(feature = "parity-capture")]
    #[test]
    fn capture_restrictions_block_navigation_without_granting_access() {
        let access = Access {
            verified: true,
            engineer: true,
            strategy: true,
            analysis: true,
            calendar: true,
            capture_locks: &[Section::Engineer, Section::Analysis],
            ..Default::default()
        };
        let mut current = Section::Strategy;
        for destination in access.capture_locks {
            assert!(access.navigate(&mut current, *destination).is_err());
            assert_eq!(current, Section::Strategy);
        }
        assert!(access.lock(Section::Strategy).is_none());
        assert!(access.lock(Section::Studio).is_none());
        assert!(
            Access {
                verified: false,
                ..access
            }
            .lock(Section::Strategy)
            .is_some()
        );
    }

    #[test]
    fn cursor_wraps_in_both_directions_and_survives_filter_shrink() {
        assert_eq!(move_cursor(0, false, 3), 2);
        assert_eq!(move_cursor(2, true, 3), 0);
        assert_eq!(move_cursor(9, false, 2), 0);
        assert_eq!(move_cursor(9, true, 0), 0);
        assert_eq!(move_cursor(0, false, 1), 0);
    }

    #[test]
    fn locked_navigation_preserves_the_active_section() {
        let mut current = Section::Calendar;
        let access = Access {
            verified: true,
            ..Access::default()
        };
        assert!(access.navigate(&mut current, Section::Engineer).is_err());
        assert_eq!(current, Section::Calendar);
        access
            .navigate(&mut current, Section::Launcher)
            .expect("sección local");
        assert_eq!(current, Section::Launcher);
        access
            .navigate(&mut current, Section::Workshop)
            .expect("herramienta local");
        assert_eq!(current, Section::Workshop);
    }

    #[test]
    fn rail_and_context_only_link_existing_sections() {
        assert_eq!(
            RAIL,
            &[
                Section::Home,
                Section::Studio,
                Section::Launcher,
                Section::Calendar,
                Section::Strategy,
                Section::Engineer,
                Section::Analysis,
                Section::Roadmap,
                Section::Testing
            ]
        );
        let destinations: Vec<_> = commands(
            Access {
                verified: true,
                engineer: true,
                strategy: true,
                analysis: true,
                calendar: true,
                ..Access::default()
            },
            "",
        )
        .into_iter()
        .filter_map(|item| {
            if let Command::Navigate(section) = item.command {
                Some(section)
            } else {
                None
            }
        })
        .collect();
        assert_eq!(&destinations[..RAIL.len()], RAIL);
        assert_eq!(destinations.len(), Section::ALL.len());
        for &section in Section::ALL {
            assert!(
                context(section)
                    .iter()
                    .all(|destination| Section::ALL.contains(destination))
            );
        }
        assert_eq!(
            context(Section::Settings),
            &[Section::Account, Section::Settings, Section::Licenses]
        );
    }
}

#[cfg(test)]
mod beta_tests {
    use super::*;
    #[test]
    fn beta_sections_follow_the_verified_role_not_a_purchased_module() {
        for (role, tester, calendar) in [
            ("usuario", false, false),
            ("tester", true, true),
            ("owner", true, true),
            ("nightly_tester", true, true),
            ("calendario comprado", false, true),
        ] {
            let policy = vantare_ipc::control::Policy {
                version: vantare_ipc::control::VERSION,
                revision: 1,
                checked_at_ms: 10_000,
                overlays_advanced: true,
                tester,
                calendar,
                engineer: true,
                strategy: true,
                ..Default::default()
            };
            let access = Access::from_policy(&policy, 10_001);
            for section in [Section::Testing, Section::Calendar] {
                assert_eq!(access.beta_visible(section), tester, "{role}: {section:?}");
            }
            for section in [Section::Workshop, Section::Analysis, Section::Licenses] {
                assert!(!access.beta_visible(section), "{role}");
            }
            for section in [
                Section::Home,
                Section::Launcher,
                Section::Studio,
                Section::Account,
                Section::Settings,
                Section::Roadmap,
                Section::Notifications,
            ] {
                assert!(access.beta_visible(section), "{role}");
            }
            for section in [Section::Strategy, Section::Engineer] {
                assert_eq!(access.beta_lock(section), Some("Próximamente"));
            }
            let menu = beta_commands(access, "");
            assert!(!menu.iter().any(|item| matches!(
                item.command,
                Command::Navigate(Section::Workshop | Section::Analysis | Section::Licenses)
            )));
            assert_eq!(
                menu.iter()
                    .any(|item| item.command == Command::Navigate(Section::Testing)),
                tester,
                "{role}"
            );
            assert!(
                !Access {
                    blocked: true,
                    ..access
                }
                .beta_visible(Section::Testing)
            );
        }
    }
    #[test]
    fn beta_routes_keep_hidden_modules_unreachable_and_future_modules_presentable() {
        for access in [
            Access::default(),
            Access {
                verified: true,
                engineer: true,
                strategy: true,
                analysis: true,
                tester: true,
                ..Access::default()
            },
        ] {
            let mut current = Section::Home;
            for hidden in [Section::Workshop, Section::Analysis, Section::Licenses] {
                assert!(access.beta_navigate(&mut current, hidden).is_err());
                assert_eq!(current, Section::Home);
            }
            for future in [Section::Strategy, Section::Engineer] {
                assert!(access.beta_navigate(&mut current, future).is_ok());
                assert_eq!(current, future);
                assert_eq!(access.beta_lock(current), Some("Próximamente"));
                let result = access.beta_navigate(&mut current, Section::Roadmap);
                if access.verified {
                    assert!(result.is_ok());
                    assert_eq!(current, Section::Roadmap);
                    assert_eq!(access.beta_lock(current), None);
                } else {
                    assert!(result.is_err());
                    assert_eq!(current, future);
                }
            }
        }
    }
}
