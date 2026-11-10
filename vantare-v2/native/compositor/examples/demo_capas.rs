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
    fn fuente_display() -> Fuente {
        Fuente {
            familia: "Rajdhani".into(),
            peso: 600,
            tamano: 22.0,
            interlinea: 28.0,
            ..fuente()
        }
    }
    fn fuente_mono() -> Fuente {
        Fuente {
            familia: "Space Mono".into(),
            peso: 400,
            tamano: 12.0,
            interlinea: 30.0,
            interletra: 0.5,
            ..fuente()
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
                        fuente: fuente_mono(),
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
                repetir: Some((0.0, 2.0)),
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
                        desenfoque: 26.0,
                        desplazamiento: (0.0, 10.0),
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
                        caja: rect(40.0, 33.0, 400.0, 28.0),
                        texto: "VANTA · DirectComposition".into(),
                        fuente: fuente_display(),
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
    fn orden(padre: Option<u32>, hijos: &[u32]) -> Operacion {
        Operacion::Ordenar {
            padre: padre.map(CapaId),
            hijos: hijos.iter().copied().map(CapaId).collect(),
        }
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
                orden(Some(1), &[3, 4, 2]),
                orden(None, &[10, 1]),
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
                orden(Some(1), &[2, 3, 4]),
                orden(None, &[1, 10]),
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
    fn capturar_texto(
        p: &mut Plataforma,
        ruta: &std::path::Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let fuente = Fuente {
            familia: "Inter".into(),
            peso: 400,
            tamano: 13.0,
            interletra: 0.0,
            interlinea: 24.0,
            tabulares: true,
            mayusculas: false,
        };
        let caja = rect(0.0, 0.0, 420.0, 212.0);
        let dibujos = vec![
            Dibujo::Sombra {
                rect: caja,
                radios: [10.0; 4],
                color: c(0.0, 0.0, 0.0, 0.45),
                desenfoque: 26.0,
                desplazamiento: (0.0, 10.0),
            },
            Dibujo::Rect {
                rect: caja,
                radios: [10.0; 4],
                relleno: Some(Pintura::Lineal {
                    desde: (0.5, 0.0),
                    hasta: (0.5, 1.0),
                    paradas: vec![
                        Parada {
                            posicion: 0.0,
                            color: c(28.0 / 255.0, 24.0 / 255.0, 26.0 / 255.0, 245.0 / 255.0),
                        },
                        Parada {
                            posicion: 1.0,
                            color: c(17.0 / 255.0, 15.0 / 255.0, 16.0 / 255.0, 245.0 / 255.0),
                        },
                    ],
                }),
                borde: Some((1.0, Pintura::Solido(c(1.0, 1.0, 1.0, 18.0 / 255.0)))),
            },
            Dibujo::Texto {
                caja: rect(61.0, 57.0, 300.0, 24.0),
                texto: "A. Lotterer".into(),
                fuente: fuente.clone(),
                color: c(236.0 / 255.0, 230.0 / 255.0, 231.0 / 255.0, 1.0),
                alineacion: Alineacion::Inicio,
            },
            Dibujo::Texto {
                caja: rect(300.0, 57.0, 108.0, 24.0),
                texto: "-3.8".into(),
                fuente: Fuente {
                    familia: "Space Mono".into(),
                    tamano: 12.0,
                    ..fuente
                },
                color: c(163.0 / 255.0, 154.0 / 255.0, 156.0 / 255.0, 1.0),
                alineacion: Alineacion::Fin,
            },
        ];
        p.aplicar(&Lote {
            operaciones: vec![
                Operacion::Crear {
                    id: CapaId(1),
                    padre: None,
                    orden: 0,
                },
                Operacion::Colocar {
                    id: CapaId(1),
                    rect: caja,
                },
                Operacion::Pintar {
                    id: CapaId(1),
                    dibujos,
                },
            ],
        })?;
        p.capturar(None, p.ahora()?, ruta)?;
        Ok(())
    }
    pub fn ejecutar() -> Result<(), Box<dyn std::error::Error>> {
        let mut modo = Modo::Monitor;
        let mut captura = None;
        let mut texto_referencia = None;
        let mut repintar_hz = 0.0_f64;
        let mut monitor_confirmado = false;
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
                "--texto-referencia" => texto_referencia = Some(PathBuf::from(valor)),
                "--repintar-hz" => repintar_hz = valor.parse()?,
                "--monitor-confirmado" => {
                    monitor_confirmado = match valor.as_str() {
                        "si" => true,
                        "no" => false,
                        _ => return Err("Usa si o no para --monitor-confirmado".into()),
                    }
                }
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
        if !repintar_hz.is_finite() || !(0.0..=60.0).contains(&repintar_hz) {
            return Err("Frecuencia de repintado inválida".into());
        }
        let mut region = unsafe {
            RECT {
                left: 0,
                top: 0,
                right: GetSystemMetrics(SM_CXSCREEN),
                bottom: GetSystemMetrics(SM_CYSCREEN),
            }
        };
        if texto_referencia.is_some() {
            modo = Modo::Monitor;
            region = RECT {
                left: 0,
                top: 0,
                right: 420,
                bottom: 265,
            };
        }
        let mut p = Plataforma::nueva(modo, region, &fuentes)?;
        if let Some(ruta) = texto_referencia {
            return capturar_texto(&mut p, &ruta);
        }
        let mut medicion = if medir.is_some() {
            medir_reposo(&p)?
        } else {
            Medicion::default()
        };
        medicion.confirmar_monitor_encendido(monitor_confirmado);
        if medir.is_some() {
            p.iniciar_medicion();
        }
        let inicio = p.ahora()?;
        p.aplicar(&inicial(inicio))?;
        println!("Ventanas: {}", p.ventanas().len());
        if let Some(ruta) = captura {
            return capturar_instante(&mut p, modo, inicio, en, &ruta);
        }
        bucle_guion(p, inicio, medir, durante, salir, repintar_hz, medicion)
    }
    fn medir_reposo(p: &Plataforma) -> Result<Medicion, Box<dyn std::error::Error>> {
        let mut medicion = Medicion::default();
        let fin = Instante(p.ahora()?.0 + 2.0);
        medicion.comenzar_reposo(p, fin)?;
        let bucle = Bucle::nuevo()?;
        while p.ahora()?.0 < fin.0 {
            if matches!(bucle.esperar_hasta(p, false, Some(fin))?, Suceso::Cerrar) {
                return Err("Cerrado durante la muestra de reposo".into());
            }
        }
        medicion.fotograma(p)?;
        Ok(medicion)
    }
    fn repintado(numero: u32) -> Lote {
        let mut lote = inicial(Instante(0.0));
        lote.operaciones
            .retain(|op| matches!(op,Operacion::Pintar{id,..} if (2..=4).contains(&id.0)));
        for op in &mut lote.operaciones {
            if let Operacion::Pintar { id, dibujos } = op {
                for d in dibujos {
                    if let Dibujo::Texto { texto, .. } = d {
                        *texto = format!(
                            "P{}  Inter   gap -{}.{}",
                            id.0 - 1,
                            numero / 10,
                            numero % 10
                        );
                    }
                }
            }
        }
        lote
    }
    fn bucle_guion(
        mut p: Plataforma,
        inicio: Instante,
        medir: Option<PathBuf>,
        durante: f64,
        salir: Option<f64>,
        repintar_hz: f64,
        mut medicion: Medicion,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let bucle = Bucle::nuevo()?;
        if medir.is_some() {
            medicion.comenzar_transicion(&p, "entrada y pulso", Instante(inicio.0 + 1.0))?;
        }
        let mut siguiente = 1_usize;
        let mut repintado_siguiente = 1_u32;
        let tiempos = [(1_u8, 1.0), (2, 1.5), (3, 3.0), (4, 4.0), (5, 6.0)];
        loop {
            let proximo = tiempos.get(siguiente - 1).map(|(_, t)| *t);
            let limite = proximo
                .into_iter()
                .chain((repintar_hz > 0.0).then_some(f64::from(repintado_siguiente) / repintar_hz))
                .chain(salir)
                .chain(medir.as_ref().map(|_| durante))
                .min_by(f64::total_cmp)
                .map(|t| Instante(inicio.0 + t));
            match bucle.esperar_hasta(&p, medir.is_some(), limite)? {
                Suceso::Cerrar => break,
                Suceso::PantallasCambiadas => {
                    p.actualizar_dpi()?;
                }
                _ => {}
            }
            let transcurrido = p.ahora()?.0 - inicio.0;
            if medir.is_some() {
                medicion.registrar_estado_reloj(bucle.estado_reloj());
                medicion.fotograma(&p)?;
            }
            if siguiente <= tiempos.len() && transcurrido >= tiempos[siguiente - 1].1 {
                let (numero, t) = tiempos[siguiente - 1];
                if medir.is_some() {
                    medicion.comenzar_transicion(
                        &p,
                        &format!("paso {numero}"),
                        Instante(inicio.0 + t + 1.0),
                    )?;
                }
                p.aplicar(&paso(numero, inicio))?;
                siguiente += 1;
            }
            if repintar_hz > 0.0 && transcurrido >= f64::from(repintado_siguiente) / repintar_hz {
                p.aplicar(&repintado(repintado_siguiente))?;
                repintado_siguiente = repintado_siguiente
                    .checked_add(1)
                    .ok_or("Demasiados repintados")?;
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
