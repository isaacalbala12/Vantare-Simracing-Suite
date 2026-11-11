//! Curvas absolutas QPC y evaluación de captura conforme a capas.rs.
use super::{Error, Resultado};
use crate::escena::capas::{Curva, Instante, Tramo};

pub(super) fn desplazar(tramo: &Tramo, delta: f64) -> Resultado<[f32; 4]> {
    let t = std::time::Duration::try_from_secs_f64(delta)
        .map_err(|_| Error::CurvaInvalida)?
        .as_secs_f32();
    Ok([
        tramo.a + t * (tramo.b + t * (tramo.c + t * tramo.d)),
        tramo.b + t * (2.0 * tramo.c + 3.0 * t * tramo.d),
        tramo.c + 3.0 * t * tramo.d,
        tramo.d,
    ])
}
pub(super) fn relativo(curva: &Curva, instante: Instante) -> f64 {
    let t = (instante.0 - curva.inicio.0).max(0.0);
    curva.repetir.map_or(t, |(desde, duracion)| {
        if t >= desde {
            desde + (t - desde).rem_euclid(duracion)
        } else {
            t
        }
    })
}
pub(super) fn evaluar(curva: &Curva, instante: Instante) -> Resultado<f32> {
    if curva.repetir.is_none() && instante.0 - curva.inicio.0 >= curva.fin {
        return Ok(curva.final_);
    }
    let t = relativo(curva, instante);
    curva
        .tramos
        .iter()
        .rev()
        .find(|s| s.desde <= t)
        .map_or(Err(Error::CurvaInvalida), |s| {
            desplazar(s, t - s.desde).map(|v| v[0])
        })
}
#[derive(Debug)]
pub(super) struct Programa {
    pub comienzo_qpc: i64,
    pub cubicos: Vec<(f64, [f32; 4])>,
    pub repetir: Option<(f64, f64)>,
    pub fin: Option<(f64, f32)>,
}
pub(super) fn programar(curva: &Curva, frecuencia: i64) -> Resultado<Programa> {
    if !curva.fin.is_finite()
        || curva.fin <= 0.0
        || !curva.final_.is_finite()
        || curva.tramos.is_empty()
    {
        return Err(Error::CurvaInvalida);
    }
    let mut anterior = None;
    for s in &curva.tramos {
        if ![s.a, s.b, s.c, s.d].iter().all(|v| v.is_finite())
            || !s.desde.is_finite()
            || s.desde < 0.0
            || s.desde >= curva.fin
            || anterior.is_some_and(|a| a >= s.desde)
        {
            return Err(Error::CurvaInvalida);
        }
        anterior = Some(s.desde);
    }
    if curva.tramos[0].desde != 0.0 {
        return Err(Error::CurvaInvalida);
    }
    let repetir = if let Some((desde, duracion)) = curva.repetir {
        if !desde.is_finite()
            || !duracion.is_finite()
            || desde < 0.0
            || duracion <= 0.0
            || !(desde + duracion).is_finite()
            || desde + duracion > curva.fin
        {
            return Err(Error::CurvaInvalida);
        }
        Some((desde + duracion, duracion))
    } else {
        None
    };
    let cubicos = curva
        .tramos
        .iter()
        .filter(|s| repetir.is_none_or(|(fin, _)| s.desde < fin))
        .map(|s| Ok((s.desde, [s.a, s.b, s.c, s.d])))
        .collect::<Resultado<_>>()?;
    Ok(Programa {
        comienzo_qpc: ticks(curva.inicio, frecuencia)?,
        cubicos,
        repetir,
        fin: curva.repetir.is_none().then_some((curva.fin, curva.final_)),
    })
}
fn ticks(instante: Instante, frecuencia: i64) -> Resultado<i64> {
    let duracion =
        std::time::Duration::try_from_secs_f64(instante.0).map_err(|_| Error::CurvaInvalida)?;
    let frecuencia = u128::try_from(frecuencia).map_err(|_| Error::CurvaInvalida)?;
    if frecuencia == 0 {
        return Err(Error::CurvaInvalida);
    }
    i64::try_from(
        duracion
            .as_nanos()
            .checked_mul(frecuencia)
            .ok_or(Error::CurvaInvalida)?
            .checked_add(500_000_000)
            .ok_or(Error::CurvaInvalida)?
            / 1_000_000_000,
    )
    .map_err(|_| Error::CurvaInvalida)
}
/// Sustituye `AddRepeat` (infinito) por copias explícitas del intervalo repetido
/// durante `segundos` y un `End` en el valor de reposo de la curva.
pub(super) fn desenrollar(programa: Programa, curva: &Curva, segundos: f64) -> Resultado<Programa> {
    let Some((fin_repeticion, duracion)) = programa.repetir else {
        return Ok(programa);
    };
    let inicio_repeticion = fin_repeticion - duracion;
    let ciclo: Vec<_> = programa
        .cubicos
        .iter()
        .filter(|(desde, _)| *desde >= inicio_repeticion)
        .copied()
        .collect();
    // El primer tramo del ciclo puede empezar antes del intervalo; se evalúa en su comienzo.
    let primero = curva
        .tramos
        .iter()
        .rev()
        .find(|t| t.desde <= inicio_repeticion)
        .ok_or(Error::CurvaInvalida)?;
    let entrada = desplazar(primero, inicio_repeticion - primero.desde)?;
    let mut cubicos = programa.cubicos;
    let mut desplazamiento = fin_repeticion;
    // Tope de tramos: nunca más de 4096 segmentos por animación.
    while desplazamiento < fin_repeticion + segundos && cubicos.len() < 4096 {
        cubicos.push((desplazamiento, entrada));
        for (desde, coef) in ciclo.iter().filter(|(d, _)| *d > inicio_repeticion) {
            cubicos.push((desplazamiento + desde - inicio_repeticion, *coef));
        }
        desplazamiento += duracion;
    }
    let reposo = evaluar(curva, Instante(curva.inicio.0 + inicio_repeticion))?;
    Ok(Programa {
        comienzo_qpc: programa.comienzo_qpc,
        cubicos,
        repetir: None,
        fin: Some((desplazamiento, reposo)),
    })
}

/// Envolvente de toda la curva, incluidos extremos interiores de cada cúbica.
pub(super) fn rango(curva: &Curva) -> super::Resultado<(f32, f32)> {
    programar(curva, 10_000_000)?;
    let mut minimo = curva.final_;
    let mut maximo = curva.final_;
    for (indice, tramo) in curva.tramos.iter().enumerate() {
        let limite = curva
            .repetir
            .map_or(curva.fin, |(desde, duracion)| desde + duracion);
        if tramo.desde >= limite {
            break;
        }
        let fin = curva
            .tramos
            .get(indice + 1)
            .map_or(limite, |s| s.desde.min(limite));
        // Tiempo local al tramo (capas.rs y AddCubic: t = 0 al comienzo del tramo).
        let largo = fin - tramo.desde;
        let mut puntos = vec![0.0, largo];
        let lineal = tramo.b;
        let cuadratico = 2.0 * tramo.c;
        let cubico = 3.0 * tramo.d;
        if cubico == 0.0 {
            if cuadratico != 0.0 {
                puntos.push(f64::from(-lineal / cuadratico));
            }
        } else {
            let discriminante = cuadratico * cuadratico - 4.0 * cubico * lineal;
            if discriminante >= 0.0 {
                let raiz = discriminante.sqrt();
                puntos.extend([
                    f64::from((-cuadratico - raiz) / (2.0 * cubico)),
                    f64::from((-cuadratico + raiz) / (2.0 * cubico)),
                ]);
            }
        }
        for t in puntos.into_iter().filter(|t| *t >= 0.0 && *t <= largo) {
            let valor = desplazar(tramo, t)?[0];
            if !valor.is_finite() {
                return Err(super::Error::Entrada("La curva excede el rango de pintura"));
            }
            minimo = minimo.min(valor);
            maximo = maximo.max(valor);
        }
    }
    Ok((minimo, maximo))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Modo sin animaciones infinitas: mismo valor que la curva repetida
    /// mientras dura el desenrollado y reposo después (prueba pura, sin GPU).
    #[test]
    fn desenrollar_reproduce_la_repeticion_y_termina_en_reposo() {
        let curva = Curva {
            inicio: Instante(0.0),
            tramos: vec![
                Tramo {
                    desde: 0.0,
                    a: 0.0,
                    b: 2.0,
                    c: 0.0,
                    d: 0.0,
                },
                Tramo {
                    desde: 0.5,
                    a: 1.0,
                    b: -1.0,
                    c: 0.0,
                    d: 0.0,
                },
            ],
            fin: 1.5,
            final_: 0.5,
            repetir: Some((0.5, 1.0)),
        };
        let programa = programar(&curva, 10_000_000).unwrap();
        let finito = desenrollar(programa, &curva, 3.0).unwrap();
        assert!(finito.repetir.is_none());
        let (fin, reposo) = finito.fin.unwrap();
        let valor = |t: f64| {
            let (desde, coef) = finito
                .cubicos
                .iter()
                .rev()
                .find(|(desde, _)| *desde <= t)
                .unwrap();
            let local = std::time::Duration::from_secs_f64(t - desde).as_secs_f32();
            coef[0] + local * (coef[1] + local * (coef[2] + local * coef[3]))
        };
        for paso in 0..30 {
            let t = f64::from(paso) * 0.1;
            if t < fin {
                assert!(
                    (valor(t) - evaluar(&curva, Instante(t)).unwrap()).abs() < 1e-4,
                    "t={t}"
                );
            }
        }
        assert!((reposo - 1.0).abs() < 1e-5);
        assert!(fin >= 3.5);
    }

    /// `capas.rs`: el polinomio de cada tramo usa t local al tramo, igual que `AddCubic`.
    #[test]
    fn el_tiempo_de_cada_tramo_empieza_en_su_comienzo() {
        let curva = Curva {
            inicio: Instante(10.0),
            tramos: vec![
                Tramo {
                    desde: 0.0,
                    a: 0.0,
                    b: 1.0,
                    c: 0.0,
                    d: 0.0,
                },
                Tramo {
                    desde: 1.0,
                    a: 1.0,
                    b: -0.5,
                    c: 0.0,
                    d: 0.0,
                },
            ],
            fin: 2.0,
            final_: 0.5,
            repetir: None,
        };
        // En t = 1,5 el segundo tramo vale 1 − 0,5·0,5 = 0,75 (no 1 − 0,5·1,5).
        assert!((evaluar(&curva, Instante(11.5)).unwrap() - 0.75).abs() < 1e-5);
        let programa = programar(&curva, 10_000_000).unwrap();
        assert_eq!(programa.cubicos[1], (1.0, [1.0, -0.5, 0.0, 0.0]));
        let (minimo, maximo) = rango(&curva).unwrap();
        assert!((minimo - 0.0).abs() < 1e-5 && (maximo - 1.0).abs() < 1e-5);
    }
    fn curva() -> Curva {
        Curva {
            inicio: Instante(100.0),
            tramos: vec![Tramo {
                desde: 0.0,
                a: 0.0,
                b: 1.0,
                c: 0.0,
                d: 0.0,
            }],
            fin: 4.0,
            final_: 9.0,
            repetir: Some((0.0, 2.0)),
        }
    }
    #[test]
    fn el_bucle_desde_cero_es_infinito_y_no_alcanza_fin() {
        let c = curva();
        let p = programar(&c, 10_000_000).unwrap();
        assert_eq!(p.repetir, Some((2.0, 2.0)));
        assert_eq!(p.fin, None);
        for t in [0.25, 2.25, 100.25] {
            assert!((evaluar(&c, Instante(100.0 + t)).unwrap() - 0.25).abs() < 0.0001);
        }
    }
    #[test]
    fn la_entrada_al_bucle_se_recorre_una_vez() {
        let mut c = curva();
        c.repetir = Some((1.0, 2.0));
        assert!((evaluar(&c, Instante(100.5)).unwrap() - 0.5).abs() < 0.0001);
        assert!((evaluar(&c, Instante(105.5)).unwrap() - 1.5).abs() < 0.0001);
        assert_eq!(programar(&c, 10).unwrap().repetir, Some((3.0, 2.0)));
    }
    #[test]
    fn programa_el_inicio_qpc_original_incluso_si_ya_esta_en_el_pasado() {
        let c = curva();
        let p = programar(&c, 10_000_000).unwrap();
        assert_eq!(p.comienzo_qpc, 1_000_000_000);
        assert_eq!(p.cubicos[0], (0.0, [0.0, 1.0, 0.0, 0.0]));
        assert!((evaluar(&c, Instante(105.5)).unwrap() - 1.5).abs() < 0.0001);
    }
    #[test]
    fn rechaza_intervalos_invalidos_y_conserva_finales_finitos() {
        let mut c = curva();
        c.repetir = Some((3.0, 2.0));
        assert!(programar(&c, 10).is_err());
        c.repetir = None;
        assert_eq!(programar(&c, 10).unwrap().fin, Some((4.0, 9.0)));
        assert!((evaluar(&c, Instante(110.0)).unwrap() - 9.0).abs() < f32::EPSILON);
        c.tramos[0].b = f32::NAN;
        assert!(programar(&c, 10).is_err());
    }
    #[test]
    fn envolvente_incluye_extremos_interiores() {
        let mut c = curva();
        c.repetir = None;
        c.fin = 1.0;
        c.final_ = 0.0;
        c.tramos[0].b = 4.0;
        c.tramos[0].c = -4.0;
        let (min, max) = rango(&c).unwrap();
        assert!(min.abs() < 0.0001);
        assert!((max - 1.0).abs() < 0.0001);
    }
}
