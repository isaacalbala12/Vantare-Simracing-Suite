//! Documento de layouts nativos; no es una migración del documento Go V4.
use serde::{Deserialize, Serialize};
use vantare_domain::{
    SessionKind, Snapshot,
    format::{Language, Preferences, Units},
};
use vantare_ui::Kind;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionFilter {
    #[default]
    Any,
    Practice,
    Qualifying,
    Race,
}

impl SessionFilter {
    pub fn allows(self, snapshot: &Snapshot) -> bool {
        matches!(
            (self, snapshot.state.session.kind.current()),
            (Self::Any, _)
                | (Self::Practice, Some(SessionKind::Practice))
                | (Self::Qualifying, Some(SessionKind::Qualifying))
                | (Self::Race, Some(SessionKind::Race))
        )
    }

    #[must_use]
    pub fn next(self) -> Self {
        match self {
            Self::Any => Self::Practice,
            Self::Practice => Self::Qualifying,
            Self::Qualifying => Self::Race,
            Self::Race => Self::Any,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
// Opciones independientes de persistencia; no representan estados excluyentes.
#[allow(clippy::struct_excessive_bools)]
pub struct Instance {
    pub id: u64,
    pub widget: String,
    pub x: f32,
    pub y: f32,
    pub visible: bool,
    pub locked: bool,
    pub opacity: u8,
    pub session: SessionFilter,
    pub imperial: bool,
    pub english: bool,
}

impl Instance {
    pub fn kind(&self) -> Result<Kind, String> {
        self.widget
            .parse()
            .map_err(|()| format!("widget desconocido: {}", self.widget))
    }
    pub fn prefs(&self) -> Preferences {
        Preferences {
            units: if self.imperial {
                Units::Imperial
            } else {
                Units::Metric
            },
            language: if self.english {
                Language::En
            } else {
                Language::Es
            },
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Layout {
    pub id: u64,
    pub name: String,
    pub width: u16,
    pub height: u16,
    /// Orden de pintado: el último se sitúa por encima.
    pub widgets: Vec<Instance>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Project {
    pub schema_version: u32,
    pub active_layout: u64,
    pub layouts: Vec<Layout>,
}

impl Default for Project {
    fn default() -> Self {
        Self {
            schema_version: 1,
            active_layout: 1,
            layouts: vec![Layout {
                id: 1,
                name: "General".into(),
                width: 1920,
                height: 1080,
                widgets: vec![],
            }],
        }
    }
}

impl Project {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 || self.layouts.is_empty() || self.layouts.len() > 32 {
            return Err("versión o número de layouts no admitido".into());
        }
        let mut ids = std::collections::HashSet::new();
        for layout in &self.layouts {
            if layout.id == 0
                || !ids.insert(layout.id)
                || layout.name.trim().is_empty()
                || layout.name.len() > 160
                || !(320..=16_384).contains(&layout.width)
                || !(200..=16_384).contains(&layout.height)
                || layout.widgets.len() > 128
            {
                return Err("layout inválido: identidad, nombre, dimensiones o límite".into());
            }
            let mut instances = std::collections::HashSet::new();
            for item in &layout.widgets {
                item.kind()?;
                if item.id == 0
                    || !instances.insert(item.id)
                    || !item.x.is_finite()
                    || !item.y.is_finite()
                    || !(0.0..=16_384.0).contains(&item.x)
                    || !(0.0..=16_384.0).contains(&item.y)
                    || item.opacity > 100
                {
                    return Err("instancia inválida: identidad, posición u opacidad".into());
                }
            }
        }
        if !ids.contains(&self.active_layout) {
            return Err("layout activo no existe".into());
        }
        Ok(())
    }

    pub fn active(&self) -> Option<&Layout> {
        self.layouts
            .iter()
            .find(|layout| layout.id == self.active_layout)
    }

    fn active_mut(&mut self) -> Result<&mut Layout, String> {
        self.layouts
            .iter_mut()
            .find(|layout| layout.id == self.active_layout)
            .ok_or_else(|| "layout no existe".into())
    }
}

pub struct Editor {
    project: Project,
    undo: Vec<Project>,
    redo: Vec<Project>,
    pub selected: Option<u64>,
}

impl Editor {
    pub fn new(project: Project) -> Result<Self, String> {
        project.validate()?;
        Ok(Self {
            project,
            undo: vec![],
            redo: vec![],
            selected: None,
        })
    }
    pub fn project(&self) -> &Project {
        &self.project
    }
    pub fn selected(&self) -> Option<&Instance> {
        self.project
            .active()?
            .widgets
            .iter()
            .find(|item| Some(item.id) == self.selected)
    }

    fn change(
        &mut self,
        edit: impl FnOnce(&mut Project) -> Result<(), String>,
    ) -> Result<(), String> {
        let mut next = self.project.clone();
        edit(&mut next)?;
        next.validate()?;
        if next != self.project {
            if self.undo.len() == 50 {
                self.undo.remove(0);
            }
            self.undo.push(std::mem::replace(&mut self.project, next));
            self.redo.clear();
            self.reconcile_selection();
        }
        Ok(())
    }

    fn reconcile_selection(&mut self) {
        if self.selected().is_none() {
            self.selected = None;
        }
    }

    pub fn edit_selected(
        &mut self,
        spatial: bool,
        edit: impl FnOnce(&mut Instance),
    ) -> Result<(), String> {
        let id = self.selected.ok_or("selecciona una instancia")?;
        self.change(|project| {
            let layout = project.active_mut()?;
            let item = layout
                .widgets
                .iter_mut()
                .find(|item| item.id == id)
                .ok_or("instancia no existe")?;
            if spatial && item.locked {
                return Err("instancia bloqueada".into());
            }
            edit(item);
            Ok(())
        })
    }

    pub fn add(&mut self, kind: Kind) -> Result<(), String> {
        let id = self
            .project
            .active()
            .ok_or("layout no existe")?
            .widgets
            .iter()
            .map(|item| item.id)
            .max()
            .unwrap_or(0)
            .checked_add(1)
            .ok_or("identidad agotada")?;
        self.change(|project| {
            let layout = project.active_mut()?;
            layout.widgets.push(Instance {
                id,
                widget: kind.name().into(),
                x: 20.0,
                y: 20.0,
                visible: true,
                locked: false,
                opacity: 100,
                session: SessionFilter::Any,
                imperial: false,
                english: false,
            });
            Ok(())
        })?;
        self.selected = Some(id);
        Ok(())
    }

    pub fn remove(&mut self) -> Result<(), String> {
        let item = self.selected().ok_or("selecciona una instancia")?;
        if item.locked {
            return Err("instancia bloqueada".into());
        }
        let id = item.id;
        self.change(|project| {
            let layout = project.active_mut()?;
            layout.widgets.retain(|item| item.id != id);
            Ok(())
        })
    }

    pub fn front(&mut self) -> Result<(), String> {
        let item = self.selected().ok_or("selecciona una instancia")?;
        if item.locked {
            return Err("instancia bloqueada".into());
        }
        let id = item.id;
        self.change(|project| {
            let layout = project.active_mut()?;
            let index = layout
                .widgets
                .iter()
                .position(|item| item.id == id)
                .ok_or("instancia no existe")?;
            let item = layout.widgets.remove(index);
            layout.widgets.push(item);
            Ok(())
        })
    }

    pub fn new_layout(&mut self, duplicate: bool) -> Result<(), String> {
        self.change(|project| {
            let id = project
                .layouts
                .iter()
                .map(|layout| layout.id)
                .max()
                .unwrap_or(0)
                .checked_add(1)
                .ok_or("identidad agotada")?;
            let mut layout = project.active().ok_or("layout no existe")?.clone();
            layout.id = id;
            layout.name = format!("Layout {id}");
            if !duplicate {
                layout.widgets.clear();
            }
            project.layouts.push(layout);
            project.active_layout = id;
            Ok(())
        })
    }

    pub fn next_layout(&mut self) -> Result<(), String> {
        self.change(|project| {
            let index = project
                .layouts
                .iter()
                .position(|layout| layout.id == project.active_layout)
                .ok_or("layout no existe")?;
            project.active_layout = project.layouts[(index + 1) % project.layouts.len()].id;
            Ok(())
        })?;
        self.selected = None;
        Ok(())
    }

    pub fn undo(&mut self) {
        if let Some(previous) = self.undo.pop() {
            self.redo
                .push(std::mem::replace(&mut self.project, previous));
            self.reconcile_selection();
        }
    }
    pub fn redo(&mut self) {
        if let Some(next) = self.redo.pop() {
            self.undo.push(std::mem::replace(&mut self.project, next));
            self.reconcile_selection();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn editing_roundtrips_without_losing_behavior_or_appearance_and_lock_blocks_moves() {
        let mut editor = Editor::new(Project::default()).expect("proyecto");
        editor.add(Kind::Radar).expect("añadir");
        editor
            .edit_selected(true, |item| {
                item.x = 80.0;
                item.y = 120.0;
            })
            .expect("mover");
        editor
            .edit_selected(false, |item| {
                item.opacity = 75;
                item.session = SessionFilter::Race;
                item.locked = true;
            })
            .expect("inspector");
        let before = editor.project().clone();
        assert!(editor.edit_selected(true, |item| item.x = 100.0).is_err());
        assert_eq!(editor.project(), &before);
        let json = serde_json::to_vec(&before).expect("guardar");
        let loaded: Project = serde_json::from_slice(&json).expect("cargar");
        assert_eq!(loaded, before);
        editor.undo();
        assert!(!editor.selected().expect("selección").locked);
        editor.redo();
        assert_eq!(editor.project(), &before);
        assert!(editor.remove().is_err());
    }

    #[test]
    fn invalid_edits_are_transactional_layouts_are_independent_and_undo_handles_selection() {
        let mut editor = Editor::new(Project::default()).expect("proyecto");
        editor.add(Kind::Standings).expect("añadir");
        let original = editor.project().clone();
        assert!(
            editor
                .edit_selected(true, |item| item.x = f32::NAN)
                .is_err()
        );
        assert_eq!(editor.project(), &original);
        editor.new_layout(true).expect("duplicar layout");
        editor
            .edit_selected(true, |item| item.x = 99.0)
            .expect("editar copia");
        assert_eq!(editor.project().layouts[0], original.layouts[0]);
        editor.next_layout().expect("cambiar");
        assert!(editor.selected().is_none());
        editor.selected = Some(1);
        editor.remove().expect("eliminar");
        assert!(editor.selected().is_none());
        editor.undo();
        assert_eq!(editor.project().active().expect("layout").widgets.len(), 1);
        let mut invalid = original;
        invalid.layouts[0].widgets[0].widget = "not-installed".into();
        assert!(Editor::new(invalid).is_err());
    }

    #[test]
    fn session_filters_do_not_treat_stale_or_absent_data_as_race() {
        let mut snapshot = Snapshot::default();
        assert!(SessionFilter::Any.allows(&snapshot));
        assert!(!SessionFilter::Race.allows(&snapshot));
        snapshot.state.session.kind = vantare_domain::Quality::Stale(SessionKind::Race);
        assert!(!SessionFilter::Race.allows(&snapshot));
        snapshot.state.session.kind = vantare_domain::Quality::Reliable(SessionKind::Race);
        assert!(SessionFilter::Race.allows(&snapshot));
    }
}
