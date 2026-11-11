//! Relativo de la prueba #2022 sobre el compositor propio.
//!
//! El «doble del núcleo» (`nucleo.rs`) convierte fotos en el modelo del
//! relativo; la receta y el sistema de diseño se cargan de disco, se vigilan y
//! se recargan en caliente. El overlay no calcula nada.
//!
//! ```text
//! relativo --imprimir --escena <s.scene.json> [--foto N]
//! relativo --captura <png> --escena <s.scene.json> [--foto N] [--en S]
//! relativo --escena <s.scene.json> [--cada-ms 900] [--guion] [--salir-tras S] [--medir <json>]
//! relativo --pipe [--salir-tras S]
//! ```
//! Opciones comunes: `--receta <ruta>` `--sistema <ruta>` `--modo monitor|por-overlay`.

mod nucleo;

#[cfg(not(windows))]
fn main() {
    eprintln!("el relativo con ventana requiere Windows; usa --imprimir en otras plataformas");
}

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    match ventana::ejecutar() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(mensaje) => {
            eprintln!("{mensaje}");
            std::process::ExitCode::FAILURE
        }
    }
}

#[cfg(windows)]
mod ventana {
    use super::nucleo;
    use serde_json::Value;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, SystemTime};
    use vantare_compositor::escena::Escena;
    use vantare_compositor::escena::capas::Instante;
    use vantare_compositor::plataforma::{Bucle, Modo, Plataforma, Suceso};
    use vantare_compositor::receta::{self, Carga};
    use vantare_domain::Snapshot;
    use windows::Win32::Foundation::RECT;

    const BASE: &str = env!("CARGO_MANIFEST_DIR");
    /// Tamaño de la ventana del relativo Vantare actual (incluye la sombra).
    const ANCHO: i32 = 420;
    const ALTO: i32 = 265;
    const FUENTES: [&str; 3] = ["Inter", "Rajdhani", "Space Mono"];

    struct Opciones {
        receta: PathBuf,
        sistema: PathBuf,
        contrato: PathBuf,
        escena: Option<PathBuf>,
        foto: usize,
        captura: Option<PathBuf>,
        guion_capturas: Option<PathBuf>,
        en: f64,
        imprimir: bool,
        pipe: bool,
        cada: Duration,
        guion: bool,
        salir_tras: Option<f64>,
        modo: Modo,
    }

    fn opciones() -> Result<Opciones, String> {
        let mut o = Opciones {
            receta: Path::new(BASE).join("recetas/relativo.receta.json"),
            sistema: Path::new(BASE).join("sistemas/vantare.sistema.json"),
            contrato: Path::new(BASE).join("modelos/relativo.modelo.json"),
            escena: None,
            foto: 0,
            captura: None,
            guion_capturas: None,
            en: 1.0,
            imprimir: false,
            pipe: false,
            cada: Duration::from_millis(900),
            guion: false,
            salir_tras: None,
            modo: Modo::Monitor,
        };
        let mut args = std::env::args().skip(1);
        while let Some(a) = args.next() {
            let mut valor = || args.next().ok_or_else(|| format!("falta el valor de {a}"));
            match a.as_str() {
                "--receta" => o.receta = valor()?.into(),
                "--sistema" => o.sistema = valor()?.into(),
                "--escena" => o.escena = Some(valor()?.into()),
                "--foto" => o.foto = valor()?.parse().map_err(|e| format!("--foto: {e}"))?,
                "--captura" => o.captura = Some(valor()?.into()),
                "--guion-capturas" => o.guion_capturas = Some(valor()?.into()),
                "--en" => o.en = valor()?.parse().map_err(|e| format!("--en: {e}"))?,
                "--cada-ms" => {
                    o.cada = Duration::from_millis(
                        valor()?.parse().map_err(|e| format!("--cada-ms: {e}"))?,
                    );
                }
                "--salir-tras" => {
                    o.salir_tras =
                        Some(valor()?.parse().map_err(|e| format!("--salir-tras: {e}"))?);
                }
                "--modo" => {
                    o.modo = match valor()?.as_str() {
                        "monitor" => Modo::Monitor,
                        "por-overlay" => Modo::PorOverlay,
                        otro => return Err(format!("modo desconocido: {otro}")),
                    };
                }
                "--imprimir" => o.imprimir = true,
                "--pipe" => o.pipe = true,
                "--guion" => o.guion = true,
                otro => return Err(format!("argumento desconocido: {otro}")),
            }
        }
        if o.escena.is_none() && !o.pipe {
            return Err("indica --escena <ruta> o --pipe".into());
        }
        Ok(o)
    }

    fn leer(ruta: &Path) -> Result<String, String> {
        std::fs::read_to_string(ruta).map_err(|e| format!("{}: {e}", ruta.display()))
    }

    fn cargar(o: &Opciones) -> Result<Carga, String> {
        let (r, s, c) = (leer(&o.receta)?, leer(&o.sistema)?, leer(&o.contrato)?);
        receta::cargar_con_fuentes(
            (&o.receta.display().to_string(), &r),
            (&o.sistema.display().to_string(), &s),
            (&o.contrato.display().to_string(), &c),
            &FUENTES,
        )
        .map_err(|errores| {
            errores
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("\n")
        })
    }

    fn fotos(o: &Opciones) -> Result<Vec<Snapshot>, String> {
        match &o.escena {
            Some(ruta) => nucleo::leer_escena(ruta).map_err(|e| e.to_string()),
            None => Ok(Vec::new()),
        }
    }

    fn modelo_de(foto: &Snapshot, garaje: Option<bool>) -> Value {
        let mut m = nucleo::modelo(foto, nucleo::Ajustes::default());
        if let Some(g) = garaje {
            m["en_garaje"] = Value::Bool(g);
        }
        m
    }

    pub fn ejecutar() -> Result<(), String> {
        let o = opciones()?;
        let fotos = fotos(&o)?;
        if o.imprimir {
            let foto = fotos.get(o.foto).ok_or("la escena no tiene esa foto")?;
            println!(
                "{}",
                serde_json::to_string_pretty(&modelo_de(foto, None)).map_err(|e| e.to_string())?
            );
            return Ok(());
        }
        let carga = cargar(&o)?;
        for aviso in &carga.avisos {
            eprintln!("aviso: {aviso}");
        }
        let region = RECT {
            left: 0,
            top: 0,
            right: ANCHO,
            bottom: ALTO,
        };
        let fuentes = Path::new(BASE).join("../ui/assets/fonts");
        let mut p = Plataforma::nueva(o.modo, region, &fuentes).map_err(|e| e.to_string())?;
        let mut escena = Escena::nueva(carga.receta);
        if let Some(png) = &o.captura {
            return capturar(&o, &fotos, &mut p, &mut escena, png);
        }
        if let Some(carpeta) = &o.guion_capturas {
            return guion_capturas(&fotos, &mut p, &mut escena, carpeta);
        }
        bucle(&o, &fotos, &mut p, &mut escena)
    }

    fn capturar(
        o: &Opciones,
        fotos: &[Snapshot],
        p: &mut Plataforma,
        escena: &mut Escena,
        png: &Path,
    ) -> Result<(), String> {
        let foto = fotos.get(o.foto).ok_or("la escena no tiene esa foto")?;
        let t0 = p.ahora().map_err(|e| e.to_string())?;
        let lote = escena
            .actualizar(&modelo_de(foto, None), t0, &p.texto)
            .map_err(|e| e.to_string())?;
        // Diagnóstico para agentes: el lote, tal cual, junto a la captura.
        let volcado = png.with_extension("lote.json");
        let texto = serde_json::to_string_pretty(&lote).map_err(|e| e.to_string())?;
        std::fs::write(&volcado, texto).map_err(|e| e.to_string())?;
        p.aplicar(&lote)
            .map_err(|e| format!("{e} (lote en {})", volcado.display()))?;
        p.capturar(None, Instante(t0.0 + o.en), png)
            .map_err(|e| e.to_string())?;
        println!("captura {}", png.display());
        Ok(())
    }

    /// Fotogramas a 60 Hz de las dos transiciones pedidas, evaluando las mismas
    /// curvas que recibe `DirectComposition`: sale del garaje, entra en él y vuelve,
    /// y luego un rival a menos de 1 s (resalte pulsante). Escena `-carrera`.
    fn guion_capturas(
        fotos: &[Snapshot],
        p: &mut Plataforma,
        escena: &mut Escena,
        carpeta: &Path,
    ) -> Result<(), String> {
        let lejos = fotos.first().ok_or("la escena no tiene fotos")?;
        let cerca = fotos
            .get(1)
            .ok_or("la escena necesita una foto con un rival cerca")?;
        std::fs::create_dir_all(carpeta).map_err(|e| e.to_string())?;
        let t0 = p.ahora().map_err(|e| e.to_string())?;
        // (segundo, modelo): pasos del «núcleo» simulado.
        let pasos = [
            (0.0, modelo_de(lejos, Some(true))),
            (0.3, modelo_de(lejos, Some(false))),
            (1.3, modelo_de(lejos, Some(true))),
            (1.9, modelo_de(lejos, Some(false))),
            (2.9, modelo_de(cerca, Some(false))),
        ];
        let fin = 5.5;
        let mut siguiente = 0;
        let mut cuadro = 0_u32;
        loop {
            let t = f64::from(cuadro) / 60.0;
            if t > fin {
                break;
            }
            while let Some((cuando, modelo)) = pasos.get(siguiente).filter(|(c, _)| *c <= t) {
                let instante = Instante(t0.0 + cuando);
                let lote = escena
                    .actualizar(modelo, instante, &p.texto)
                    .map_err(|e| e.to_string())?;
                if let Err(e) = p.aplicar(&lote) {
                    let volcado = carpeta.join("rechazado.lote.json");
                    let texto = serde_json::to_string_pretty(&lote).map_err(|e| e.to_string())?;
                    std::fs::write(&volcado, texto).map_err(|e| e.to_string())?;
                    return Err(format!(
                        "paso {siguiente}: {e} (lote en {})",
                        volcado.display()
                    ));
                }
                siguiente += 1;
            }
            let instante = Instante(t0.0 + t);
            let lote = escena.avanzar(instante).map_err(|e| e.to_string())?;
            if !lote.operaciones.is_empty() {
                p.aplicar(&lote).map_err(|e| e.to_string())?;
            }
            p.capturar(None, instante, &carpeta.join(format!("{cuadro:04}.png")))
                .map_err(|e| e.to_string())?;
            cuadro += 1;
        }
        println!("{cuadro} fotogramas en {}", carpeta.display());
        Ok(())
    }

    /// Último modelo pendiente del lector del pipe (gana el más reciente).
    type Buzon = Arc<Mutex<Option<Arc<Snapshot>>>>;

    fn bucle(
        o: &Opciones,
        fotos: &[Snapshot],
        p: &mut Plataforma,
        escena: &mut Escena,
    ) -> Result<(), String> {
        let mut bucle = Bucle::nuevo().map_err(|e| e.to_string())?;
        for carpeta in [&o.receta, &o.sistema] {
            if let Some(dir) = carpeta.parent() {
                bucle.vigilar(dir).map_err(|e| e.to_string())?;
            }
        }
        // Lector del pipe: un hilo con cierre explícito (bandera + join al salir).
        let buzon: Buzon = Arc::new(Mutex::new(None));
        let parar = Arc::new(AtomicBool::new(false));
        let lector = if o.pipe {
            let (buzon, parar, aviso) = (buzon.clone(), parar.clone(), bucle.avisador());
            let mut canal = nucleo::Canal::abrir(None).map_err(|e| e.to_string())?;
            Some(std::thread::spawn(move || {
                let mut avisado = false;
                while !parar.load(Ordering::Relaxed) {
                    if !avisado && canal.incompatible() {
                        eprintln!(
                            "Componentes incompatibles. Reinstala la misma versión de Vantare"
                        );
                        avisado = true;
                    }
                    if let Some(foto) = canal.siguiente(Duration::from_millis(100)) {
                        if let Ok(mut b) = buzon.lock() {
                            *b = Some(foto);
                        }
                        if let Err(e) = aviso.avisar() {
                            eprintln!("aviso del lector: {e}");
                            return;
                        }
                    }
                }
            }))
        } else {
            None
        };
        let resultado = recorrer(o, fotos, p, escena, &bucle, &buzon);
        parar.store(true, Ordering::Relaxed);
        if let Some(h) = lector
            && h.join().is_err()
        {
            eprintln!("el lector del pipe terminó con pánico");
        }
        resultado
    }

    #[allow(clippy::too_many_lines)] // Bucle de sucesos del ejemplo: una sola máquina de estados legible.
    fn recorrer(
        o: &Opciones,
        fotos: &[Snapshot],
        p: &mut Plataforma,
        escena: &mut Escena,
        bucle: &Bucle,
        buzon: &Buzon,
    ) -> Result<(), String> {
        let inicio = p.ahora().map_err(|e| e.to_string())?;
        let fin = o.salir_tras.map(|s| Instante(inicio.0 + s));
        let paso = o.cada.as_secs_f64();
        let mut indice = 0_usize;
        let mut proxima = Some(inicio);
        let mut ultimo_modelo: Option<Value> = None;
        loop {
            let ahora = p.ahora().map_err(|e| e.to_string())?;
            if fin.is_some_and(|f| ahora.0 >= f.0) {
                return Ok(());
            }
            // Guion de escena: siguiente foto cuando toca (el «núcleo» simulado).
            if !o.pipe && proxima.is_some_and(|t| ahora.0 >= t.0) && !fotos.is_empty() {
                let foto = &fotos[indice % fotos.len()];
                // Con --guion: cada tres vueltas, dos fotos en el garaje.
                let ciclo = indice / fotos.len();
                let garaje = o
                    .guion
                    .then_some(ciclo % 3 == 2 && indice % fotos.len() < 2);
                let modelo = modelo_de(foto, garaje);
                aplicar_modelo(p, escena, &modelo, ahora)?;
                ultimo_modelo = Some(modelo);
                indice += 1;
                proxima = Some(Instante(ahora.0 + paso));
            }
            let limite = [proxima, fin, escena.proximo_fotograma()]
                .into_iter()
                .flatten()
                .min_by(|a, b| a.0.total_cmp(&b.0));
            let pintadas = escena
                .proximo_fotograma()
                .is_some_and(|t| t.0 <= ahora.0 + 0.001);
            match bucle
                .esperar_hasta(p, pintadas, limite)
                .map_err(|e| e.to_string())?
            {
                Suceso::Cerrar => return Ok(()),
                Suceso::ModeloNuevo => {
                    let foto = buzon.lock().ok().and_then(|mut b| b.take());
                    if let Some(foto) = foto {
                        let ahora = p.ahora().map_err(|e| e.to_string())?;
                        let modelo = modelo_de(&foto, None);
                        aplicar_modelo(p, escena, &modelo, ahora)?;
                        ultimo_modelo = Some(modelo);
                    }
                }
                Suceso::FicheroCambiado(dir) => {
                    recargar(o, &dir, p, escena, ultimo_modelo.as_ref())?;
                }
                Suceso::Fotograma(t) => {
                    let lote = escena.avanzar(t).map_err(|e| e.to_string())?;
                    if !lote.operaciones.is_empty() {
                        p.aplicar(&lote).map_err(|e| e.to_string())?;
                    }
                }
                Suceso::PantallasCambiadas => p.actualizar_dpi().map_err(|e| e.to_string())?,
            }
        }
    }

    fn aplicar_modelo(
        p: &mut Plataforma,
        escena: &mut Escena,
        modelo: &Value,
        ahora: Instante,
    ) -> Result<(), String> {
        let lote = escena
            .actualizar(modelo, ahora, &p.texto)
            .map_err(|e| e.to_string())?;
        if !lote.operaciones.is_empty() {
            p.aplicar(&lote).map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// Recarga en caliente: valida antes de cambiar; si falla, conserva lo anterior.
    /// Un cambio en la carpeta del sistema funde al sistema nuevo; si no, a la receta nueva.
    fn recargar(
        o: &Opciones,
        carpeta: &Path,
        p: &mut Plataforma,
        escena: &mut Escena,
        ultimo: Option<&Value>,
    ) -> Result<(), String> {
        let es_sistema = o.sistema.parent() == Some(carpeta);
        let fichero = if es_sistema { &o.sistema } else { &o.receta };
        let guardado = std::fs::metadata(fichero).and_then(|m| m.modified()).ok();
        let carga = match cargar(o) {
            Ok(c) => c,
            Err(errores) => {
                eprintln!(
                    "diseño no válido; se conserva el anterior:
{errores}"
                );
                return Ok(());
            }
        };
        let ahora = p.ahora().map_err(|e| e.to_string())?;
        let cambio = if es_sistema {
            escena.cambiar_sistema(carga.sistema, ahora, &p.texto)
        } else {
            escena.cambiar_receta(carga.receta, ahora, &p.texto)
        };
        let lote = match cambio {
            Ok(l) => l,
            Err(e) => {
                eprintln!("cambio de diseño rechazado; se conserva el anterior: {e}");
                return Ok(());
            }
        };
        p.aplicar(&lote).map_err(|e| e.to_string())?;
        if let Some(m) = ultimo {
            aplicar_modelo(p, escena, m, ahora)?;
        }
        if let Some(t) = guardado.and_then(|t| SystemTime::now().duration_since(t).ok()) {
            println!(
                "recarga de {} aplicada {:.1} ms después de guardar",
                fichero.display(),
                t.as_secs_f64() * 1000.0
            );
        }
        Ok(())
    }
}
