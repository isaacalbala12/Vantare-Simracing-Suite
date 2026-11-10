//! Guion de capas independiente de receta/modelo. Solo Windows.
#[cfg(not(windows))]
fn main() {
    eprintln!("demo_capas requiere Windows");
}
#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    demo::ejecutar()
}
#[cfg(windows)]
mod demo {
    use std::path::PathBuf;
    use vantare_compositor::{
        escena::capas::{
            Alineacion, CapaId, Color, Curva, Dibujo, Fuente, Instante, Lote, Operacion, Parada,
            Pintura, Propiedad, Rect, Tramo,
        },
        plataforma::{Bucle, Medicion, Modo, Plataforma, Suceso},
    };
    use windows::Win32::{
        Foundation::RECT,
        UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN},
    };

    fn c(r: f32, g: f32, b: f32, a: f32) -> Color {
        Color { r, g, b, a }
    }
    fn rect(x: f32, y: f32, ancho: f32, alto: f32) -> Rect {
        Rect { x, y, ancho, alto }
    }
    fn fuente() -> Fuente {
        Fuente {
            familia: "Inter".into(),
            peso: 500,
            tamano: 16.0,
            interletra: 0.0,
            interlinea: 24.0,
            tabulares: true,
            mayusculas: false,
        }
    }
    fn animacion(
        id: u32,
        p: Propiedad,
        inicio: Instante,
        a: f32,
        b: f32,
        fin: f64,
        final_: f32,
    ) -> Operacion {
        Operacion::Animar {
            id: CapaId(id),
            propiedad: p,
            curva: Curva {
                inicio,
                tramos: vec![Tramo {
                    desde: 0.0,
                    a,
                    b,
                    c: 0.0,
                    d: 0.0,
                }],
                fin,
                final_,
                repetir: None,
            },
        }
    }
    fn segunda_raiz(inicio: Instante) -> [Operacion; 6] {
        [
            Operacion::Crear {
                id: CapaId(10),
                padre: None,
                orden: 1,
            },
            Operacion::Colocar {
                id: CapaId(10),
                rect: rect(680.0, 140.0, 240.0, 80.0),
            },
            Operacion::Pintar {
                id: CapaId(10),
                dibujos: vec![
                    Dibujo::Rect {
                        rect: rect(0.0, 0.0, 240.0, 80.0),
                        radios: [20.0, 4.0, 20.0, 4.0],
                        relleno: Some(Pintura::Solido(c(0.16, 0.08, 0.24, 0.92))),
                        borde: Some((1.0, Pintura::Solido(c(0.6, 0.4, 0.9, 1.0)))),
                    },
                    Dibujo::Texto {
                        caja: rect(12.0, 24.0, 216.0, 30.0),
                        texto: "Segunda raíz · mismo commit".into(),
                        fuente: fuente(),
                        color: c(1.0, 1.0, 1.0, 1.0),
                        alineacion: Alineacion::Centro,
                    },
                ],
            },
            Operacion::Fijar {
                id: CapaId(10),
                propiedad: Propiedad::Giro,
                valor: -5.0,
            },
            Operacion::Fijar {
                id: CapaId(10),
                propiedad: Propiedad::Escala,
                valor: 0.9,
            },
            animacion(10, Propiedad::Opacidad, inicio, 0.0, 1.0, 1.0, 1.0),
        ]
    }
    fn pulso(inicio: Instante) -> Operacion {
        Operacion::Animar {
            id: CapaId(3),
            propiedad: Propiedad::Opacidad,
            curva: Curva {
                inicio,
                tramos: vec![
                    Tramo {
                        desde: 0.0,
                        a: 0.4,
                        b: 0.6,
                        c: 0.0,
                        d: 0.0,
                    },
                    Tramo {
                        desde: 1.0,
                        a: 1.6,
                        b: -0.6,
                        c: 0.0,
                        d: 0.0,
                    },
                ],
                fin: 20.0,
                final_: 1.0,
                repetir: Some((2.0, 2.0)),
            },
        }
    }
    fn inicial(inicio: Instante) -> Lote {
        let mut operaciones = vec![
            Operacion::Crear {
                id: CapaId(1),
                padre: None,
                orden: 0,
            },
            Operacion::Colocar {
                id: CapaId(1),
                rect: rect(160.0, 120.0, 480.0, 260.0),
            },
            Operacion::Pintar {
                id: CapaId(1),
                dibujos: vec![
                    Dibujo::Sombra {
                        rect: rect(20.0, 20.0, 440.0, 220.0),
                        radios: [12.0; 4],
                        color: c(0.0, 0.0, 0.0, 0.7),
                        desenfoque: 8.0,
                        desplazamiento: (0.0, 5.0),
                    },
                    Dibujo::Rect {
                        rect: rect(20.0, 20.0, 440.0, 220.0),
                        radios: [12.0; 4],
                        relleno: Some(Pintura::Lineal {
                            desde: (0.0, 0.0),
                            hasta: (1.0, 1.0),
                            paradas: vec![
                                Parada {
                                    posicion: 0.0,
                                    color: c(0.10, 0.11, 0.18, 0.98),
                                },
                                Parada {
                                    posicion: 1.0,
                                    color: c(0.03, 0.03, 0.06, 0.98),
                                },
                            ],
                        }),
                        borde: Some((1.0, Pintura::Solido(c(0.5, 0.5, 0.6, 0.5)))),
                    },
                    Dibujo::Texto {
                        caja: rect(40.0, 32.0, 400.0, 28.0),
                        texto: "VANTA · DirectComposition".into(),
                        fuente: fuente(),
                        color: c(1.0, 1.0, 1.0, 1.0),
                        alineacion: Alineacion::Inicio,
                    },
                ],
            },
        ];
        operaciones.extend(segunda_raiz(inicio));
        for i in 0_u16..3 {
            let id = u32::from(i) + 2;
            operaciones.extend([
                Operacion::Crear {id:CapaId(id),padre:Some(CapaId(1)),orden:id},
                Operacion::Colocar {id:CapaId(id),rect:rect(40.0,80.0+f32::from(i)*44.0,400.0,36.0)},
                Operacion::Pintar {id:CapaId(id),dibujos:vec![
                    Dibujo::Recorte {rect:rect(0.0,0.0,400.0,36.0),radios:[4.0;4]},
                    Dibujo::Rect {rect:rect(0.0,0.0,400.0,36.0),radios:[4.0;4],relleno:Some(Pintura::Radial {centro:(0.0,0.5),radio:(1.0,1.0),paradas:vec![Parada {posicion:0.0,color:c(0.3,0.15,0.6,0.8)},Parada {posicion:1.0,color:c(0.2,0.2,0.3,0.2)}]}),borde:None},
                    Dibujo::Texto {caja:rect(10.0,4.0,380.0,28.0),texto:format!("P{}   Inter 01:23.456    texto largo recortado con puntos suspensivos",i+1),fuente:fuente(),color:c(0.94,0.94,0.97,1.0),alineacion:Alineacion::Inicio},
                    Dibujo::FinRecorte,
                ]},
            ]);
        }
        operaciones.push(animacion(
            1,
            Propiedad::Opacidad,
            inicio,
            0.0,
            1.0,
            1.0,
            1.0,
        ));
        operaciones.push(animacion(1, Propiedad::Y, inicio, -20.0, 20.0, 1.0, 0.0));
        operaciones.push(pulso(inicio));
        Lote { operaciones }
    }
    fn interrupcion(inicio: Instante) -> Vec<Operacion> {
        vec![
            Operacion::Colocar {
                id: CapaId(2),
                rect: rect(40.0, 80.0, 400.0, 36.0),
            },
            Operacion::Animar {
                id: CapaId(2),
                propiedad: Propiedad::Y,
                curva: Curva {
                    inicio: Instante(inicio.0 + 1.5),
                    // Conserva valor 22 y velocidad +44 al interrumpir; frena y vuelve.
                    tramos: vec![Tramo {
                        desde: 0.0,
                        a: 22.0,
                        b: 44.0,
                        c: -154.0,
                        d: 88.0,
                    }],
                    fin: 1.0,
                    final_: 0.0,
                    repetir: None,
                },
            },
        ]
    }
    fn paso(n: u8, inicio: Instante) -> Lote {
        let operaciones = match n {
            1 => vec![
                Operacion::Colocar {
                    id: CapaId(2),
                    rect: rect(40.0, 124.0, 400.0, 36.0),
                },
                animacion(
                    2,
                    Propiedad::Y,
                    Instante(inicio.0 + 1.0),
                    -44.0,
                    44.0,
                    1.0,
                    0.0,
                ),
            ],
            2 => interrupcion(inicio),
            3 => vec![
                animacion(
                    1,
                    Propiedad::Opacidad,
                    Instante(inicio.0 + 3.0),
                    1.0,
                    -1.0,
                    1.0,
                    0.0,
                ),
                animacion(
                    1,
                    Propiedad::Y,
                    Instante(inicio.0 + 3.0),
                    0.0,
                    -20.0,
                    1.0,
                    -20.0,
                ),
            ],
            4 => vec![
                animacion(
                    10,
                    Propiedad::Escala,
                    Instante(inicio.0 + 4.0),
                    0.9,
                    0.1,
                    1.0,
                    1.0,
                ),
                animacion(
                    10,
                    Propiedad::Giro,
                    Instante(inicio.0 + 4.0),
                    -5.0,
                    5.0,
                    1.0,
                    0.0,
                ),
                animacion(
                    1,
                    Propiedad::Opacidad,
                    Instante(inicio.0 + 4.0),
                    0.0,
                    1.0,
                    1.0,
                    1.0,
                ),
                animacion(
                    1,
                    Propiedad::Y,
                    Instante(inicio.0 + 4.0),
                    -20.0,
                    20.0,
                    1.0,
                    0.0,
                ),
            ],
            5 => vec![Operacion::Quitar { id: CapaId(10) }],
            _ => Vec::new(),
        };
        Lote { operaciones }
    }
    fn capturar_instante(
        p: &mut Plataforma,
        modo: Modo,
        inicio: Instante,
        en: f64,
        ruta: &std::path::Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        for (n, t) in [(1, 1.0), (2, 1.5), (3, 3.0), (4, 4.0), (5, 6.0)] {
            if en >= t {
                p.aplicar(&paso(n, inicio))?;
            }
        }
        p.capturar(
            if modo == Modo::Monitor {
                None
            } else {
                Some(CapaId(1))
            },
            Instante(inicio.0 + en),
            ruta,
        )?;
        println!("Captura premultiplicada: {}", ruta.display());
        Ok(())
    }
    pub fn ejecutar() -> Result<(), Box<dyn std::error::Error>> {
        let mut modo = Modo::Monitor;
        let mut captura = None;
        let mut en = 0.5_f64;
        let mut medir = None;
        let mut durante = 6.0_f64;
        let mut salir = None;
        let mut fuentes = std::env::var_os("VANTARE_COMPOSITOR_FUENTES").map_or_else(
            || PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/../ui/assets/fonts")),
            PathBuf::from,
        );
        let mut args = std::env::args().skip(1);
        while let Some(arg) = args.next() {
            let valor = args.next().ok_or("Falta valor del argumento")?;
            match arg.as_str() {
                "--modo" => {
                    modo = match valor.as_str() {
                        "monitor" => Modo::Monitor,
                        "por-overlay" => Modo::PorOverlay,
                        _ => return Err("Modo desconocido".into()),
                    }
                }
                "--captura" => captura = Some(PathBuf::from(valor)),
                "--en" => en = valor.parse()?,
                "--medir" => medir = Some(PathBuf::from(valor)),
                "--durante" => durante = valor.parse()?,
                "--salir-tras" => salir = Some(valor.parse::<f64>()?),
                "--fuentes" => fuentes = PathBuf::from(valor),
                _ => return Err(format!("Argumento desconocido: {arg}").into()),
            }
        }
        if !en.is_finite() || en < 0.0 || !durante.is_finite() || durante <= 0.0 {
            return Err("Tiempo inválido".into());
        }
        let region = unsafe {
            RECT {
                left: 0,
                top: 0,
                right: GetSystemMetrics(SM_CXSCREEN),
                bottom: GetSystemMetrics(SM_CYSCREEN),
            }
        };
        let mut p = Plataforma::nueva(modo, region, &fuentes)?;
        if medir.is_some() {
            p.iniciar_medicion();
        }
        let inicio = p.ahora()?;
        p.aplicar(&inicial(inicio))?;
        println!("Ventanas: {}", p.ventanas().len());
        if let Some(ruta) = captura {
            return capturar_instante(&mut p, modo, inicio, en, &ruta);
        }
        let bucle = Bucle::nuevo()?;
        let mut medicion = Medicion::default();
        let mut siguiente = 1_usize;
        let tiempos = [(1_u8, 1.0), (2, 1.5), (3, 3.0), (4, 4.0), (5, 6.0)];
        loop {
            let proximo = tiempos.get(siguiente - 1).map(|(_, t)| *t);
            let limite = proximo
                .into_iter()
                .chain(salir)
                .chain(medir.as_ref().map(|_| durante))
                .min_by(f64::total_cmp)
                .map(|t| Instante(inicio.0 + t));
            if let Suceso::Cerrar = bucle.esperar_hasta(&p, medir.is_some(), limite)? {
                break;
            }
            let transcurrido = p.ahora()?.0 - inicio.0;
            if medir.is_some() {
                medicion.registrar_estado_reloj(bucle.estado_reloj());
                medicion.fotograma(&p)?;
            }
            if siguiente <= tiempos.len() && transcurrido >= tiempos[siguiente - 1].1 {
                p.aplicar(&paso(tiempos[siguiente - 1].0, inicio))?;
                siguiente += 1;
            }
            if salir.is_some_and(|s| transcurrido >= s)
                || (medir.is_some() && transcurrido >= durante)
            {
                break;
            }
        }
        if let Some(ruta) = medir {
            medicion.guardar(&p, &ruta)?;
            println!("Medida: {}", ruta.display());
        }
        Ok(())
    }
}
