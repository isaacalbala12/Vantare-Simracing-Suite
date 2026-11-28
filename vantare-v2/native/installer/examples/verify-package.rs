//! Repository packaging tool: use Setup's authenticated extractor unchanged.
//!
//! `--capacity ZIP` only prints the sizes that `expand` limits, next to the
//! limits compiled into it, so the packaging gate never keeps its own copy.
use std::{env, path::PathBuf};
use vantare_installer::engine::{package, write_fs};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = env::args_os().skip(1).collect();
    if args.len() == 2 && args[0] == "--capacity" {
        let measured = package::Capacity::read(&PathBuf::from(&args[1]))?;
        println!(
            "{{\"compressed\":{},\"compressed_limit\":{},\"expanded\":{},\"expanded_limit\":{},\"largest\":{},\"largest_limit\":{}}}",
            measured.compressed,
            package::COMPRESSED_LIMIT,
            measured.expanded,
            package::EXPANDED_LIMIT,
            measured.largest,
            package::MEMBER_LIMIT
        );
        return Ok(());
    }
    if args.len() != 4 {
        return Err("usage: verify-package ZIP SHA256 VERSION CHANNEL | --capacity ZIP".into());
    }
    let archive = PathBuf::from(&args[0]);
    let sha = args[1].to_str().ok_or("invalid SHA")?;
    let version = args[2].to_str().ok_or("invalid version")?;
    let channel = args[3].to_str().ok_or("invalid channel")?;
    let parent = archive.parent().ok_or("ZIP needs a parent")?;
    let destination = parent.join(format!(".verify-package-{}", write_fs::id()?));
    let result = package::expand(&archive, sha, &destination, channel).and_then(|manifest| {
        write_fs::ensure(
            manifest.version == version && manifest.engine() == 2,
            "Versión o motor del paquete incompatible",
        )
    });
    let cleanup = write_fs::remove_owned_tree(parent, &destination);
    result?;
    cleanup?;
    Ok(())
}
