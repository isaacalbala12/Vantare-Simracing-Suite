//! Reproducción aislada de las caídas del 2026-11-10 (VANTA-140, parada de
//! seguridad). Cada caso ejercita UNA de las sospechas; NO se ejecuta en el
//! servidor. Solo en una máquina desechable con volcado de memoria activado y
//! con `VANTARE_ESTRES_AUTORIZADO=1` (sin esa variable el programa no hace nada).
//!
//! ```text
//! estres --caso a|b|c|d [--warp] [--sin-infinitas <s>] [--durante <s>] [--salida <dir>]
//! ```
//! - A: un pulso infinito (`AddRepeat` + `SetAbsoluteBeginTime`) durante `--durante`.
//! - B: ráfaga de 500 lotes con 20 animaciones nuevas cada uno, cada uno con su Commit.
//! - C: 300 capturas D2D → WIC a `--salida`.
//! - D: el relativo real con 50 recargas del sistema de diseño (fundido entre árboles).
//! - `--warp`: dispositivo D3D11 por software; si así no cae, apunta al controlador.
//! - `--sin-infinitas <s>`: las repeticiones se desenrollan `s` segundos y terminan.

#[cfg(windows)]
#[path = "relativo/nucleo.rs"]
#[allow(dead_code)] // Solo se usan el lector de escenas y el modelo.
mod nucleo;

#[cfg(not(windows))]
fn main() {
    eprintln!("estres requiere Windows");
}

#[cfg(windows)]
fn main() -> std::process::ExitCode {
    if std::env::var_os("VANTARE_ESTRES_AUTORIZADO").is_none_or(|v| v != "1") {
        eprintln!(
            "No autorizado: estas pruebas pueden tumbar la máquina. Ejecuta solo en una \
             máquina desechable con volcado activado y VANTARE_ESTRES_AUTORIZADO=1."
        );
        return std::process::ExitCode::from(2);
    }
    match estres::ejecutar() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            std::process::ExitCode::FAILURE
        }
    }
}

#[cfg(windows)]
mod estres {
    use super::nucleo;
    use std::path::{Path, PathBuf};
    use vantare_compositor::escena::Escena;
    use vantare_compositor::escena::capas::{
        CapaId, Color, Curva, Dibujo, Instante, Lote, Operacion, Pintura, Propiedad, Rect, Tramo,
    };
    use vantare_compositor::plataforma::{Bucle, Modo, Opciones, Plataforma, Suceso};
    use vantare_compositor::receta;
    use windows::Win32::Foundation::RECT;

    const BASE: &str = env!("CARGO_MANIFEST_DIR");

    struct Args {
        caso: char,
        opciones: Opciones,
        durante: f64,
        salida: PathBuf,
    }

    fn args() -> Result<Args, String> {
        let mut a = Args {
            caso: ' ',
            opciones: Opciones::default(),
            durante: 600.0,
            salida: std::env::temp_dir().join("vantare-estres"),
        };
        let mut it = std::env::args().skip(1);
        while let Some(x) = it.next() {
            let mut valor = || it.next().ok_or_else(|| format!("falta el valor de {x}"));
            match x.as_str() {
                "--caso" => {
                    a.caso = valor()?.chars().next().ok_or("caso vacío")?;
                }
                "--warp" => a.opciones.warp = true,
                "--sin-infinitas" => {
                    a.opciones.repeticion_finita = Some(
                        valor()?
                            .parse()
                            .map_err(|e| format!("--sin-infinitas: {e}"))?,
                    );
                }
                "--durante" => {
                    a.durante = valor()?.parse().map_err(|e| format!("--durante: {e}"))?;
                }
                "--salida" => a.salida = valor()?.into(),
                otro => return Err(format!("argumento desconocido: {otro}")),
            }
        }
        if !"abcd".contains(a.caso) {
            return Err("indica --caso a|b|c|d".into());
        }
        Ok(a)
    }

    fn plataforma(o: Opciones) -> Result<Plataforma, String> {
        let region = RECT {
            left: 0,
            top: 0,
            right: 420,
            bottom: 265,
        };
        Plataforma::nueva_con(
            Modo::Monitor,
            region,
            &Path::new(BASE).join("../ui/assets/fonts"),
            o,
        )
        .map_err(|e| e.to_string())
    }

    fn rect(y: f32) -> Rect {
        Rect {
            x: 6.0,
            y,
            ancho: 408.0,
            alto: 24.0,
        }
    }

    fn panel(id: u32, y: f32) -> Vec<Operacion> {
        vec![
            Operacion::Crear {
                id: CapaId(id),
                padre: None,
                orden: id,
            },
            Operacion::Colocar {
                id: CapaId(id),
                rect: rect(y),
            },
            Operacion::Pintar {
                id: CapaId(id),
                dibujos: vec![Dibujo::Rect {
                    rect: Rect {
                        x: 0.0,
                        y: 0.0,
                        ancho: 408.0,
                        alto: 24.0,
                    },
                    radios: [6.0; 4],
                    relleno: Some(Pintura::Solido(Color {
                        r: 0.96,
                        g: 0.72,
                        b: 0.24,
                        a: 0.4,
                    })),
                    borde: None,
                }],
            },
        ]
    }

    /// Pulso 1 → 0,35 → 1 en 1,2 s (Hermite de pendiente 0), repetido para siempre.
    fn pulso(inicio: Instante) -> Curva {
        Curva {
            inicio,
            tramos: vec![
                Tramo {
                    desde: 0.0,
                    a: 1.0,
                    b: 0.0,
                    c: -5.416_667,
                    d: 6.018_518,
                },
                Tramo {
                    desde: 0.6,
                    a: 0.35,
                    b: 0.0,
                    c: 5.416_667,
                    d: -6.018_518,
                },
            ],
            fin: 1.2,
            final_: 1.0,
            repetir: Some((0.0, 1.2)),
        }
    }

    /// Transición finita de opacidad 0 → 1 en 0,25 s.
    fn fundido(inicio: Instante) -> Curva {
        Curva {
            inicio,
            tramos: vec![Tramo {
                desde: 0.0,
                a: 0.0,
                b: 4.0,
                c: 0.0,
                d: 0.0,
            }],
            fin: 0.25,
            final_: 1.0,
            repetir: None,
        }
    }

    fn esperar(p: &Plataforma, segundos: f64) -> Result<(), String> {
        let bucle = Bucle::nuevo().map_err(|e| e.to_string())?;
        let fin = Instante(p.ahora().map_err(|e| e.to_string())?.0 + segundos);
        loop {
            match bucle
                .esperar_hasta(p, false, Some(fin))
                .map_err(|e| e.to_string())?
            {
                Suceso::Cerrar => return Ok(()),
                _ if p.ahora().map_err(|e| e.to_string())?.0 >= fin.0 => return Ok(()),
                _ => {}
            }
        }
    }

    pub fn ejecutar() -> Result<(), String> {
        let a = args()?;
        println!(
            "caso {} · warp={} · sin_infinitas={:?}",
            a.caso, a.opciones.warp, a.opciones.repeticion_finita
        );
        let mut p = plataforma(a.opciones)?;
        let ahora = p.ahora().map_err(|e| e.to_string())?;
        match a.caso {
            'a' => {
                let mut ops = panel(1, 57.0);
                ops.push(Operacion::Animar {
                    id: CapaId(1),
                    propiedad: Propiedad::Opacidad,
                    curva: pulso(ahora),
                });
                p.aplicar(&Lote { operaciones: ops })
                    .map_err(|e| e.to_string())?;
                esperar(&p, a.durante)
            }
            'b' => {
                let mut ops = Vec::new();
                for id in 1..=20 {
                    ops.extend(panel(id, f32::from(u16::try_from(id).unwrap_or(0)) * 6.0));
                }
                p.aplicar(&Lote { operaciones: ops })
                    .map_err(|e| e.to_string())?;
                for vuelta in 0..500_u32 {
                    let t = Instante(ahora.0 + f64::from(vuelta) * 0.01);
                    let operaciones = (1..=20)
                        .map(|id| Operacion::Animar {
                            id: CapaId(id),
                            propiedad: Propiedad::Opacidad,
                            curva: if id % 2 == 0 { pulso(t) } else { fundido(t) },
                        })
                        .collect();
                    p.aplicar(&Lote { operaciones })
                        .map_err(|e| format!("vuelta {vuelta}: {e}"))?;
                }
                esperar(&p, 5.0)
            }
            'c' => {
                std::fs::create_dir_all(&a.salida).map_err(|e| e.to_string())?;
                let mut ops = panel(1, 57.0);
                ops.push(Operacion::Animar {
                    id: CapaId(1),
                    propiedad: Propiedad::Opacidad,
                    curva: pulso(ahora),
                });
                p.aplicar(&Lote { operaciones: ops })
                    .map_err(|e| e.to_string())?;
                for n in 0..300_u32 {
                    let instante = Instante(ahora.0 + f64::from(n) / 60.0);
                    p.capturar(None, instante, &a.salida.join(format!("{n:04}.png")))
                        .map_err(|e| format!("captura {n}: {e}"))?;
                }
                Ok(())
            }
            _ => recargas(&mut p, ahora),
        }
    }

    /// Caso D: el relativo real (escena con un rival a menos de 1 s, pulso activo)
    /// y 50 recargas del sistema con fundido entre el árbol viejo y el nuevo.
    fn recargas(p: &mut Plataforma, ahora: Instante) -> Result<(), String> {
        let leer = |relativa: &str| {
            let ruta = Path::new(BASE).join(relativa);
            std::fs::read_to_string(&ruta)
                .map(|t| (ruta.display().to_string(), t))
                .map_err(|e| format!("{relativa}: {e}"))
        };
        let (ruta_receta, receta_txt) = leer("recetas/relativo.receta.json")?;
        let (ruta_sistema, sistema_txt) = leer("sistemas/vantare.sistema.json")?;
        let (ruta_contrato, contrato_txt) = leer("modelos/relativo.modelo.json")?;
        let fuentes = ["Inter", "Rajdhani", "Space Mono"];
        let carga = receta::cargar_con_fuentes(
            (&ruta_receta, &receta_txt),
            (&ruta_sistema, &sistema_txt),
            (&ruta_contrato, &contrato_txt),
            &fuentes,
        )
        .map_err(|e| format!("{} diagnósticos al cargar", e.len()))?;
        let fotos = nucleo::leer_escena(
            Path::new(BASE).join("../ui/fixtures/relative-vantare-carrera.scene.json"),
        )
        .map_err(|e| e.to_string())?;
        let foto = fotos.get(1).ok_or("la escena necesita la foto 1")?;
        let modelo = nucleo::modelo(foto, nucleo::Ajustes::default());
        let mut escena = Escena::nueva(carga.receta);
        let lote = escena
            .actualizar(&modelo, ahora, &p.texto)
            .map_err(|e| e.to_string())?;
        p.aplicar(&lote).map_err(|e| e.to_string())?;
        let otro = sistema_txt.replace("\"texto\": \"#ece6e7\"", "\"texto\": \"#7dd3fc\"");
        for n in 0..50_u32 {
            let texto = if n % 2 == 0 { &otro } else { &sistema_txt };
            let sistema = receta::cargar_con_fuentes(
                (&ruta_receta, &receta_txt),
                (&ruta_sistema, texto),
                (&ruta_contrato, &contrato_txt),
                &fuentes,
            )
            .map_err(|e| format!("recarga {n}: {} diagnósticos", e.len()))?
            .sistema;
            let t = Instante(p.ahora().map_err(|e| e.to_string())?.0);
            let lote = escena
                .cambiar_sistema(sistema, t, &p.texto)
                .map_err(|e| format!("recarga {n}: {e}"))?;
            p.aplicar(&lote).map_err(|e| format!("recarga {n}: {e}"))?;
            esperar(p, 0.5)?;
            println!("recarga {n} aplicada");
        }
        Ok(())
    }
}
