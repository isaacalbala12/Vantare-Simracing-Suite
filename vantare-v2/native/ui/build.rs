//! Compila exclusivamente valores; no genera un renderer ni interpreta instrucciones.
use std::{env, fmt::Write, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    vantare_build_support::embed()?;
    println!("cargo:rerun-if-changed=styles/standings.json");
    let json: serde_json::Value =
        serde_json::from_str(&fs::read_to_string("styles/standings.json")?)?;
    let mut code = String::from("Style {\n");
    for (group, ty) in [
        ("colors", "Colors"),
        ("geometry", "Geometry"),
        ("fonts", "Fonts"),
        ("shadow", "Shadow"),
        ("opacity", "Opacity"),
    ] {
        let fields = json[group].as_object().ok_or("grupo de estilo ausente")?;
        writeln!(code, "{group}: {ty} {{")?;
        for (name, value) in fields {
            let literal = if group == "colors" {
                let text = value.as_str().ok_or("color no textual")?;
                let hex = text
                    .strip_prefix('#')
                    .filter(|s| s.len() == 6)
                    .ok_or("color no #rrggbb")?;
                format!("Color({})", u32::from_str_radix(hex, 16)?)
            } else if name == "family" {
                match value.as_str() {
                    Some(family) => format!("Some({family:?}.into())"),
                    None if value.is_null() => "None".into(),
                    None => return Err("family debe ser texto o null".into()),
                }
            } else {
                format!("{:?}_f32", value.as_f64().ok_or("valor no numérico")?)
            };
            writeln!(code, "{name}: {literal},")?;
        }
        code.push_str("},\n");
    }
    code.push('}');
    fs::write(
        PathBuf::from(env::var_os("OUT_DIR").ok_or("OUT_DIR ausente")?).join("standings-style.rs"),
        code,
    )?;
    Ok(())
}
