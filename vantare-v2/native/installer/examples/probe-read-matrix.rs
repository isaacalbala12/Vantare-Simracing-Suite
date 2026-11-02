//! Test-only adapter: never packaged or used by Setup. OS context is produced
//! by the guarded matrix's real driver, then completed by the product reader.
use std::{
    io::{self, Read},
    path::Path,
};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    if let [flag, channel] = args.as_slice()
        && flag == "--members"
        && vantare_installer::engine::validation::channel(channel)
    {
        println!(
            "{}",
            serde_json::to_string(&vantare_installer::engine::known_members(channel))?
        );
        return Ok(());
    }
    let (uninstall, outcome, reader) = match args.as_slice() {
        [] => (false, false, false),
        [flag] if flag == "--uninstall" => (true, false, false),
        [flag] if flag == "--outcome" => (false, true, false),
        [flag] if flag == "--reader" => (false, true, true),
        [flag, mode] if flag == "--uninstall" && mode == "--outcome" => (true, true, false),
        _ => return Err("unexpected matrix arguments".into()),
    };
    let mut bytes = Vec::new();
    io::stdin().take(65537).read_to_end(&mut bytes)?;
    if bytes.len() > 65536 {
        return Err("matrix context too large".into());
    }
    let info: vantare_installer::model::Info = serde_json::from_slice(&bytes)?;
    guard_root(&info.root)?;
    match read(info, uninstall, reader) {
        Ok(value) => println!("{}", serde_json::to_string(&value)?),
        Err(error) => {
            if outcome {
                use vantare_installer::engine::ReadError;
                let reason = match &error {
                    ReadError::Rejected(reason) => reason.code(),
                    ReadError::Json(_) => "json",
                    ReadError::Io(error) if error.kind() == io::ErrorKind::NotFound => {
                        "io-not-found"
                    }
                    _ => "unclassified",
                };
                println!("{}", serde_json::json!({"rejected":reason}));
            }
            return Err(error.into());
        }
    }
    Ok(())
}

fn read(
    info: vantare_installer::model::Info,
    uninstall: bool,
    reader: bool,
) -> Result<serde_json::Value, vantare_installer::engine::ReadError> {
    use vantare_installer::engine::{Installation, ReadError, ReadProfile, complete_probe};
    if reader {
        let installation = Installation::read(&info.root, ReadProfile::Probe)?;
        return Ok(
            serde_json::json!({"version":installation.installed_version(),
            "channel":installation.manifest.as_ref().map(|manifest| manifest.channel.as_str())}),
        );
    }
    serde_json::to_value(complete_probe(info, uninstall)?).map_err(ReadError::Json)
}

fn guard_root(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if !path.is_absolute()
        || path.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir | std::path::Component::CurDir
            )
        })
    {
        return Err("matrix root rejected".into());
    }
    // The caller also applies guard.ps1 before spawning. This adapter can only
    // read the explicitly supplied QA root, never discover a user installation.
    let root = path
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
    Ok(())
}
