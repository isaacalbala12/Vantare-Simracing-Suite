//! Record the renderer's own revision without adding a build dependency.
use std::process::Command;
fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_owned())
}
fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    for suffix in ["HEAD", "packed-refs"] {
        if let Some(path) = git(&["rev-parse", "--git-path", suffix]) {
            println!("cargo:rerun-if-changed={path}");
        }
    }
    if let Some(branch) = git(&["symbolic-ref", "-q", "HEAD"])
        && let Some(path) = git(&["rev-parse", "--git-path", &branch])
    {
        println!("cargo:rerun-if-changed={path}");
    }
    let commit = git(&["rev-parse", "HEAD"])
        .filter(|s| s.len() == 40 && s.bytes().all(|b| b.is_ascii_hexdigit()))
        .unwrap_or_else(|| "unknown".into());
    println!("cargo:rustc-env=VANTARE_OVERLAYS_COMMIT={commit}");
}
