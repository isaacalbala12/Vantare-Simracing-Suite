//! Ejemplo del relativo (prueba #2022): imprime el modelo de la primera foto
//! de una escena o de la primera que llegue por el pipe del núcleo.
//!
//! `cargo run --example relativo -- --escena <ruta.scene.json>`
//! `cargo run --example relativo -- --pipe`
//!
//! La ventana y el pintor del compositor los cablea el ejemplo completo; este
//! binario solo enseña el JSON que entrega el doble del núcleo.

mod nucleo;

use std::process::ExitCode;
use std::time::Duration;

const USO: &str = "uso: relativo --escena <ruta.scene.json> (primera foto) | --pipe";
const ESPERA_PIPE: Duration = Duration::from_secs(5);

fn main() -> ExitCode {
    match ejecutar() {
        Ok(()) => ExitCode::SUCCESS,
        Err(mensaje) => {
            eprintln!("{mensaje}");
            ExitCode::FAILURE
        }
    }
}

fn ejecutar() -> Result<(), String> {
    let mut argumentos = std::env::args().skip(1);
    let Some(orden) = argumentos.next() else {
        return Err(USO.to_owned());
    };
    match orden.as_str() {
        "--escena" => {
            let Some(ruta) = argumentos.next() else {
                return Err(USO.to_owned());
            };
            sin_mas_argumentos(&mut argumentos)?;
            let fotos = nucleo::leer_escena(&ruta).map_err(|fallo| fallo.to_string())?;
            let Some(foto) = fotos.first() else {
                return Err("la escena no contiene fotos".to_owned());
            };
            imprime(&nucleo::modelo(foto, nucleo::Ajustes::default()))
        }
        "--pipe" => {
            sin_mas_argumentos(&mut argumentos)?;
            let mut canal = nucleo::Canal::abrir(None).map_err(|fallo| fallo.to_string())?;
            let Some(foto) = canal.siguiente(ESPERA_PIPE) else {
                return Err(if canal.incompatible() {
                    "componentes incompatibles: reinstala la misma versión".to_owned()
                } else {
                    "el núcleo no entregó ninguna foto en 5 s".to_owned()
                });
            };
            imprime(&nucleo::modelo(&foto, nucleo::Ajustes::default()))
        }
        "-h" | "--ayuda" | "--help" => {
            println!("{USO}");
            Ok(())
        }
        _ => Err(USO.to_owned()),
    }
}

fn sin_mas_argumentos(argumentos: &mut impl Iterator<Item = String>) -> Result<(), String> {
    if argumentos.next().is_some() {
        return Err(format!("sobra un argumento. {USO}"));
    }
    Ok(())
}

fn imprime(modelo: &serde_json::Value) -> Result<(), String> {
    let json = serde_json::to_string_pretty(modelo)
        .map_err(|fallo| format!("no se pudo serializar el modelo: {fallo}"))?;
    println!("{json}");
    Ok(())
}
