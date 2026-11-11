pub(crate) fn enum_body<'a>(source: &'a str, name: &str) -> Option<&'a str> {
    let marker = format!("pub enum {name} {{");
    let begin = source.find(&marker)? + marker.len();
    // wire.rs uses rustfmt's top-level enum layout. Nested fields and strings
    // cannot end a declaration at column zero; the Rust compiler checks syntax.
    let end = source[begin..]
        .find("\n}")
        .expect("top-level enum closing brace");
    Some(&source[begin..begin + end])
}

pub(crate) fn variant_names(body: &str) -> Vec<&str> {
    body.lines()
        .filter(|line| line.starts_with("    ") && !line.starts_with("        "))
        .filter_map(|line| {
            let line = line.trim();
            line.chars()
                .next()
                .filter(char::is_ascii_uppercase)
                .map(|_| {
                    line.split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
                        .next()
                        .expect("variant")
                })
        })
        .collect()
}

pub(crate) fn validate_module_id(id: &str) {
    assert!(
        !["contract", "validators"].contains(&id),
        "reserved module id: {id}"
    );
    assert!(
        id.split('_')
            .all(|part| !part.is_empty() && part.bytes().all(|c| c.is_ascii_lowercase())),
        "module ids require lowercase letters separated by underscores: {id}"
    );
}

pub(crate) fn validate_source(source: &str) {
    let compact: String = source.chars().filter(|c| !c.is_whitespace()).collect();
    assert!(
        compact.ends_with("#[cfg(any(test,feature=\"bindings\"))]pub(crate)modbindings;"),
        "wire.rs must end with the bindings module declaration"
    );
    for kind in ["Request", "Reply", "Topic"] {
        if let Some(body) = enum_body(source, kind) {
            let variants = variant_names(body);
            let names = wire_names(source, kind);
            assert_eq!(
                variants.len(),
                names.len(),
                "{kind}: every variant needs its own formatted name line"
            );
            assert!(!variants.is_empty(), "{kind} cannot be empty");
        }
    }
}

pub(crate) fn wire_names(source: &str, kind: &str) -> Vec<String> {
    let Some(body) = enum_body(source, kind) else {
        return Vec::new();
    };
    if kind == "Topic" {
        // Topics are unit variants. Counting comma-separated items independently
        // rejects two variants on a line, which the line-based router cannot see.
        return body
            .lines()
            .map(|line| line.split("//").next().unwrap_or_default())
            .collect::<Vec<_>>()
            .join("\n")
            .split(',')
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(|name| {
                assert!(
                    name.bytes().all(|c| c.is_ascii_alphanumeric()),
                    "Topic requires plain unit variants"
                );
                let mut name = name.to_owned();
                name[..1].make_ascii_lowercase();
                name
            })
            .collect();
    }
    body.lines()
        .filter_map(|line| line.strip_prefix("    #[serde(rename = \""))
        .map(|tail| tail.split('"').next().expect("serialized name").to_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    fn wire(body: &str) -> String {
        format!("{body}\n#[cfg(any(test, feature = \"bindings\"))]\npub(crate) mod bindings;\n")
    }
    #[test]
    fn malformed_layout_fails_at_build_time() {
        for body in [
            "pub enum Request {\n    #[serde(rename = \"get\")] Get {},\n}",
            "pub enum Topic {\n    Core, SimStatus,\n}",
        ] {
            assert!(std::panic::catch_unwind(|| validate_source(&wire(body))).is_err());
        }
        validate_source(&wire(
            "pub enum Request {\n    #[serde(rename = \"get\")]\n    Get {\n        #[serde(rename = \"value\")]\n        value: bool,\n    },\n}",
        ));
    }
    #[test]
    fn module_ids_cannot_shadow_generated_files() {
        for id in [
            "contract",
            "validators",
            "Upper",
            "two__parts",
            "digits1",
            "",
        ] {
            assert!(std::panic::catch_unwind(|| validate_module_id(id)).is_err());
        }
        validate_module_id("new_screen");
    }
    #[test]
    fn owned_sources_are_formatted_even_when_cargo_fmt_cannot_find_them() {
        let directory =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src/protocol/modules");
        let mut command = std::process::Command::new("rustfmt");
        command.args([
            "--edition",
            "2024",
            "--check",
            "--config",
            "skip_children=true",
        ]);
        for entry in std::fs::read_dir(directory).expect("modules") {
            let path = entry.expect("module").path();
            for file in ["wire.rs", "dispatch.rs", "bindings.rs", "tick.rs"] {
                let source = path.join(file);
                if source.is_file() {
                    if file == "wire.rs" {
                        validate_source(&std::fs::read_to_string(&source).expect("wire"));
                    }
                    command.arg(source);
                }
            }
        }
        let output = command.output().expect("rustfmt must be installed");
        assert!(
            output.status.success(),
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
    }
}
