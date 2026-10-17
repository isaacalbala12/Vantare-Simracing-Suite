//! Estados de QA del diseño existente; sin red ni persistencia.
use super::{Draft, view::PilotEditor};
use base64::{Engine, engine::general_purpose::STANDARD};
use gpui::{Context, Entity, Window};
use std::sync::Arc;

pub(crate) fn configure(editor: &Entity<PilotEditor>, window: &mut Window, cx: &mut gpui::App) {
    let scene = crate::capture::current_name(cx).map(str::to_owned);
    let scene = scene.as_deref();
    if !matches!(
        scene,
        Some("ajustes-perfil-foto" | "ajustes-perfil-recorte")
    ) {
        return;
    }
    let bytes = STANDARD.decode("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").expect("PNG QA fijo");
    editor.update(cx, |editor, cx: &mut Context<PilotEditor>| {
        editor.load(
            Draft {
                public_name: "Piloto QA".into(),
                description: "Ejemplo de perfil privado del piloto".into(),
                country: Some("ES".into()),
                simulators: vec!["lmu".into(), "acc".into()],
                favorite_car: "Porsche 911 GT3 R".into(),
                favorite_team: "Equipo QA".into(),
            },
            cx,
        );
        if scene == Some("ajustes-perfil-recorte") {
            editor.begin_crop(
                Arc::new(gpui::Image::from_bytes(gpui::ImageFormat::Png, bytes)),
                600,
                300,
                window,
                cx,
            );
        } else {
            let photo = vantare_services::pilot::crop_photo(
                &bytes,
                vantare_services::pilot::Crop {
                    x: 0.25,
                    y: 0.0,
                    size: 1.0,
                },
            )
            .expect("recorte QA válido");
            let jpeg = STANDARD.decode(photo.jpeg).expect("JPEG QA");
            let image = Arc::new(gpui::Image::from_bytes(gpui::ImageFormat::Jpeg, jpeg));
            editor.set_photo(Some(image.clone()), cx);
            assert!(editor.dirty(cx), "solo foto activa Guardar");
            editor.discard_changes(cx);
            assert!(!editor.dirty(cx), "Descartar restaura el perfil");
            editor.set_saved_photo(Some(image), cx);
        }
        editor.set_status(Some("Ejemplo de captura · datos ficticios".into()), cx);
    });
}
