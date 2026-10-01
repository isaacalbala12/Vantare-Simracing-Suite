//! Navegación local de la shell. No verifica licencias ni concede derechos al núcleo.
use crate::Section;

/// Plan resuelto por la integración de cuenta; nunca se lee de un archivo/env local.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Plan {
    #[default]
    Unknown,
    Free,
    Overlays,
    Engineer,
    Suite,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct Access {
    pub plan: Plan,
    pub blocked: bool,
}

impl Access {
    /// Una solicitud bloqueada conserva la sección activa.
    pub fn navigate(self, current: &mut Section, destination: Section) -> Result<(), &'static str> {
        if let Some(reason) = self.lock(destination) {
            return Err(reason);
        }
        *current = destination;
        Ok(())
    }

    /// Matriz de `access-policy.ts`: Studio básico admite Free; Strategy y
    /// Telemetría admiten ambos planes de pago. Workshop es una herramienta local.
    pub fn lock(self, section: Section) -> Option<&'static str> {
        let (allowed, required) = match section {
            Section::Studio => (
                self.plan != Plan::Unknown && self.plan != Plan::Engineer,
                "Requiere Overlays",
            ),
            Section::Strategy | Section::Analysis => (
                matches!(self.plan, Plan::Overlays | Plan::Engineer | Plan::Suite),
                "Requiere Overlays o Engineer",
            ),
            Section::Engineer => (
                matches!(self.plan, Plan::Engineer | Plan::Suite),
                "Requiere Engineer",
            ),
            _ => return None,
        };
        if self.blocked {
            Some("Licencia bloqueada")
        } else if self.plan == Plan::Unknown {
            Some("Acceso sin verificar")
        } else if allowed {
            None
        } else {
            Some(required)
        }
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

pub fn icon(section: Section) -> &'static str {
    match section {
        Section::Home => "i-vantare",
        Section::Studio | Section::Workshop => "i-studio",
        Section::Launcher => "i-launcher",
        Section::Calendar => "i-carreras",
        Section::Strategy => "i-estrategia",
        Section::Engineer => "i-ingeniero",
        Section::Analysis => "i-telemetria",
        Section::Testing => "i-flask",
        Section::Roadmap => "i-roadmap",
        Section::Settings => "i-ajustes",
        Section::Notifications => "i-campana",
        Section::Account | Section::Licenses => "i-cuenta",
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
        .map(|section| Item {
            command: Command::Navigate(section),
            label: section.label().into(),
            meta: section.subtitle(),
            icon: icon(section),
            locked: access.lock(section),
        })
        .chain([
            Item {
                command: Command::Save,
                label: "Guardar".into(),
                meta: "Borradores locales",
                icon: "i-studio",
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
            icon: "i-launcher",
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
    fn launcher_palette_filters_names_preserves_ids_and_respects_access() {
        let profiles = vec![crate::launcher::Profile::new(
            "actual-id".into(),
            "Mi rig".into(),
        )];
        let items = launch_commands(Access::default(), "  RIG  ", &profiles);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].command, Command::LaunchProfile("actual-id".into()));
        assert!(items[0].locked.is_none());
        assert!(launch_commands(Access::default(), "missing", &profiles).is_empty());
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
            plan: Plan::Free,
            blocked: false,
        };
        assert!(
            commands(access, "  eNgInEeR  ")
                .iter()
                .any(|item| item.command == Command::Navigate(Section::Engineer))
        );
        assert!(
            commands(access, "REQUIERE")
                .iter()
                .all(|item| item.locked.is_some())
        );
        assert!(
            commands(access, "paradas")
                .iter()
                .any(|item| item.command == Command::Navigate(Section::Strategy))
        );
        assert_eq!(commands(access, "").len(), Section::ALL.len() + 3);
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

    #[test]
    fn plan_matrix_matches_wails_and_unknown_never_grants_paid_navigation() {
        for (plan, expected) in [
            (Plan::Unknown, [false, false, false, false]),
            (Plan::Free, [true, false, false, false]),
            (Plan::Overlays, [true, true, false, true]),
            (Plan::Engineer, [false, true, true, true]),
            (Plan::Suite, [true, true, true, true]),
        ] {
            let access = Access {
                plan,
                blocked: false,
            };
            for (section, allowed) in [
                Section::Studio,
                Section::Strategy,
                Section::Engineer,
                Section::Analysis,
            ]
            .into_iter()
            .zip(expected)
            {
                assert_eq!(
                    access.lock(section).is_none(),
                    allowed,
                    "{plan:?}/{section:?}"
                );
                assert!(
                    Access {
                        blocked: true,
                        ..access
                    }
                    .lock(section)
                    .is_some()
                );
            }
            assert!(access.lock(Section::Home).is_none());
            assert!(access.lock(Section::Workshop).is_none());
        }
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
        let access = Access::default();
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
        let destinations: Vec<_> = commands(Access::default(), "")
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
