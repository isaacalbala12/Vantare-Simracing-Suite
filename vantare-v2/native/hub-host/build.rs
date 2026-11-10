//! Discover screen-owned sources; generated aggregation lives only in OUT_DIR.
use std::{env, fs, path::PathBuf};

fn enum_body<'a>(source: &'a str, name: &str) -> Option<&'a str> {
    let marker = format!("pub enum {name} {{");
    let begin = source.find(&marker)? + marker.len();
    let mut depth = 1;
    for (offset, byte) in source.as_bytes()[begin..].iter().enumerate() {
        match byte {
            b'{' => depth += 1,
            b'}' => depth -= 1,
            _ => {}
        }
        if depth == 0 {
            return Some(&source[begin..begin + offset]);
        }
    }
    panic!("unclosed {name}")
}

fn main() {
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest"));
    let directory = root.join("src/protocol/modules");
    println!("cargo:rerun-if-changed={}", directory.display());
    let mut modules: Vec<_> = fs::read_dir(&directory)
        .expect("contract modules")
        .map(|entry| entry.expect("module").path())
        .filter(|path| path.is_dir())
        .collect();
    modules.sort();
    let mut registry = String::from("pub mod modules {\n");
    let mut wire = String::new();
    let mut sources = Vec::new();
    for path in &modules {
        let id = path
            .file_name()
            .expect("module id")
            .to_str()
            .expect("UTF-8");
        assert!(id.bytes().all(|c| c.is_ascii_lowercase() || c == b'_'));
        registry.push_str(&format!(
            "#[path = {:?}] pub mod {id};\n",
            path.join("wire.rs")
        ));
        sources.push(fs::read_to_string(path.join("wire.rs")).expect("wire source"));
    }
    registry.push_str("}\n");
    wire.push_str(&registry);
    for (name, attributes) in [
        ("Request", "#[serde(tag = \"method\", deny_unknown_fields)]"),
        ("Reply", "#[serde(tag = \"method\", deny_unknown_fields)]"),
        (
            "HostError",
            "#[serde(tag = \"kind\", rename_all = \"camelCase\", deny_unknown_fields)]",
        ),
        ("Topic", "#[serde(rename_all = \"camelCase\")]"),
        (
            "Event",
            "#[serde(tag = \"topic\", rename_all = \"camelCase\", deny_unknown_fields)]",
        ),
    ] {
        wire.push_str("#[cfg_attr(any(test, feature = \"bindings\"), derive(TS))]\n");
        let extra = if name == "Topic" {
            "Copy, PartialOrd, Ord,"
        } else {
            ""
        };
        wire.push_str(&format!("#[derive(Clone, {extra} Debug, PartialEq, Eq, Serialize, Deserialize)]\n{attributes}\npub enum {name} {{\n"));
        for source in &sources {
            if let Some(body) = enum_body(source, name) {
                wire.push_str(body);
            }
        }
        wire.push_str("}\n");
    }
    // Derive the closed names directly from serialized unit/struct variants.
    for (name, kind) in [("METHODS", "Request"), ("TOPICS", "Topic")] {
        let mut names = std::collections::BTreeSet::new();
        for source in &sources {
            if let Some(body) = enum_body(source, kind) {
                for line in body.lines() {
                    if kind == "Request" {
                        if let Some(value) = line.trim().strip_prefix("#[serde(rename = \"") {
                            assert!(
                                names.insert(value.split('"').next().expect("method").to_owned()),
                                "duplicate method"
                            );
                        }
                    } else if line.starts_with("    ") && !line.starts_with("        ") {
                        let value = line.trim().trim_end_matches(',');
                        if !value.is_empty() {
                            let mut value = value.to_owned();
                            value[..1].make_ascii_lowercase();
                            assert!(names.insert(value), "duplicate topic");
                        }
                    }
                }
            }
        }
        wire.push_str(
            &format!("pub const {name}: &[&str] = &{names:?};\n")
                .replace("= &{", "= &[")
                .replace("};", "];"),
        );
    }
    let output = PathBuf::from(env::var_os("OUT_DIR").expect("output"));
    fs::write(output.join("wire.rs"), wire).expect("write wire aggregation");
    let mut bindings = String::from(
        "pub fn module_outputs()->Vec<(&'static str,String,serde_json::Value)>{let mut modules=vec![\n",
    );
    for (path, source) in modules.iter().zip(&sources) {
        let id = path.file_name().expect("id").to_str().expect("UTF-8");
        bindings.push_str(&format!(
            "({id:?}, {{let mut text=super::modules::{id}::bindings::typescript();\n"
        ));
        for kind in ["Request", "Topic"] {
            if enum_body(source, kind).is_some() {
                let tag = if kind == "Request" { "method" } else { "" };
                let suffix = if kind == "Request" {
                    "Methods"
                } else {
                    "Topics"
                };
                bindings.push_str(&format!("append_names::<super::modules::{id}::{kind}>(&mut text,{id:?},{suffix:?},{tag:?});\n"));
            }
        }
        bindings.push_str(&format!(
            "text}},super::modules::{id}::bindings::corpus()),\n"
        ));
    }
    bindings.push_str("] ; add_type_imports(&mut modules); modules}\n");
    fs::write(output.join("binding_registry.rs"), bindings).expect("write bindings registry");
    write_session(&root, &output, &modules, &sources);
}

fn optional(path: PathBuf) -> String {
    fs::read_to_string(path).unwrap_or_default()
}
fn variant_names(body: &str) -> Vec<&str> {
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
fn write_session(
    root: &std::path::Path,
    output: &std::path::Path,
    modules: &[PathBuf],
    sources: &[String],
) {
    let mut fields = String::new();
    let mut init = String::new();
    let mut remote = String::new();
    let mut registry = String::new();
    let mut handlers = String::new();
    let mut completes = String::new();
    let mut ticks = String::new();
    let mut models = String::new();
    for (path, source) in modules.iter().zip(sources) {
        let id = path.file_name().expect("id").to_str().expect("UTF-8");
        fields.push_str(&optional(path.join("state.inc")));
        init.push_str(&optional(path.join("init.inc")));
        let operations = optional(path.join("remote.inc"));
        remote.push_str(&operations);
        registry.push_str(&format!(
            "#[path={:?}] mod {id};\n",
            path.join("dispatch.rs")
        ));
        if let Some(body) = enum_body(source, "Request") {
            let pattern = variant_names(body)
                .iter()
                .map(|name| format!("Request::{name}{{..}}"))
                .collect::<Vec<_>>()
                .join(" | ");
            handlers.push_str(&format!(
                "(|request|matches!(request,{pattern}),{id}::dispatch),\n"
            ));
        }
        for variant in variant_names(&operations) {
            completes.push_str(&format!("RemoteKind::{variant}{{..}} => {id}::complete(self,Some((expected,kind)),id,result),\n"));
        }
        if path.join("tick.rs").exists() {
            registry.push_str(&format!(
                "#[path={:?}] mod {id}_tick;\n",
                path.join("tick.rs")
            ));
            ticks.push_str(&format!("{id}_tick::tick,\n"));
        }
        let model = path.join("model.rs");
        let registered = optional(path.join("model.path"));
        if model.exists() || !registered.trim().is_empty() {
            let model = if model.exists() {
                model
            } else {
                root.join(registered.trim())
            };
            models.push_str(&format!("#[path={model:?}] pub mod {id};\n"));
        }
    }
    let template =
        fs::read_to_string(root.join("src/ui_process/session.inc")).expect("session template");
    let base = fs::read_to_string(root.join("src/ui_process/init.inc"))
        .expect("session initialization")
        .replace(
            "confirmation: ready::Ready::from_executable(&executable)?,",
            "confirmation,",
        );
    registry.push_str(&template.replace("@FIELDS@", &fields));
    registry.push_str(&format!("enum RemoteKind{{{remote}}}\n"));
    registry.push_str(&format!("type ScreenHandler=(fn(&Request)->bool,fn(&mut Session,&mut Pipe,u32,&Request)->io::Result<()>);\nconst SCREEN_HANDLERS:&[ScreenHandler]=&[{handlers}];\n"));
    registry.push_str(&format!("type ScreenTick=fn(&mut Session,&mut Pipe)->io::Result<()>;\nconst SCREEN_TICKS:&[ScreenTick]=&[{ticks}];\n"));
    registry.push_str(&format!("impl Session{{fn new(args:&Args,core:Core,settings:Settings,confirmation:Option<ready::Ready>)->Self{{Self{{{base}\n{init}}}}}\n"));
    registry.push_str("fn request(&mut self,pipe:&mut Pipe,id:u32,request:&Request)->io::Result<()>{let (_,handler)=SCREEN_HANDLERS.iter().find(|(accept,_)|accept(request)).ok_or(io::ErrorKind::InvalidInput)?;handler(self,pipe,id,request)}\n");
    registry.push_str(&format!("fn service_reply(&mut self,id:u32,result:Result<vantare_ipc::services_protocol::Reply,HostError>)->Result<Reply,HostError>{{match self.remote.take(){{Some((expected,kind))=>match kind{{{completes}}},None=>Err(HostError::Denied)}}}}}}\n"));
    fs::write(output.join("session.rs"), registry).expect("write session aggregation");
    fs::write(output.join("models.rs"), models).expect("write model aggregation");
    println!("cargo:rerun-if-changed=src/ui_process");
}
