//! Editor en memoria con la forma del layout acordado; la autoridad será `ui::layout`.
use serde::{Deserialize, Serialize};
use vantare_ui::Kind;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Instance {
    pub id: String,
    pub x: f32,
    pub y: f32,
    pub visible: bool,
    pub opacity: f32,
    // Puente opaco, conserva kind y todas sus opciones 1:1. No se escribe en disco.
    // TODO(ISA-1430): sustituir por vantare_ui::Settings al integrar fase 2.
    pub settings: serde_json::Value,
}

impl Instance {
    pub fn kind(&self) -> Result<Kind, String> {
        self.settings
            .get("kind")
            .and_then(serde_json::Value::as_str)
            .ok_or("settings sin kind")?
            .parse()
            .map_err(|()| "kind desconocido".into())
    }
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Layout {
    pub version: u32,
    /// Coordenadas globales; orden del vector = orden de pintado.
    pub instances: Vec<Instance>,
}

impl Default for Layout {
    fn default() -> Self {
        Self {
            version: 1,
            instances: vec![],
        }
    }
}
impl Layout {
    pub fn validate(&self) -> Result<(), String> {
        if self.version != 1 {
            return Err("versión de layout desconocida".into());
        }
        let mut ids = std::collections::HashSet::new();
        for item in &self.instances {
            item.kind()?;
            if item.id.trim().is_empty()
                || !ids.insert(&item.id)
                || !item.x.is_finite()
                || !item.y.is_finite()
                || !item.opacity.is_finite()
                || !(0.0..=1.0).contains(&item.opacity)
            {
                return Err("instancia inválida: identidad, posición u opacidad".into());
            }
        }
        Ok(())
    }
}

/// TODO(ISA-1430): delegar a `vantare_ui::layout::Document::open(default_path())`.
/// Mientras falta esa API, solo preview vacía; NO leer ni migrar otro documento.
pub fn load() -> Layout {
    Layout::default()
}

/// TODO(ISA-1430): delegar a `vantare_ui::layout::Document::save` en cada edición.
pub fn save(_layout: &Layout) -> Result<(), String> {
    Err("Guardado bloqueado hasta integrar vantare_ui::layout; solo preview en memoria".into())
}

pub struct Editor {
    layout: Layout,
    undo: Vec<Layout>,
    redo: Vec<Layout>,
    pub selected: Option<String>,
}
impl Editor {
    pub fn new(layout: Layout) -> Result<Self, String> {
        layout.validate()?;
        Ok(Self {
            layout,
            undo: vec![],
            redo: vec![],
            selected: None,
        })
    }
    pub fn layout(&self) -> &Layout {
        &self.layout
    }
    pub fn selected(&self) -> Option<&Instance> {
        self.layout
            .instances
            .iter()
            .find(|item| Some(&item.id) == self.selected.as_ref())
    }
    fn change(
        &mut self,
        edit: impl FnOnce(&mut Layout) -> Result<(), String>,
    ) -> Result<(), String> {
        let mut next = self.layout.clone();
        edit(&mut next)?;
        next.validate()?;
        if next != self.layout {
            if self.undo.len() == 50 {
                self.undo.remove(0);
            }
            self.undo.push(std::mem::replace(&mut self.layout, next));
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
    pub fn edit_selected(&mut self, edit: impl FnOnce(&mut Instance)) -> Result<(), String> {
        let id = self.selected.clone().ok_or("selecciona una instancia")?;
        self.change(|layout| {
            let item = layout
                .instances
                .iter_mut()
                .find(|item| item.id == id)
                .ok_or("instancia no existe")?;
            edit(item);
            Ok(())
        })
    }
    pub fn add(&mut self, kind: Kind) -> Result<(), String> {
        let id = (1..=self.layout.instances.len().saturating_add(1))
            .map(|number| format!("widget-{number}"))
            .find(|id| self.layout.instances.iter().all(|item| item.id != *id))
            .ok_or("identidad agotada")?;
        self.change(|layout| {
            layout.instances.push(Instance {
                id: id.clone(),
                x: 20.0,
                y: 20.0,
                visible: true,
                opacity: 1.0,
                settings: serde_json::json!({"kind":kind.name()}),
            });
            Ok(())
        })?;
        self.selected = Some(id);
        Ok(())
    }
    pub fn remove(&mut self) -> Result<(), String> {
        let id = self.selected.clone().ok_or("selecciona una instancia")?;
        self.change(|layout| {
            layout.instances.retain(|item| item.id != id);
            Ok(())
        })
    }
    pub fn front(&mut self) -> Result<(), String> {
        let id = self.selected.clone().ok_or("selecciona una instancia")?;
        self.change(|layout| {
            let index = layout
                .instances
                .iter()
                .position(|item| item.id == id)
                .ok_or("instancia no existe")?;
            let item = layout.instances.remove(index);
            layout.instances.push(item);
            Ok(())
        })
    }
    pub fn undo(&mut self) {
        if let Some(previous) = self.undo.pop() {
            self.redo
                .push(std::mem::replace(&mut self.layout, previous));
            self.reconcile_selection();
        }
    }
    pub fn redo(&mut self) {
        if let Some(next) = self.redo.pop() {
            self.undo.push(std::mem::replace(&mut self.layout, next));
            self.reconcile_selection();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn settings_and_desktop_coordinates_roundtrip_and_edits_are_transactional() {
        let mut editor = Editor::new(load()).expect("editor");
        editor.add(Kind::Standings).expect("añadir");
        editor
            .edit_selected(|item| {
                item.x = -1920.0;
                item.opacity = 0.75;
                item.settings["rowCount"] = serde_json::json!(8);
            })
            .expect("editar");
        let before = editor.layout().clone();
        assert!(editor.edit_selected(|item| item.x = f32::NAN).is_err());
        assert_eq!(editor.layout(), &before);
        let loaded: Layout =
            serde_json::from_slice(&serde_json::to_vec(&before).expect("json")).expect("leer");
        assert_eq!(loaded, before);
        editor.undo();
        editor.redo();
        assert_eq!(editor.layout(), &before);
        assert!(save(&before).is_err());
    }
    #[test]
    fn paint_order_and_selection_survive_undo_redo() {
        let mut editor = Editor::new(load()).expect("editor");
        editor.add(Kind::Radar).expect("radar");
        let radar = editor.selected.clone();
        editor.add(Kind::Standings).expect("standings");
        editor.selected = radar.clone();
        editor.front().expect("frente");
        assert_eq!(
            editor.layout().instances.last().map(|item| &item.id),
            radar.as_ref()
        );
        editor.remove().expect("quitar");
        assert!(editor.selected.is_none());
        editor.undo();
        assert_eq!(editor.layout().instances.len(), 2);
        editor.redo();
        assert_eq!(editor.layout().instances.len(), 1);
    }
}
