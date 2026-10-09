//! Editor del único documento compartido. Historial y selección pertenecen al Hub.
use std::path::PathBuf;
use vantare_ui::{
    Kind, Settings,
    layout::{Document, Instance, Layout},
};

pub struct Editor {
    document: Document,
    path: PathBuf,
    undo: Vec<Layout>,
    redo: Vec<Layout>,
    pub selected: Option<String>,
}
impl Editor {
    pub fn open(path: PathBuf) -> Result<Self, String> {
        if path.components().any(|part| {
            part.as_os_str()
                .to_string_lossy()
                .to_ascii_lowercase()
                .starts_with(".env")
        }) {
            return Err("archivo de entorno no permitido".into());
        }
        let document = Document::open(path.clone()).map_err(|error| error.to_string())?;
        Ok(Self {
            document,
            path,
            undo: vec![],
            redo: vec![],
            selected: None,
        })
    }
    pub fn initialize(&mut self, monitor: (f32, f32, f32, f32)) -> Result<(), String> {
        self.document
            .initialize(monitor)
            .map_err(|error| error.to_string())
    }
    pub fn layout(&self) -> &Layout {
        self.document.layout()
    }
    pub(crate) fn persist(&mut self) -> Result<(), String> {
        self.document
            .save(&self.layout().clone())
            .map_err(|error| error.to_string())
    }
    pub fn set_preferences(
        &mut self,
        preferences: vantare_domain::format::Preferences,
    ) -> Result<(), String> {
        self.change(|layout| {
            layout.preferences = preferences;
            Ok(())
        })
    }
    pub(crate) fn set_performance(
        &mut self,
        preferences: vantare_ui::performance::Preferences,
    ) -> Result<(), String> {
        self.change(|layout| {
            layout.performance = preferences;
            Ok(())
        })
    }
    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }
    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }
    pub fn duplicate(&mut self) -> Result<(), String> {
        let mut item = self.selected().cloned().ok_or("selecciona una instancia")?;
        let id = self.next_id()?;
        item.id.clone_from(&id);
        item.x += 20.0;
        item.y += 20.0;
        self.change(|layout| {
            layout.instances.push(item);
            Ok(())
        })?;
        self.selected = Some(id);
        Ok(())
    }
    fn next_id(&self) -> Result<String, String> {
        (1..=self.layout().instances.len().saturating_add(1))
            .map(|number| format!("widget-{number}"))
            .find(|id| self.layout().instances.iter().all(|item| item.id != *id))
            .ok_or_else(|| "identidad agotada".into())
    }
    pub fn back(&mut self) -> Result<(), String> {
        let id = self.selected.clone().ok_or("selecciona una instancia")?;
        self.change(|layout| {
            let index = layout
                .instances
                .iter()
                .position(|item| item.id == id)
                .ok_or("instancia no existe")?;
            let item = layout.instances.remove(index);
            layout.instances.insert(0, item);
            Ok(())
        })
    }
    pub fn selected(&self) -> Option<&Instance> {
        self.layout()
            .instances
            .iter()
            .find(|item| Some(&item.id) == self.selected.as_ref())
    }
    /// Recarga explícita: un fallo no sustituye el documento ni el historial.
    pub fn reload(&mut self) -> Result<(), String> {
        let document = Document::open(self.path.clone()).map_err(|error| error.to_string())?;
        self.document = document;
        self.undo.clear();
        self.redo.clear();
        self.reconcile_selection();
        Ok(())
    }
    fn change(
        &mut self,
        edit: impl FnOnce(&mut Layout) -> Result<(), String>,
    ) -> Result<(), String> {
        let previous = self.layout().clone();
        let mut next = previous.clone();
        edit(&mut next)?;
        // La API común normaliza documentos externos; una entrada interactiva no finita es un error.
        if next.instances.iter().any(|item| {
            !item.x.is_finite()
                || !item.y.is_finite()
                || !item.opacity.is_finite()
                || item.geometry.size.is_some_and(|s| !s.valid())
        }) {
            return Err("posición u opacidad no finita".into());
        }
        let next = next.normalized().map_err(|error| error.to_string())?;
        if next != previous {
            self.document
                .save(&next)
                .map_err(|error| error.to_string())?;
            if self.undo.len() == 50 {
                self.undo.remove(0);
            }
            self.undo.push(previous);
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
        let id = self.next_id()?;
        self.change(|layout| {
            layout.instances.push(Instance {
                geometry: vantare_ui::geometry::Geometry::default(),
                id: id.clone(),
                x: 20.0,
                y: 20.0,
                visible: true,
                opacity: 1.0,
                settings: Settings::default_for(kind),
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
            layout.performance.widgets.remove(&id);
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
    pub fn undo(&mut self) -> Result<(), String> {
        if let Some(previous) = self.undo.last() {
            let current = self.layout().clone();
            self.document
                .save(previous)
                .map_err(|error| error.to_string())?;
            let _ = self.undo.pop();
            self.redo.push(current);
            self.reconcile_selection();
        }
        Ok(())
    }
    pub fn redo(&mut self) -> Result<(), String> {
        if let Some(next) = self.redo.last() {
            let current = self.layout().clone();
            self.document
                .save(next)
                .map_err(|error| error.to_string())?;
            let _ = self.redo.pop();
            self.undo.push(current);
            self.reconcile_selection();
        }
        Ok(())
    }
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::{
        fs,
        sync::atomic::{AtomicU64, Ordering},
    };
    pub(crate) struct File {
        pub path: PathBuf,
    }
    impl File {
        pub(crate) fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "vantare-hub-layout-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&root).expect("temporal exclusivo");
            Self {
                path: root.join("layout.json"),
            }
        }
    }
    impl Drop for File {
        fn drop(&mut self) {
            for path in [
                &self.path,
                &self.path.with_extension("json.lock"),
                &self.path.with_extension("json.bak"),
            ] {
                if path.exists() {
                    fs::remove_file(path).expect("limpiar archivo propio");
                }
            }
            fs::remove_dir(self.path.parent().expect("directorio propio"))
                .expect("limpiar directorio propio");
        }
    }
    #[test]
    fn shared_document_roundtrip_and_undo_redo_are_durable() {
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(Kind::Standings).expect("añadir");
        editor
            .edit_selected(|item| {
                item.x = -1920.0;
                item.visible = false;
                item.opacity = 0.75;
                if let Settings::Standings(settings) = &mut item.settings {
                    settings.show_session_header = false;
                }
            })
            .expect("editar");
        let before = editor.layout().clone();
        assert!(editor.edit_selected(|item| item.x = f32::NAN).is_err());
        assert_eq!(editor.layout(), &before);
        assert_eq!(
            Document::open(file.path.clone())
                .expect("overlays")
                .layout(),
            &before
        );
        editor.undo().expect("deshacer");
        assert!(
            Document::open(file.path.clone())
                .expect("reabrir")
                .layout()
                .instances[0]
                .visible
        );
        editor.redo().expect("rehacer");
        assert_eq!(
            Document::open(file.path.clone())
                .expect("reiniciar")
                .layout(),
            &before
        );
    }

    #[test]
    fn performance_is_one_document_with_overlays_history_restart_and_conflict_protection() {
        use vantare_ui::performance::{Level, Preferences};
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("Hub");
        editor.add(Kind::Standings).expect("widget");
        let id = editor.selected.clone().expect("selección");
        let mut prefs = Preferences {
            level: Level::Minimum,
            ..Default::default()
        };
        prefs.widgets.insert(id.clone(), 4);
        editor.set_performance(prefs.clone()).expect("frecuencia");
        assert_eq!(
            Document::open(file.path.clone())
                .expect("overlays")
                .layout()
                .performance,
            prefs
        );
        assert_eq!(
            Editor::open(file.path.clone())
                .expect("reinicio")
                .layout()
                .performance,
            prefs
        );
        editor.undo().expect("deshacer");
        assert_eq!(editor.layout().performance, Preferences::default());
        editor.redo().expect("rehacer");
        assert_eq!(editor.layout().performance, prefs);
        let mut invalid = prefs.clone();
        invalid.widgets.insert(id, 1000);
        assert!(editor.set_performance(invalid).is_err());
        assert_eq!(editor.layout().performance, prefs);
        std::fs::write(&file.path, b"{}").expect("edición externa");
        assert!(editor.set_performance(Preferences::default()).is_err());
        assert_eq!(std::fs::read(&file.path).expect("leer externo"), b"{}");
    }
    #[test]
    fn explicit_save_preserves_history_and_rejects_external_edits() {
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("Hub");
        editor.add(Kind::Standings).expect("widget");
        let before = editor.layout().clone();
        editor.persist().expect("Ctrl S");
        assert_eq!(editor.layout(), &before);
        editor.undo().expect("guardar no añade historial");
        assert!(editor.layout().instances.is_empty());
        editor.redo().expect("rehacer");
        std::fs::write(&file.path, b"{}").expect("edición externa");
        assert!(editor.persist().is_err());
        assert_eq!(editor.layout(), &before);
        assert_eq!(std::fs::read(&file.path).expect("leer externo"), b"{}");
    }
    #[test]
    fn settings_use_the_shared_document_and_survive_edits_undo_and_restart() {
        use vantare_domain::format::{Language, Preferences, Units};
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("Hub");
        let prefs = Preferences {
            units: Units::Imperial,
            language: Language::En,
        };
        editor.set_preferences(prefs).expect("ajustes");
        editor.add(Kind::Pedals).expect("widget");
        editor.undo().expect("deshacer widget");
        assert_eq!(editor.layout().preferences, prefs);
        let reader = Document::open(file.path.clone()).expect("overlays");
        assert_eq!(reader.layout().preferences, prefs);
        assert_eq!(
            Editor::open(file.path.clone())
                .expect("reiniciar Hub")
                .layout()
                .preferences,
            prefs
        );
        editor.undo().expect("deshacer ajustes");
        assert_eq!(editor.layout().preferences, Preferences::default());
        editor.redo().expect("rehacer ajustes");
        assert_eq!(editor.layout().preferences, prefs);
    }
    #[test]
    fn conflict_preserves_selection_history_and_external_bytes_until_reload() {
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor.add(Kind::Radar).expect("añadir");
        let before = editor.layout().clone();
        let selection = editor.selected.clone();
        let mut other = Document::open(file.path.clone()).expect("otro editor");
        let mut external = before.clone();
        external.instances[0].x = 200.0;
        other.save(&external).expect("editar fuera");
        let bytes = fs::read(&file.path).expect("bytes externos");
        assert!(editor.edit_selected(|item| item.visible = false).is_err());
        assert!(editor.undo().is_err());
        assert_eq!(editor.layout(), &before);
        assert_eq!(editor.selected, selection);
        assert_eq!(fs::read(&file.path).expect("no sobrescrito"), bytes);
        editor.reload().expect("recargar");
        assert_eq!(editor.layout(), &external);
        editor.undo().expect("historial descartado");
        assert_eq!(editor.layout(), &external);
        editor
            .edit_selected(|item| item.visible = false)
            .expect("continuar");
        assert!(
            !Document::open(file.path.clone())
                .expect("durable")
                .layout()
                .instances[0]
                .visible
        );
        fs::write(&file.path, b"{").expect("documento corrupto externo");
        let valid = editor.layout().clone();
        assert!(editor.reload().is_err());
        assert_eq!(editor.layout(), &valid);
    }
    #[test]
    fn duplicate_is_durable_unique_and_one_history_entry() {
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        assert!(!editor.can_undo());
        assert!(editor.duplicate().is_err());
        editor.add(Kind::Radar).expect("añadir");
        let original = editor.layout().clone();
        editor.duplicate().expect("duplicar");
        let duplicate = editor.selected().cloned().expect("duplicado");
        assert_ne!(duplicate.id, original.instances[0].id);
        assert_eq!(duplicate.settings, original.instances[0].settings);
        assert_eq!(
            duplicate.x.to_bits(),
            (original.instances[0].x + 20.0).to_bits()
        );
        assert_eq!(
            Document::open(file.path.clone()).expect("reabrir").layout(),
            editor.layout()
        );
        editor.undo().expect("deshacer duplicado");
        assert_eq!(editor.layout(), &original);
        assert!(editor.can_redo());
        editor.redo().expect("rehacer");
        editor.selected = Some(duplicate.id.clone());
        editor.back().expect("fondo");
        assert_eq!(editor.layout().instances[0].id, duplicate.id);
        editor.undo().expect("deshacer orden");
        assert_eq!(editor.layout().instances[1].id, duplicate.id);
    }
    #[test]
    fn paint_order_and_selection_survive_undo_redo() {
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
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
        editor.undo().expect("deshacer");
        assert_eq!(editor.layout().instances.len(), 2);
        editor.redo().expect("rehacer");
        assert_eq!(editor.layout().instances.len(), 1);
    }
}
