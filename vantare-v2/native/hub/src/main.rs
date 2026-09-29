#![forbid(unsafe_code)]

use std::path::PathBuf;
use std::process::ExitCode;
use vantare_hub::{Section, shell::Options};

fn parse(args: &[String]) -> Result<Options, String> {
    let mut controlled = false;
    let mut data_dir = None;
    let mut scene = None;
    let mut section = Section::Home;
    let mut args = args.iter();
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--control-stdin" if !controlled => controlled = true,
            "--workshop" if section == Section::Home => section = Section::Workshop,
            "--data-dir" if data_dir.is_none() => {
                data_dir = Some(PathBuf::from(args.next().ok_or("falta directorio")?));
            }
            "--scene" if scene.is_none() => {
                scene = Some(PathBuf::from(args.next().ok_or("falta escena")?));
            }
            _ => return Err("argumento desconocido o repetido".into()),
        }
    }
    let data_dir = match data_dir {
        Some(path) => path,
        None => PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("indica --data-dir")?)
            .join("VantareNative")
            .join("hub"),
    };
    Ok(Options {
        controlled,
        data_dir,
        scene,
        section,
    })
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let options = match parse(&args) {
        Ok(options) => options,
        Err(error) => {
            eprintln!(
                "{error}\nuso: vantare-hub [--workshop] [--data-dir RUTA] [--scene FOTO.json|FOTOS.jsonl] [--control-stdin]"
            );
            return ExitCode::from(2);
        }
    };
    match vantare_hub::shell::run(options) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("vantare-hub: {error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn options_select_local_data_and_scene_and_reject_incomplete_or_repeated_values() {
        let args = |items: &[&str]| {
            items
                .iter()
                .map(|item| (*item).into())
                .collect::<Vec<String>>()
        };
        let options = parse(&args(&[
            "--workshop",
            "--data-dir",
            "local",
            "--scene",
            "capture.jsonl",
            "--control-stdin",
        ]))
        .expect("opciones");
        assert_eq!(options.section, Section::Workshop);
        assert!(options.controlled);
        assert_eq!(options.data_dir, PathBuf::from("local"));
        assert_eq!(options.scene, Some(PathBuf::from("capture.jsonl")));
        for bad in [
            vec!["--data-dir"],
            vec!["--scene"],
            vec!["--workshop", "--workshop"],
            vec!["--control-stdin", "--control-stdin"],
            vec!["--scene", "a", "--scene", "b"],
        ] {
            assert!(parse(&args(&bad)).is_err());
        }
    }
}
