//! Unión de las dos piezas en el documento, con posiciones independientes.
use vantare_ui::{Settings, layout::Layout};

pub(crate) fn synchronize(layout: &mut Layout, previous: &Layout) {
    // Editar el contenido desde la mini actualiza también el aviso.
    let edits: Vec<_> = layout
        .instances
        .iter()
        .filter_map(|item| {
            let Settings::SessionAlerts(settings) = &item.settings else {
                return None;
            };
            let parent = settings.companion_for.as_ref()?;
            let old = previous.instances.iter().find(|p| p.id == item.id)?;
            if old.settings == item.settings {
                return None;
            }
            let mut settings = settings.clone();
            settings.companion_for = None;
            Some((parent.clone(), settings))
        })
        .collect();
    for (parent, settings) in edits {
        if let Some(item) = layout.instances.iter_mut().find(|i| i.id == parent) {
            item.settings = Settings::SessionAlerts(settings);
        }
    }
    let parents: Vec<_> = layout
        .instances
        .iter()
        .filter_map(|i| match &i.settings {
            Settings::SessionAlerts(s) if s.companion_for.is_none() => Some((i.clone(), s.clone())),
            _ => None,
        })
        .collect();
    layout.instances.retain(|i| {
        !matches!(&i.settings, Settings::SessionAlerts(s)
        if s.companion_for.as_ref().is_some_and(|id| !parents.iter().any(|(p,_)| &p.id == id)))
    });
    for (parent, mut settings) in parents {
        settings.companion_for = Some(parent.id.clone());
        if let Some(mini) = layout.instances.iter_mut().find(|i| {
            matches!(&i.settings,
            Settings::SessionAlerts(s) if s.companion_for.as_ref()==Some(&parent.id))
        }) {
            mini.settings = Settings::SessionAlerts(settings);
            mini.visible = parent.visible;
            mini.show_in = parent.show_in;
            mini.off_track = parent.off_track;
            mini.opacity = parent.opacity;
        } else {
            let mut mini = parent.clone();
            mini.id = format!("{}-mini", parent.id);
            if layout.instances.iter().any(|i| i.id == mini.id) {
                continue;
            }
            let width = layout.canvas_resolution.map_or(1920.0, |c| c.width);
            mini.x = width - 226.0;
            mini.y = 92.0;
            mini.geometry = vantare_ui::geometry::Geometry::default();
            mini.settings = Settings::SessionAlerts(settings);
            layout.instances.push(mini);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document::{Editor, tests::File};
    use vantare_ui::Kind;
    #[test]
    #[allow(clippy::float_cmp)] // Coordenadas enteras exactas, sin operaciones fraccionarias.
    fn two_regions_share_settings_but_move_independently_and_undo_together() {
        let file = File::new();
        let mut editor = Editor::open(file.path.clone()).expect("editor");
        editor
            .add_at(Kind::SessionAlerts, (732.0, 232.0))
            .expect("añadir");
        assert_eq!(editor.layout().instances.len(), 2);
        let main = editor.selected.clone().expect("seleccionado");
        let mini = editor.layout().instances[1].id.clone();
        assert_eq!(editor.layout().instances[1].y, 92.0);
        editor.selected = Some(mini.clone());
        editor
            .edit_selected(|i| {
                i.x = 1400.0;
                i.y = 100.0;
            })
            .expect("mover mini");
        assert_eq!(editor.layout().instances[0].x, 732.0);
        editor
            .edit_selected(|i| {
                if let Settings::SessionAlerts(s) = &mut i.settings {
                    s.sound = false;
                    s.duration_seconds = 12;
                }
            })
            .expect("ajustar");
        for item in &editor.layout().instances {
            let Settings::SessionAlerts(s) = &item.settings else {
                panic!("tipo");
            };
            assert!(!s.sound);
            assert_eq!(s.duration_seconds, 12);
        }
        assert_eq!(editor.layout().instances[1].x, 1400.0);
        editor.selected = Some(main);
        editor.duplicate().expect("duplicar conjunto");
        assert_eq!(editor.layout().instances.len(), 4);
        editor.undo().expect("deshacer duplicado");
        assert_eq!(editor.layout().instances.len(), 2);
        editor.selected = Some(mini);
        editor.remove().expect("borrar conjunto");
        assert!(editor.layout().instances.is_empty());
        editor.undo().expect("recuperar");
        assert_eq!(editor.layout().instances.len(), 2);
    }
}
