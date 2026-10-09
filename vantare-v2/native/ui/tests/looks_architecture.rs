//! Los Looks nuevos no deben introducir ramas de estilo en consumidores o domain.
use std::{fs, path::Path};
fn check(path: &Path, allowed: bool) {
    if path.is_dir() {
        for entry in fs::read_dir(path).expect("directorio de fuentes") {
            let path = entry.expect("archivo").path();
            let name = path.file_name().expect("nombre").to_string_lossy();
            check(
                &path,
                allowed
                    || ["standings", "relative", "delta", "fuel_strategy"].contains(&name.as_ref()),
            );
        }
    } else if path.extension().is_some_and(|e| e == "rs")
        && !allowed
        && path.file_name().is_none_or(|n| n != "look.rs")
    {
        let source = fs::read_to_string(path).expect("fuente UTF-8");
        let production = source.split("#[cfg(test)]").next().expect("fuente");
        for look in vantare_ui::look::Look::ALL {
            for type_name in ["DesignSystem", "Look"] {
                let token = format!("{type_name}::{look:?}");
                assert!(
                    !production.contains(&token),
                    "{}: estilo concreto fuera del módulo: {token}",
                    path.display()
                );
            }
        }
    }
}
#[test]
fn concrete_looks_are_confined_to_widget_ui_and_look_rs() {
    let native = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("native");
    check(&native.join("ui/src"), false);
    check(&native.join("hub/src"), false);
    check(&native.join("domain/src"), false);
}
