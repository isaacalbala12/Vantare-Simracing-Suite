//! Curvas cúbicas en segundos, independientes del reloj y de la plataforma.
use super::capas::{Curva, Instante, Tramo};
use serde_json::Value;
pub(crate) fn segundos(t: f64) -> f32 {
    if t.is_finite() {
        std::time::Duration::from_secs_f64(t.clamp(0.0, 1.0e9)).as_secs_f32()
    } else {
        0.0
    }
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
fn adaptar(
    f: &impl Fn(f32) -> (f32, f32),
    a: f32,
    b: f32,
    tolerancia: f32,
    nivel: u32,
    salida: &mut Vec<Tramo>,
) {
    let tramo = hermite(a, b - a, f(a), f(b));
    let error = [0.125, 0.25, 0.5, 0.75, 0.875]
        .iter()
        .map(|q| {
            let t = (b - a) * q;
            (tramo.a + t * (tramo.b + t * (tramo.c + t * tramo.d)) - f(a + t).0).abs()
        })
        .fold(0.0_f32, f32::max);
    if error > tolerancia && nivel < 14 {
        let m = (a + b) * 0.5;
        adaptar(f, a, m, tolerancia, nivel + 1, salida);
        adaptar(f, m, b, tolerancia, nivel + 1, salida);
    } else {
        salida.push(tramo);
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
fn puntos(v: &Value) -> [f32; 4] {
    match v.as_str() {
        Some("entrada") => [0.42, 0.0, 1.0, 1.0],
        Some("salida") => [0.0, 0.0, 0.58, 1.0],
        Some("entrada-salida") => [0.42, 0.0, 0.58, 1.0],
        _ => serde_json::from_value(v.clone()).unwrap_or([0.0, 0.0, 1.0, 1.0]),
    }
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
/// Construye una transición; `velocidad` conserva C1 al sustituir otra curva.
pub fn transicion(
    config: &Value,
    inicio: Instante,
    desde: f32,
    hasta: f32,
    velocidad: Option<f32>,
) -> Curva {
    if let Some(m) = config.get("muelle") {
        let rigidez = numero(&m["rigidez"], 170.0);
        let amortiguacion = numero(&m["amortiguacion"], 26.0);
        let evaluar = |t| {
            let (posicion, velocidad_actual) = muelle(
                rigidez,
                amortiguacion,
                desde - hasta,
                velocidad.unwrap_or(0.0),
                t,
            );
            (hasta + posicion, velocidad_actual)
        };
        let umbral = (hasta - desde).abs().max(1.0) * 0.001;
        let mut fin = 0.02_f32;
        while fin < 10.0 {
            let (posicion, velocidad_actual) = evaluar(fin);
            if (posicion - hasta).abs() < umbral && velocidad_actual.abs() < umbral {
                break;
            }
            fin += 0.02;
        }
        let mut tramos = Vec::new();
        let mut desde_tramo = 0.0;
        while desde_tramo < fin {
            let hasta_tramo = (desde_tramo + 0.02_f32).min(fin);
            adaptar(
                &evaluar,
                desde_tramo,
                hasta_tramo,
                umbral * 0.2,
                0,
                &mut tramos,
            );
            desde_tramo = hasta_tramo;
        }
        return Curva {
            inicio,
            tramos,
            fin: f64::from(fin),
            final_: hasta,
            repetir: None,
        };
    }
    let dur = numero(&config["duracion"], 180.0) / 1000.0;
    let ret = numero(&config["retardo"], 0.0) / 1000.0;
    if dur <= 0.0 {
        return Curva {
            inicio,
            tramos: Vec::new(),
            fin: 0.0,
            final_: hasta,
            repetir: None,
        };
    }
    let p = puntos(&config["curva"]);
    // La corrección cúbica vale 0 y tiene derivada 0 en el destino.
    let vbase = (hasta - desde) * bezier(p, 0.0).1 / dur;
    let delta_v = velocidad.map_or(0.0, |v| v - vbase);
    let f = |t: f32| {
        let u = (t / dur).clamp(0.0, 1.0);
        let (y, dy) = bezier(p, u);
        (
            desde + (hasta - desde) * y + delta_v * t * (1.0 - u) * (1.0 - u),
            (hasta - desde) * dy / dur + delta_v * (1.0 - 4.0 * u + 3.0 * u * u),
        )
    };
    let mut tramos = Vec::new();
    // En una interrupción el retardo no puede congelar la velocidad: se integra en la duración.
    adaptar(
        &f,
        0.0,
        dur,
        (hasta - desde).abs().max(1.0) * 0.0005,
        0,
        &mut tramos,
    );
    let ret = if velocidad.is_none() { ret } else { 0.0 };
    for tramo in &mut tramos {
        tramo.desde += f64::from(ret);
    }
    if ret > 0.0 {
        tramos.insert(
            0,
            Tramo {
                desde: 0.0,
                a: desde,
                b: 0.0,
                c: 0.0,
                d: 0.0,
            },
        );
    }
    Curva {
        inicio,
        tramos,
        fin: f64::from(dur + ret),
        final_: hasta,
        repetir: None,
    }
}
pub(crate) fn numero(v: &Value, defecto: f32) -> f32 {
    serde_json::from_value(v.clone()).unwrap_or(defecto)
}
pub fn bucle(valores: &[f32], duracion: f64, inicio: Instante) -> Curva {
    let mut tramos = Vec::new();
    let cerrar = valores.first() != valores.last();
    let pasos =
        u16::try_from(valores.len().saturating_sub(1) + usize::from(cerrar)).unwrap_or(u16::MAX);
    let h = segundos(duracion) / f32::from(pasos.max(1));
    for (i, par) in valores.windows(2).enumerate() {
        let t = f32::from(u16::try_from(i).unwrap_or(u16::MAX)) * h;
        tramos.push(hermite(t, h, (par[0], 0.0), (par[1], 0.0)));
    }
    if cerrar && let (Some(a), Some(b)) = (valores.last(), valores.first()) {
        tramos.push(hermite(
            f32::from(pasos.saturating_sub(1)) * h,
            h,
            (*a, 0.0),
            (*b, 0.0),
        ));
    }
    Curva {
        inicio,
        tramos,
        fin: duracion,
        final_: valores.first().copied().unwrap_or(0.0),
        repetir: Some((0.0, duracion)),
    }
}
/// Introducción C1 al bucle; la repetición empieza después de alcanzar el primer valor.
pub fn bucle_desde(
    valores: &[f32],
    duracion: f64,
    inicio: Instante,
    desde: f32,
    velocidad: f32,
) -> Curva {
    let primero = valores.first().copied().unwrap_or(desde);
    let mut curva = transicion(
        &serde_json::json!({"duracion":180,"curva":"entrada-salida"}),
        inicio,
        desde,
        primero,
        Some(velocidad),
    );
    let intro = curva.fin;
    let ciclo = bucle(valores, duracion, inicio);
    curva.tramos.extend(ciclo.tramos.into_iter().map(|mut t| {
        t.desde += intro;
        t
    }));
    curva.fin = intro + duracion;
    curva.final_ = primero;
    curva.repetir = Some((intro, duracion));
    curva
}
