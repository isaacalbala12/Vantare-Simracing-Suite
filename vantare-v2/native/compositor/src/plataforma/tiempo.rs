//! Rebasa los polinomios absolutos a la primera presentación del commit.
use crate::escena::capas::{Curva, Instante, Tramo};

/// Coeficientes de un tramo tras trasladar su origen `delta` segundos.
/// `Tramo` usa tiempo relativo al inicio de la curva, según capas.rs.
pub(super) fn desplazar(tramo: &Tramo, delta: f64) -> super::Resultado<[f32; 4]> {
    let delta = std::time::Duration::try_from_secs_f64(delta)
        .map_err(|_| super::Error::Entrada("Tiempo no finito o negativo"))?
        .as_secs_f32();
    let [a, b, c, d] = [tramo.a, tramo.b, tramo.c, tramo.d];
    Ok([
        a + delta * (b + delta * (c + delta * d)),
        b + delta * (2.0 * c + 3.0 * delta * d),
        c + 3.0 * delta * d,
        d,
    ])
}

pub(super) fn relativo(curva: &Curva, instante: Instante) -> f64 {
    let t = (instante.0 - curva.inicio.0).max(0.0);
    if let Some((desde, duracion)) = curva.repetir
        && duracion > 0.0
        && t >= desde
    {
        return desde - duracion + (t - desde).rem_euclid(duracion);
    }
    t
}

pub(super) fn evaluar(curva: &Curva, instante: Instante) -> super::Resultado<f32> {
    let t = relativo(curva, instante);
    if instante.0 - curva.inicio.0 >= curva.fin {
        return Ok(curva.final_);
    }
    curva
        .tramos
        .iter()
        .rev()
        .find(|tramo| tramo.desde <= t)
        .map_or(Ok(curva.final_), |tramo| {
            desplazar(tramo, t).map(|coeficientes| coeficientes[0])
        })
}

pub(super) struct Programa {
    pub cubicos: Vec<(f64, [f32; 4])>,
    pub repetir: Option<(f64, f64)>,
    pub fin: f64,
}

pub(super) fn programar(curva: &Curva, instante: Instante) -> super::Resultado<Programa> {
    use super::Error;
    if !instante.0.is_finite()
        || !curva.inicio.0.is_finite()
        || !curva.fin.is_finite()
        || curva.fin <= 0.0
        || !curva.final_.is_finite()
        || curva.tramos.is_empty()
    {
        return Err(Error::Entrada("Curva vacía o tiempo inválido"));
    }
    let mut anterior = None;
    for tramo in &curva.tramos {
        if ![tramo.a, tramo.b, tramo.c, tramo.d]
            .iter()
            .all(|v| v.is_finite())
            || !tramo.desde.is_finite()
            || tramo.desde < 0.0
            || tramo.desde >= curva.fin
            || anterior.is_some_and(|t| t >= tramo.desde)
        {
            return Err(Error::Entrada("Tramos de curva inválidos o desordenados"));
        }
        anterior = Some(tramo.desde);
    }
    if curva.tramos[0].desde != 0.0 {
        return Err(Error::Entrada("La curva debe empezar en cero"));
    }
    let transcurrido = (instante.0 - curva.inicio.0).max(0.0);
    let demora = (curva.inicio.0 - instante.0).max(0.0);
    let restante = curva.fin - transcurrido + demora;
    let mut programa = Programa {
        cubicos: Vec::new(),
        repetir: None,
        fin: restante,
    };
    if restante <= 0.0 {
        return Ok(programa);
    }
    let mut offset = demora;
    if demora > 0.0 {
        programa
            .cubicos
            .push((0.0, [evaluar(curva, curva.inicio)?, 0.0, 0.0, 0.0]));
    }
    let mut agregar = |desde: f64, hasta: f64| -> super::Resultado<()> {
        if hasta <= desde || offset >= restante {
            return Ok(());
        }
        let activo = curva
            .tramos
            .iter()
            .rposition(|s| s.desde <= desde)
            .ok_or(Error::Entrada("Curva sin tramo activo"))?;
        for (indice, tramo) in curva.tramos.iter().enumerate().skip(activo) {
            let origen = if indice == activo { desde } else { tramo.desde };
            if origen >= hasta || offset + origen - desde >= restante {
                break;
            }
            programa
                .cubicos
                .push((offset + origen - desde, desplazar(tramo, origen)?));
        }
        offset += hasta - desde;
        Ok(())
    };
    if let Some((desde, duracion)) = curva.repetir {
        let inicio = desde - duracion;
        if !desde.is_finite()
            || !duracion.is_finite()
            || duracion <= 0.0
            || inicio < 0.0
            || desde > curva.fin
        {
            return Err(Error::Entrada("Repetición sin intervalo previo válido"));
        }
        if transcurrido < inicio {
            agregar(transcurrido, inicio)?;
        }
        let fase = inicio + (transcurrido - inicio).max(0.0).rem_euclid(duracion);
        agregar(fase, desde)?;
        agregar(inicio, fase)?;
        if offset < restante {
            programa.repetir = Some((offset, duracion));
        }
    } else {
        agregar(transcurrido, curva.fin)?;
    }
    Ok(programa)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn una_interrupcion_conserva_valor_y_velocidad_del_polinomio() {
        let tramo = Tramo {
            desde: 0.0,
            a: 3.0,
            b: 2.0,
            c: -4.0,
            d: 1.0,
        };
        let desplazado = desplazar(&tramo, 0.5).unwrap();
        for (a, b) in desplazado.into_iter().zip([3.125, -1.25, -2.5, 1.0]) {
            assert!((a - b).abs() < f32::EPSILON);
        }
        let t = 0.25;
        let valor = desplazado[0] + t * (desplazado[1] + t * (desplazado[2] + t * desplazado[3]));
        assert!((valor - desplazar(&tramo, 0.75).unwrap()[0]).abs() < f32::EPSILON);
    }

    #[test]
    fn captura_evalua_repeticion_y_final_en_el_reloj_absoluto() {
        let mut curva = Curva {
            inicio: Instante(100.0),
            tramos: vec![Tramo {
                desde: 0.0,
                a: 0.0,
                b: 1.0,
                c: 0.0,
                d: 0.0,
            }],
            fin: 10.0,
            final_: 9.0,
            repetir: Some((2.0, 2.0)),
        };
        assert!((evaluar(&curva, Instante(105.5)).unwrap() - 1.5).abs() < f32::EPSILON);
        curva.fin = 2.0;
        assert!((evaluar(&curva, Instante(105.5)).unwrap() - 9.0).abs() < f32::EPSILON);
    }

    fn evaluar_programa(programa: &Programa, curva: &Curva, instante: f64) -> f32 {
        if instante >= programa.fin {
            return curva.final_;
        }
        let instante = programa.repetir.map_or(instante, |(desde, duracion)| {
            if instante >= desde {
                desde - duracion + (instante - desde).rem_euclid(duracion)
            } else {
                instante
            }
        });
        let (desde, [constante, lineal, cuadratico, cubico]) = programa
            .cubicos
            .iter()
            .rev()
            .find(|(desde, _)| *desde <= instante)
            .unwrap();
        let local = std::time::Duration::from_secs_f64(instante - desde).as_secs_f32();
        constante + local * (lineal + local * (cuadratico + local * cubico))
    }
    #[test]
    fn el_programa_nativo_conserva_fase_y_tramos_de_una_curva_interrumpida() {
        let curva = Curva {
            inicio: Instante(100.0),
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
            fin: 10.0,
            final_: 1.0,
            repetir: Some((2.0, 2.0)),
        };
        for ahora in [99.5, 100.0, 100.25, 101.75, 104.25, 109.75] {
            let p = programar(&curva, Instante(ahora)).unwrap();
            for paso in 0..100 {
                let futuro = f64::from(paso) * 0.125;
                let original = evaluar(&curva, Instante(ahora + futuro)).unwrap();
                let nativo = evaluar_programa(&p, &curva, futuro);
                assert!(
                    (original - nativo).abs() < 0.00001,
                    "ahora={ahora}, futuro={futuro}: {original} frente a {nativo}"
                );
            }
        }
    }
    #[test]
    fn rechaza_curvas_no_finitas_y_repeticiones_sin_historia() {
        let mut curva = Curva {
            inicio: Instante(0.0),
            tramos: vec![Tramo {
                desde: 0.0,
                a: 1.0,
                b: 0.0,
                c: 0.0,
                d: 0.0,
            }],
            fin: 10.0,
            final_: 1.0,
            repetir: Some((1.0, 2.0)),
        };
        assert!(programar(&curva, Instante(0.5)).is_err());
        curva.repetir = None;
        curva.tramos[0].b = f32::NAN;
        assert!(programar(&curva, Instante(0.5)).is_err());
    }
}
