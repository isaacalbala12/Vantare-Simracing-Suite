//! Compila exclusivamente valores; no genera un renderer ni interpreta instrucciones.
use std::{env, fmt::Write, fs, path::PathBuf};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    if env::var_os("CARGO_FEATURE_PAINT_STATS").is_some() {
        measurement_provenance()?;
    }
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

fn measurement_provenance() -> Result<(), Box<dyn std::error::Error>> {
    let manifest = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").ok_or("manifest ausente")?);
    let output = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(&manifest)
        .output()?;
    if !output.status.success() {
        return Err("cannot identify compiled source".into());
    }
    let sha = String::from_utf8(output.stdout)?.trim().to_owned();
    let git_path = std::process::Command::new("git")
        .args(["rev-parse", "--git-path", "HEAD"])
        .current_dir(&manifest)
        .output()?;
    println!(
        "cargo:rerun-if-changed={}",
        manifest
            .join(String::from_utf8(git_path.stdout)?.trim())
            .display()
    );
    let git_ref = std::process::Command::new("git")
        .args(["symbolic-ref", "-q", "HEAD"])
        .current_dir(&manifest)
        .output()?;
    if git_ref.status.success() {
        let path = std::process::Command::new("git")
            .args([
                "rev-parse",
                "--git-path",
                String::from_utf8(git_ref.stdout)?.trim(),
            ])
            .current_dir(&manifest)
            .output()?;
        println!(
            "cargo:rerun-if-changed={}",
            manifest
                .join(String::from_utf8(path.stdout)?.trim())
                .display()
        );
    }
    let mut features: Vec<_> = env::vars()
        .filter_map(|(k, _)| k.strip_prefix("CARGO_FEATURE_").map(str::to_owned))
        .collect();
    features.sort();
    let provenance = serde_json::json!({"sha":sha,"profile":env::var("PROFILE")?,"opt_level":env::var("OPT_LEVEL")?,"debug":env::var("DEBUG")?,"features":features,
        "release_options":"Cargo distribution defaults: opt-level=3, lto=false, codegen-units=16; no measurement override"});
    println!("cargo:rustc-env=VANTARE_MEASUREMENT_BUILD={provenance}");
    Ok(())
}
