//! Discover screen-owned sources; generated aggregation lives only in `OUT_DIR`.
mod build_support;
use build_support::{enum_body, validate_module_id, validate_source, variant_names, wire_names};
use std::fmt::Write as _;
use std::{env, fs, path::PathBuf};

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
        validate_module_id(id);
        writeln!(
            registry,
            "#[path = {:?}] pub mod {id};",
            path.join("wire.rs").to_str().expect("UTF-8")
        )
        .expect("String write");
        let source = fs::read_to_string(path.join("wire.rs")).expect("wire source");
        validate_source(&source);
        sources.push(source);
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
        writeln!(wire,"#[derive(Clone, {extra} Debug, PartialEq, Eq, Serialize, Deserialize)]\n{attributes}\npub enum {name} {{").expect("String write");
        for source in &sources {
            if let Some(body) = enum_body(source, name) {
                wire.push_str(body);
            }
        }
        wire.push_str("}\n");
    }
    // Derive the closed names directly from serialized unit/struct variants.
    for (name, kind) in [
        ("METHODS", "Request"),
        ("TOPICS", "Topic"),
        ("REPLIES", "Reply"),
    ] {
        let mut names = std::collections::BTreeSet::new();
        for source in &sources {
            for value in wire_names(source, kind) {
                assert!(names.insert(value), "duplicate {kind} serialized name");
            }
        }
        if kind != "Reply" {
            writeln!(
                wire,
                "pub const {name}: &[&str] = &{:?};",
                names.into_iter().collect::<Vec<_>>()
            )
            .expect("String write");
        }
    }
    let output = PathBuf::from(env::var_os("OUT_DIR").expect("output"));
    fs::write(output.join("wire.rs"), wire).expect("write wire aggregation");
    write_bindings(&output, &modules, &sources);
    write_session(&root, &output, &modules, &sources);
}

fn write_bindings(output: &std::path::Path, modules: &[PathBuf], sources: &[String]) {
    let mut bindings = String::from(
        "pub fn module_outputs()->Vec<(&'static str,String,serde_json::Value)>{let mut modules=vec![\n",
    );
    for (path, source) in modules.iter().zip(sources) {
        let id = path.file_name().expect("id").to_str().expect("UTF-8");
        writeln!(
            bindings,
            "({id:?}, {{let mut text=super::modules::{id}::bindings::typescript();"
        )
        .expect("String write");
        for kind in ["Request", "Reply", "HostError", "Topic", "Event"] {
            if enum_body(source, kind).is_some() {
                let prefix = module_prefix(id);
                writeln!(
                    bindings,
                    "declare_named::<super::modules::{id}::{kind}>(&mut text,\"{prefix}{kind}\");"
                )
                .expect("String write");
            }
        }
        for kind in ["Request", "Topic"] {
            if enum_body(source, kind).is_some() {
                let tag = if kind == "Request" { "method" } else { "" };
                let suffix = if kind == "Request" {
                    "Methods"
                } else {
                    "Topics"
                };
                writeln!(bindings,"append_names::<super::modules::{id}::{kind}>(&mut text,{id:?},{suffix:?},{tag:?});").expect("String write");
            }
        }
        writeln!(
            bindings,
            "text}},canonical(super::modules::{id}::bindings::corpus())),"
        )
        .expect("String write");
    }
    bindings.push_str("] ; add_type_imports(&mut modules); modules}\n");
    fs::write(output.join("binding_registry.rs"), bindings).expect("write bindings registry");
}

fn optional(path: &std::path::Path) -> String {
    match fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => panic!("{}: {error}", path.display()),
    }
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
    let mut subscriptions = String::new();
    let mut models = String::new();
    for (path, source) in modules.iter().zip(sources) {
        let id = path.file_name().expect("id").to_str().expect("UTF-8");
        fields.push_str(&optional(&path.join("state.inc")));
        init.push_str(&optional(&path.join("init.inc")));
        let operations = optional(&path.join("remote.inc"));
        remote.push_str(&operations);
        writeln!(
            registry,
            "#[path={:?}] mod {id};",
            path.join("dispatch.rs").to_str().expect("UTF-8")
        )
        .expect("String write");
        if let Some(body) = enum_body(source, "Request") {
            let pattern = variant_names(body)
                .iter()
                .map(|name| format!("Request::{name}{{..}}"))
                .collect::<Vec<_>>()
                .join(" | ");
            writeln!(
                handlers,
                "(|request|matches!(request,{pattern}),{id}::dispatch),"
            )
            .expect("String write");
        }
        if let Some(body) = enum_body(source, "Topic") {
            let pattern = variant_names(body)
                .iter()
                .map(|name| format!("Topic::{name}"))
                .collect::<Vec<_>>()
                .join(" | ");
            writeln!(
                subscriptions,
                "(|topic|matches!(topic,{pattern}),{id}::subscribe),"
            )
            .expect("String write");
        }
        let patterns: Vec<_> = variant_names(&operations)
            .into_iter()
            .map(|variant| {
                let suffix = if operations.contains(&format!("{variant}(")) {
                    "(..)"
                } else if operations.contains(&format!("{variant} {{")) {
                    "{..}"
                } else {
                    ""
                };
                format!("RemoteKind::{variant}{suffix}")
            })
            .collect();
        if !patterns.is_empty() {
            writeln!(
                completes,
                "{} => {id}::complete(self,Some((expected,kind)),id,result),",
                patterns.join(" | ")
            )
            .expect("String write");
        }
        if path.join("tick.rs").exists() {
            writeln!(
                registry,
                "#[path={:?}] mod {id}_tick;",
                path.join("tick.rs").to_str().expect("UTF-8")
            )
            .expect("String write");
            writeln!(ticks, "{id}_tick::tick,").expect("String write");
        }
        append_model(root, path, id, &mut models);
    }
    let template =
        fs::read_to_string(root.join("src/ui_process/session.inc")).expect("session template");
    let base =
        fs::read_to_string(root.join("src/ui_process/init.inc")).expect("session initialization");
    registry.push_str(&template.replace("@FIELDS@", &fields));
    writeln!(registry, "enum RemoteKind{{{remote}}}").expect("String write");
    writeln!(registry,"type ScreenHandler=(fn(&Request)->bool,fn(&mut Session,&mut Pipe,u32,&Request)->io::Result<()>);\nconst SCREEN_HANDLERS:&[ScreenHandler]=&[{handlers}];").expect("String write");
    writeln!(registry,"type ScreenTick=fn(&mut Session,&mut Pipe)->io::Result<()>;\nconst SCREEN_TICKS:&[ScreenTick]=&[{ticks}];").expect("String write");
    writeln!(registry,"type TopicHandler=(fn(Topic)->bool,fn(&mut Session,&mut Pipe,Topic)->io::Result<()>);\nconst SCREEN_SUBSCRIPTIONS:&[TopicHandler]=&[{subscriptions}];").expect("String write");
    writeln!(registry,"impl Session{{fn new(args:&Args,core:Core,settings:Settings,confirmation:Option<ready::Ready>,privacy:crate::privacy::State)->Self{{Self{{{base}\n{init}}}}}").expect("String write");
    registry.push_str("fn request(&mut self,pipe:&mut Pipe,id:u32,request:&Request)->io::Result<()>{let (_,handler)=SCREEN_HANDLERS.iter().find(|(accept,_)|accept(request)).ok_or(io::ErrorKind::InvalidInput)?;handler(self,pipe,id,request)}\n");
    writeln!(registry,"fn service_reply(&mut self,id:u32,result:Result<vantare_ipc::services_protocol::Reply,HostError>)->Result<Reply,HostError>{{match self.remote.take(){{Some((expected,kind))=>match kind{{{completes}}},None=>result.and(Err(HostError::Denied))}}}}}}").expect("String write");
    fs::write(output.join("session.rs"), registry).expect("write session aggregation");
    fs::write(output.join("models.rs"), models).expect("write model aggregation");
    write_dispatch_tests(output, modules, sources);
    println!("cargo:rerun-if-changed=src/ui_process");
}

fn module_prefix(id: &str) -> String {
    id.split('_')
        .map(|part| {
            let mut part = part.to_owned();
            part[..1].make_ascii_uppercase();
            part
        })
        .collect()
}

fn append_model(root: &std::path::Path, path: &std::path::Path, id: &str, models: &mut String) {
    let model = path.join("model.rs");
    let registered = optional(&path.join("model.path"));
    if model.exists() || !registered.trim().is_empty() {
        let model = if model.exists() {
            model
        } else {
            root.join(registered.trim())
        };
        writeln!(
            models,
            "#[path={:?}] pub mod {id};",
            model.to_str().expect("UTF-8")
        )
        .expect("String write");
    }
}

fn write_dispatch_tests(output: &std::path::Path, modules: &[PathBuf], sources: &[String]) {
    let mut tests = String::new();
    for (path, source) in modules.iter().zip(sources) {
        if enum_body(source, "Request").is_some() {
            let id = path.file_name().expect("id").to_str().expect("UTF-8");
            writeln!(tests, "#[test] fn {id}_corpus_reaches_real_dispatch() {{ run_corpus({id:?}, crate::protocol::modules::{id}::bindings::corpus(), {id}::dispatch); }}").expect("String write");
        }
    }
    fs::write(output.join("dispatch_case_tests.rs"), tests).expect("dispatch tests");
}
