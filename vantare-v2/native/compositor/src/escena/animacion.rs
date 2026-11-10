//! Curvas cúbicas en segundos, independientes del reloj y de la plataforma.
use super::capas::{Curva, Instante, Tramo};
use crate::receta::Transicion;
pub const MAX_TRAMOS: usize = 1024;
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErrorAnimacion {
    Entrada,
    Precision,
    Coeficientes,
}
impl std::fmt::Display for ErrorAnimacion {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{self:?}: usa valores finitos, duraciones de al menos 1 ms y una curva representable en como máximo {MAX_TRAMOS} tramos"
        )
    }
}
impl std::error::Error for ErrorAnimacion {}
// Solo intervalos relativos ya comprobados: 0..10 s (muestra y bucle).
pub(crate) fn segundos(t: f64) -> f32 {
    std::time::Duration::from_secs_f64(t).as_secs_f32()
}
pub fn muestra(curva: &Curva, ahora: Instante) -> (f32, f32) {
    let mut t = (ahora.0 - curva.inicio.0).max(0.0);
    if let Some((desde, duracion)) = curva.repetir
        && duracion > 0.0
        && t >= desde
    {
        t = desde + (t - desde) % duracion;
    }
    if t >= curva.fin {
        return (curva.final_, 0.0);
    }
    let Some(tramo) = curva.tramos.iter().rev().find(|x| x.desde <= t) else {
        return (curva.tramos.first().map_or(curva.final_, |x| x.a), 0.0);
    };
    let s = segundos(t - tramo.desde);
    (
        tramo.a + s * (tramo.b + s * (tramo.c + s * tramo.d)),
        tramo.b + s * (2.0 * tramo.c + 3.0 * s * tramo.d),
    )
}
fn hermite(desde: f32, h: f32, a: (f32, f32), b: (f32, f32)) -> Tramo {
    let delta = b.0 - a.0;
    Tramo {
        desde: f64::from(desde),
        a: a.0,
        b: a.1,
        c: (3.0 * delta / h - 2.0 * a.1 - b.1) / h,
        d: (-2.0 * delta / h + a.1 + b.1) / (h * h),
    }
}
/// Valor y velocidad de una curva CSS resuelta por bisección de su coordenada X.
pub fn bezier(p: [f32; 4], t: f32) -> (f32, f32) {
    let cub = |a: f32, b: f32, u: f32| {
        3.0 * (1.0 - u) * (1.0 - u) * u * a + 3.0 * (1.0 - u) * u * u * b + u * u * u
    };
    let der = |a: f32, b: f32, u: f32| {
        3.0 * (1.0 - u) * (1.0 - u) * a + 6.0 * (1.0 - u) * u * (b - a) + 3.0 * u * u * (1.0 - b)
    };
    let (mut lo, mut hi) = (0.0, 1.0);
    for _ in 0..28 {
        let m = (lo + hi) * 0.5;
        if cub(p[0], p[2], m) < t {
            lo = m;
        } else {
            hi = m;
        }
    }
    let u = (lo + hi) * 0.5;
    let dx = der(p[0], p[2], u);
    let velocidad = if dx.abs() > 1.0e-6 {
        der(p[1], p[3], u) / dx
    } else if t < 0.5 {
        if p[0] > 0.0 {
            p[1] / p[0]
        } else if p[2] > 0.0 {
            p[3] / p[2]
        } else {
            1.0
        }
    } else if p[2] < 1.0 {
        (1.0 - p[3]) / (1.0 - p[2])
    } else if p[0] < 1.0 {
        (1.0 - p[1]) / (1.0 - p[0])
    } else {
        1.0
    };
    (
        if t <= 0.0 {
            0.0
        } else if t >= 1.0 {
            1.0
        } else {
            cub(p[1], p[3], u)
        },
        velocidad,
    )
}
/// Muelles de masa 1, solución analítica con posición y velocidad iniciales.
pub fn muelle(
    rigidez: f32,
    amortiguacion: f32,
    posicion: f32,
    velocidad: f32,
    tiempo: f32,
) -> (f32, f32) {
    let alpha = amortiguacion * 0.5;
    let discr = rigidez - alpha * alpha;
    if discr > 1.0e-5 {
        let frecuencia = discr.sqrt();
        let coef_seno = (velocidad + alpha * posicion) / frecuencia;
        let (seno, co) = (frecuencia * tiempo).sin_cos();
        let envolvente = (-alpha * tiempo).exp();
        let desplazamiento = posicion * co + coef_seno * seno;
        (
            envolvente * desplazamiento,
            envolvente
                * (-alpha * desplazamiento + frecuencia * (-posicion * seno + coef_seno * co)),
        )
    } else if discr < -1.0e-5 {
        let frecuencia = (-discr).sqrt();
        let r1 = -alpha + frecuencia;
        let r2 = -alpha - frecuencia;
        let coef_lento = (velocidad - r2 * posicion) / (r1 - r2);
        let coef_seno = posicion - coef_lento;
        (
            coef_lento * (r1 * tiempo).exp() + coef_seno * (r2 * tiempo).exp(),
            coef_lento * r1 * (r1 * tiempo).exp() + coef_seno * r2 * (r2 * tiempo).exp(),
        )
    } else {
        let coef_seno = velocidad + alpha * posicion;
        let desplazamiento = posicion + coef_seno * tiempo;
        let envolvente = (-alpha * tiempo).exp();
        (
            envolvente * desplazamiento,
            envolvente * (coef_seno - alpha * desplazamiento),
        )
    }
}

fn ulp(v: f32) -> f32 {
    let n = v.abs();
    (f32::from_bits(n.to_bits().saturating_add(1)) - n).max(f32::MIN_POSITIVE)
}
struct Intervalo {
    desde: f32,
    hasta: f32,
    tramo: Tramo,
    error: f32,
}
fn intervalo(
    f: &impl Fn(f32) -> (f32, f32),
    desde: f32,
    hasta: f32,
) -> Result<Intervalo, ErrorAnimacion> {
    let h = hasta - desde;
    if h <= 0.0 {
        return Err(ErrorAnimacion::Precision);
    }
    let tramo = hermite(desde, h, f(desde), f(hasta));
    if [tramo.a, tramo.b, tramo.c, tramo.d]
        .iter()
        .any(|v| !v.is_finite())
    {
        return Err(ErrorAnimacion::Coeficientes);
    }
    let error = [0.125, 0.25, 0.5, 0.75, 0.875]
        .iter()
        .map(|q| {
            let t = h * q;
            (tramo.a + t * (tramo.b + t * (tramo.c + t * tramo.d)) - f(desde + t).0).abs()
        })
        .fold(0.0_f32, f32::max);
    Ok(Intervalo {
        desde,
        hasta,
        tramo,
        error,
    })
}
fn adaptar(
    f: &impl Fn(f32) -> (f32, f32),
    fin: f32,
    tolerancia: f32,
    muelle: bool,
) -> Result<Vec<Tramo>, ErrorAnimacion> {
    let mut intervalos = Vec::new();
    let mut desde = 0.0;
    while desde < fin {
        let hasta = if muelle {
            (desde + 0.02_f32).min(fin)
        } else {
            fin
        };
        intervalos.push(intervalo(f, desde, hasta)?);
        desde = hasta;
    }
    while let Some(indice) = intervalos.iter().position(|v| v.error > tolerancia) {
        if intervalos.len() >= MAX_TRAMOS {
            return Err(ErrorAnimacion::Precision);
        }
        let anterior = &intervalos[indice];
        let mitad = (anterior.desde + anterior.hasta) * 0.5;
        let izq = intervalo(f, anterior.desde, mitad)?;
        let der = intervalo(f, mitad, anterior.hasta)?;
        intervalos.splice(indice..=indice, [izq, der]);
    }
    Ok(intervalos.into_iter().map(|v| v.tramo).collect())
}
/// Solo recibe configuración compilada y comprobada; jamás interpreta JSON.
pub fn transicion(
    config: &Transicion,
    inicio: Instante,
    desde: f32,
    hasta: f32,
    velocidad: Option<f32>,
) -> Result<Curva, ErrorAnimacion> {
    if !inicio.0.is_finite()
        || [desde, hasta]
            .iter()
            .any(|v| !v.is_finite() || v.abs() > 1_000_000.0)
        || velocidad.is_some_and(|v| !v.is_finite() || v.abs() > 1.0e12)
    {
        return Err(ErrorAnimacion::Entrada);
    }
    match *config {
        Transicion::Muelle {
            rigidez,
            amortiguacion,
        } => transicion_muelle(
            rigidez,
            amortiguacion,
            inicio,
            desde,
            hasta,
            velocidad.map_or(0.0, |v| v),
        ),
        Transicion::Bezier {
            duracion,
            retardo,
            puntos,
        } => transicion_bezier((duracion, retardo, puntos), inicio, desde, hasta, velocidad),
    }
}
pub(crate) fn constante(inicio: Instante, valor: f32, fin: f64) -> Curva {
    Curva {
        inicio,
        tramos: vec![Tramo {
            desde: 0.0,
            a: valor,
            b: 0.0,
            c: 0.0,
            d: 0.0,
        }],
        fin,
        final_: valor,
        repetir: None,
    }
}
fn transicion_bezier(
    config: (f32, f32, [f32; 4]),
    inicio: Instante,
    desde: f32,
    hasta: f32,
    velocidad: Option<f32>,
) -> Result<Curva, ErrorAnimacion> {
    let (dur, ret, p) = config;
    if !dur.is_finite()
        || !ret.is_finite()
        || dur < 0.0
        || (dur > 0.0 && dur < 0.001)
        || ret < 0.0
        || dur + ret > 10.001
        || p.iter().any(|v| !v.is_finite())
        || ![0, 2].iter().all(|i| (0.0..=1.0).contains(&p[*i]))
        || ![1, 3].iter().all(|i| (-10.0..=10.0).contains(&p[*i]))
    {
        return Err(ErrorAnimacion::Entrada);
    }
    let velocidad_inicial = velocidad.map_or(0.0, |v| v);
    let suelo = ulp(desde.abs().max(hasta.abs())) * 4.0;
    if (hasta - desde).abs() <= suelo && velocidad_inicial.abs() <= suelo {
        return Ok(constante(inicio, hasta, f64::from(dur) + f64::from(ret)));
    }
    if dur <= 0.0 {
        return Ok(Curva {
            inicio,
            tramos: vec![Tramo {
                desde: 0.0,
                a: desde,
                b: velocidad_inicial,
                c: 0.0,
                d: 0.0,
            }],
            fin: f64::from(ret),
            final_: hasta,
            repetir: None,
        });
    }
    let inicial = desde + velocidad_inicial * ret;
    let vbase = (hasta - inicial) * bezier(p, 0.0).1 / dur;
    let delta_v = velocidad.map_or(0.0, |v| v - vbase);
    let evaluar = |t: f32| {
        let u = (t / dur).clamp(0.0, 1.0);
        let (y, derivada) = bezier(p, u);
        (
            inicial + (hasta - inicial) * y + delta_v * t * (1.0 - u) * (1.0 - u),
            (hasta - inicial) * derivada / dur + delta_v * (1.0 - 4.0 * u + 3.0 * u * u),
        )
    };
    let tolerancia = ((hasta - inicial).abs() * 0.0005)
        .max(suelo)
        .max(ulp((velocidad_inicial * dur).abs()) * 4.0);
    let mut tramos = adaptar(&evaluar, dur, tolerancia, false)?;
    for t in &mut tramos {
        t.desde += f64::from(ret);
    }
    if ret > 0.0 {
        if tramos.len() >= MAX_TRAMOS {
            return Err(ErrorAnimacion::Precision);
        }
        tramos.insert(
            0,
            Tramo {
                desde: 0.0,
                a: desde,
                b: velocidad_inicial,
                c: 0.0,
                d: 0.0,
            },
        );
    }
    Ok(Curva {
        inicio,
        tramos,
        fin: f64::from(dur) + f64::from(ret),
        final_: hasta,
        repetir: None,
    })
}
fn transicion_muelle(
    rigidez: f32,
    amortiguacion: f32,
    inicio: Instante,
    desde: f32,
    hasta: f32,
    velocidad: f32,
) -> Result<Curva, ErrorAnimacion> {
    if !rigidez.is_finite()
        || !amortiguacion.is_finite()
        || rigidez <= 0.0
        || amortiguacion <= 0.0
        || rigidez > 10000.0
        || amortiguacion > 10000.0
    {
        return Err(ErrorAnimacion::Entrada);
    }
    let suelo = ulp(desde.abs().max(hasta.abs())) * 4.0;
    if (hasta - desde).abs() <= suelo && velocidad.abs() <= suelo {
        return Ok(constante(inicio, hasta, 0.0));
    }
    let amplitud = (hasta - desde).abs().max(velocidad.abs() / rigidez.sqrt());
    let umbral = ((hasta - desde).abs() * 0.001).max(suelo);
    let evaluar = |t| {
        let (x, v) = muelle(rigidez, amortiguacion, desde - hasta, velocidad, t);
        (hasta + x, v)
    };
    let mut fin = 0.02_f32;
    while fin < 10.0 {
        let (x, v) = evaluar(fin);
        if (x - hasta).abs() <= umbral && v.abs() <= umbral {
            break;
        }
        fin = (fin + 0.02).min(10.0);
    }
    let (posicion_final, velocidad_final) = evaluar(fin);
    if (posicion_final - hasta).abs() > umbral || velocidad_final.abs() > umbral {
        return Err(ErrorAnimacion::Precision);
    }
    let tramos = adaptar(&evaluar, fin, (amplitud * 0.0002).max(suelo), true)?;
    Ok(Curva {
        inicio,
        tramos,
        fin: f64::from(fin),
        final_: hasta,
        repetir: None,
    })
}
pub fn bucle(valores: &[f32], duracion: f64, inicio: Instante) -> Result<Curva, ErrorAnimacion> {
    if !inicio.0.is_finite()
        || !duracion.is_finite()
        || !(0.001..=10.0).contains(&duracion)
        || !(2..=64).contains(&valores.len())
        || valores
            .iter()
            .any(|v| !v.is_finite() || v.abs() > 1_000_000.0)
    {
        return Err(ErrorAnimacion::Entrada);
    }
    let cerrar = valores.first() != valores.last();
    let pasos = u16::try_from(valores.len() - 1 + usize::from(cerrar))
        .map_err(|_| ErrorAnimacion::Entrada)?;
    let h = segundos(duracion) / f32::from(pasos);
    let mut tramos = Vec::new();
    for (i, par) in valores.windows(2).enumerate() {
        let i = u16::try_from(i).map_err(|_| ErrorAnimacion::Entrada)?;
        tramos.push(hermite(f32::from(i) * h, h, (par[0], 0.0), (par[1], 0.0)));
    }
    if cerrar {
        tramos.push(hermite(
            f32::from(pasos - 1) * h,
            h,
            (valores[valores.len() - 1], 0.0),
            (valores[0], 0.0),
        ));
    }
    Ok(Curva {
        inicio,
        tramos,
        fin: duracion,
        final_: valores[0],
        repetir: Some((0.0, duracion)),
    })
}
pub fn bucle_desde(
    valores: &[f32],
    duracion: f64,
    inicio: Instante,
    desde: f32,
    velocidad: f32,
) -> Result<Curva, ErrorAnimacion> {
    let ciclo = bucle(valores, duracion, inicio)?;
    let mut curva = transicion(
        &Transicion::Bezier {
            duracion: 0.18,
            retardo: 0.0,
            puntos: [0.42, 0.0, 0.58, 1.0],
        },
        inicio,
        desde,
        valores[0],
        Some(velocidad),
    )?;
    let intro = curva.fin;
    curva.tramos.extend(ciclo.tramos.into_iter().map(|mut t| {
        t.desde += intro;
        t
    }));
    curva.fin = intro + duracion;
    curva.final_ = valores[0];
    curva.repetir = Some((intro, duracion));
    Ok(curva)
}
