//! Bootstrap is consumed before Rune or any worker can start a thread.
use std::io;
pub enum Bootstrap {
    Host {
        name: String,
        token: String,
    },
    #[cfg(debug_assertions)]
    Scene(String),
}
fn hex64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn validate(name: &str, token: &str) -> io::Result<()> {
    if !name.strip_prefix("vantare-hub-ui-").is_some_and(hex64) || !hex64(token) {
        return Err(io::ErrorKind::PermissionDenied.into());
    }
    Ok(())
}
pub fn consume() -> io::Result<Bootstrap> {
    let name = std::env::var("VANTARE_HUB_PIPE").ok();
    let token = std::env::var("VANTARE_HUB_TOKEN").ok();
    // SAFETY: main calls this before constructing Rune, spawning workers or tests.
    unsafe {
        std::env::remove_var("VANTARE_HUB_PIPE");
        std::env::remove_var("VANTARE_HUB_TOKEN");
    }
    #[cfg(debug_assertions)]
    if std::env::var("VANTARE_HUB_HOST").as_deref() == Ok("mock") {
        let scene = std::env::var("VANTARE_HUB_SCENE").unwrap_or_else(|_| "ajustes-base".into());
        if ![
            "ajustes-base",
            "core-offline",
            "core-connected",
            "roadmap-base",
            "roadmap-published",
            "roadmap-error",
        ]
        .contains(&scene.as_str())
        {
            return Err(io::ErrorKind::InvalidInput.into());
        }
        return Ok(Bootstrap::Scene(scene));
    }
    let (name, token) = name.zip(token).ok_or(io::ErrorKind::PermissionDenied)?;
    validate(&name, &token)?;
    Ok(Bootstrap::Host { name, token })
}
pub fn arguments(args: impl IntoIterator<Item = String>) -> io::Result<Vec<String>> {
    let mut result = Vec::new();
    let mut args = args.into_iter();
    while let Some(arg) = args.next() {
        let (flag, inline) = arg
            .split_once('=')
            .map_or((arg.as_str(), None), |(a, b)| (a, Some(b)));
        if [
            "--remote-debugging-port",
            "--remote-debugging-address",
            "--force-device-scale-factor",
        ]
        .contains(&flag)
        {
            let value = inline
                .map(str::to_owned)
                .or_else(|| args.next())
                .ok_or(io::ErrorKind::InvalidInput)?;
            let valid = match flag {
                "--remote-debugging-port" => value.parse::<u16>().is_ok(),
                "--remote-debugging-address" => value == "127.0.0.1",
                _ => ["1", "1.25", "1.5"].contains(&value.as_str()),
            };
            if !valid {
                return Err(io::ErrorKind::InvalidInput.into());
            }
        } else if cfg!(all(debug_assertions, target_os = "macos"))
            && [
                "--snap", "--frames", "--scene", "--size", "--scale", "--out", "--theme",
            ]
            .contains(&flag)
        {
            if inline.is_some() {
                result.push(arg);
            } else {
                result.push(arg);
                result.push(args.next().ok_or(io::ErrorKind::InvalidInput)?);
            }
        } else {
            return Err(io::ErrorKind::InvalidInput.into());
        }
    }
    Ok(result)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_arbitrary_pipe_names_and_tokens() {
        let hex = "a".repeat(64);
        assert!(validate(&format!("vantare-hub-ui-{hex}"), &hex).is_ok());
        for name in [r"\\server\pipe\x", "vantare-hub-ui-", "../x"] {
            assert!(validate(name, &hex).is_err());
        }
        assert!(validate(&format!("vantare-hub-ui-{hex}"), &"A".repeat(64)).is_err());
    }
    #[test]
    fn accepts_only_the_three_host_qa_flags() {
        assert!(
            arguments(
                [
                    "--remote-debugging-port=0",
                    "--remote-debugging-address=127.0.0.1",
                    "--force-device-scale-factor=1.25"
                ]
                .map(str::to_owned)
            )
            .unwrap()
            .is_empty()
        );
        for arg in [
            "--unknown",
            "--remote-debugging-address=0.0.0.0",
            "--force-device-scale-factor=100",
        ] {
            assert!(arguments([arg.to_owned()]).is_err());
        }
    }
}
