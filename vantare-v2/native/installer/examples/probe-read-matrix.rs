//! Test-only adapter: never packaged or used by Setup. OS context is produced
//! by the guarded matrix's real driver, then completed by the product reader.
use std::{
    io::{self, Read},
    path::Path,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let uninstall = match args.as_slice() {
        [] => false,
        [flag] if flag == "--uninstall" => true,
        _ => return Err("unexpected matrix arguments".into()),
    };
    let mut bytes = Vec::new();
    io::stdin().take(65537).read_to_end(&mut bytes)?;
    if bytes.len() > 65536 {
        return Err("matrix context too large".into());
    }
    let info: vantare_installer::model::Info = serde_json::from_slice(&bytes)?;
    // The caller also applies guard.ps1 before spawning. This adapter can only
    // read the explicitly supplied QA root, never discover a user installation.
    let root = info
        .root
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    let ci_root = std::env::var_os("RUNNER_TEMP").map(|p| {
        Path::new(&p)
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase()
    });
    if !(root.starts_with("d:/vantareserver/qa/")
        || (std::env::var("CI").as_deref() == Ok("true")
            && ci_root.is_some_and(|prefix| {
                root.starts_with(&(prefix.trim_end_matches('/').to_owned() + "/"))
            })))
    {
        return Err("matrix root rejected".into());
    }
    println!(
        "{}",
        serde_json::to_string(&vantare_installer::engine::complete_probe(info, uninstall)?)?
    );
    Ok(())
}
