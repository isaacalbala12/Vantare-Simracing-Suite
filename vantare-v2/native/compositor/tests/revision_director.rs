//! Regresiones de los ataques Sonnet y de la revisión del director (#2022).
use serde_json::{Value, json};
use vantare_compositor::{
    escena::{
        Escena, Medidor, animacion,
        capas::{CapaId, Dibujo, Fuente, Instante, Operacion, Propiedad},
    },
    receta::{Carga, cargar},
};
struct Fijo;
impl Medidor for Fijo {
    fn medir(&self, texto: &str, _: &Fuente) -> (f32, f32) {
        (
            f32::from(u16::try_from(texto.chars().count()).expect("texto acotado")) * 7.0,
            18.0,
        )
    }
}
fn fixture(nombre: &str) -> Value {
    let fuente = match nombre {
        "sistema" => include_str!("fixtures/sistema.json"),
        "modelo" => include_str!("fixtures/modelo.json"),
        "receta" => include_str!("fixtures/receta.json"),
        "datos" => include_str!("fixtures/datos.json"),
        _ => panic!("fixture inexistente"),
    };
    serde_json::from_str(fuente).expect("fixture valido")
}
fn cargar_prueba(
    r: &Value,
    s: &Value,
) -> Result<Carga, Vec<vantare_compositor::receta::Diagnostico>> {
    cargar(
        ("r.json", &r.to_string()),
        ("s.json", &s.to_string()),
        ("m.json", &fixture("modelo").to_string()),
    )
}
fn escena(r: &Value, s: &Value) -> Escena {
    let c = cargar_prueba(r, s).expect("receta valida");
    Escena::nueva(c.receta)
}
fn lista() -> Value {
    let mut r = fixture("receta");
    r["raiz"]["estilo"]["alinear"] = json!("inicio");
    r["raiz"]["hijos"] = json!([{"tipo":"lista","de":"filas","como":"fila","clave":"id","movimiento":"$mov.suave","entrada":{"desde":{"opacidad":0},"transicion":"$mov.suave"},"salida":{"hacia":{"opacidad":0},"transicion":"$mov.suave"},"plantilla":{"tipo":"texto","texto":"{fila.texto}","estilo":{"alto":"$medida.h","tipo":"$tipo.fila","color":"$color.clase.{fila.clase}"}}}]);
    r
}

#[test]
fn ataque_medida_infinita_se_rechaza_al_cargar() {
    let mut s = fixture("sistema");
    s["medida"]["w"] = json!(1e39);
    assert!(cargar_prueba(&fixture("receta"), &s).is_err());
}
#[test]
fn ataque_numero_del_modelo_no_emite_inf() {
    let mut r = fixture("receta");
    r["raiz"]["estilo"]["x"] = json!("{alpha}");
    let mut e = escena(&r, &fixture("sistema"));
    let mut m = fixture("datos");
    m["alpha"] = json!(1e39);
    let error = e
        .actualizar(&m, Instante(0.0), &Fijo)
        .expect_err("numero fuera de cota");
    assert!(!error.puntero.is_empty());
}
#[test]
fn ataque_capas_visibles_se_cuentan_al_cargar() {
    let mut r = fixture("receta");
    r["raiz"]["hijos"] = Value::Array(
        (0..300)
            .map(|_| json!({"tipo":"caja","visible":"visible"}))
            .collect(),
    );
    assert!(cargar_prueba(&r, &fixture("sistema")).is_err());
}
#[test]
fn ataque_salida_y_restaura_reposo_sin_entrada_y() {
    let mut r = fixture("receta");
    r["visible"] = json!("visible");
    r["entrada"] = json!({"desde":{"opacidad":0},"transicion":"$mov.suave"});
    r["salida"] = json!({"hacia":{"opacidad":0,"y":-8},"transicion":"$mov.suave"});
    let mut e = escena(&r, &fixture("sistema"));
    let mut m = fixture("datos");
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    m["visible"] = json!(false);
    e.actualizar(&m, Instante(1.0), &Fijo).unwrap();
    m["visible"] = json!(true);
    e.actualizar(&m, Instante(2.0), &Fijo).unwrap();
    assert!(
        e.valor(CapaId(1), Propiedad::Y, Instante(5.0))
            .unwrap()
            .abs()
            < 1e-5
    );
}
#[test]
fn ataque_pintada_descendiente_llega_a_su_capa() {
    let mut r = fixture("receta");
    r["raiz"]["hijos"][0]["estados"] = json!([{"cuando":"activo","estilo":{"color":"$color.a"}}]);
    r["raiz"]["hijos"][0]["transiciones"] = json!({"color":"$mov.suave"});
    let mut e = escena(&r, &fixture("sistema"));
    let mut m = fixture("datos");
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    m["activo"] = json!(true);
    e.actualizar(&m, Instante(1.0), &Fijo).unwrap();
    assert_eq!(e.proximo_fotograma(), Some(Instante(1.0)));
    assert!(
        e.avanzar(Instante(1.1))
            .unwrap()
            .operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Pintar { .. }))
    );
}
#[test]
fn ataque_fantasmas_expirados_no_cuentan() {
    let mut r = lista();
    let mut segunda = r["raiz"]["hijos"][0].clone();
    r["raiz"]["hijos"][0]["id"] = json!("a");
    segunda["id"] = json!("b");
    r["raiz"]["hijos"].as_array_mut().unwrap().push(segunda);
    let mut e = escena(&r, &fixture("sistema"));
    let mut m = fixture("datos");
    for paso in 0..5 {
        m["filas"] = Value::Array(
            (0..60)
                .map(|i| json!({"id":format!("{paso}-{i}"),"texto":"x","clase":"a"}))
                .collect(),
        );
        assert!(
            e.actualizar(&m, Instante(f64::from(paso) * 100.0), &Fijo)
                .is_ok()
        );
    }
}
#[test]
fn ataque_auto_no_es_cero() {
    let mut r = fixture("receta");
    r["raiz"]["hijos"] = json!([{"tipo":"texto","texto":"Hola","estilo":{"posicion":"absoluta","izquierda":0,"derecha":"auto","tipo":"$tipo.fila","color":"$color.b"}}]);
    let mut e = escena(&r, &fixture("sistema"));
    let l = e
        .actualizar(&fixture("datos"), Instante(0.0), &Fijo)
        .unwrap();
    let ancho = l
        .operaciones
        .iter()
        .filter_map(|o| match o {
            Operacion::Pintar { dibujos, .. } => Some(dibujos),
            _ => None,
        })
        .flatten()
        .find_map(|d| match d {
            Dibujo::Texto { caja, .. } => Some(caja.ancho),
            _ => None,
        })
        .unwrap();
    assert!((ancho - 28.0).abs() < 1e-5);
}
#[test]
fn ataque_efecto_y_parada_anidada_rechazados() {
    let mut s = fixture("sistema");
    s["efecto"] = json!({"panel":{"sombra":{"color":"zzz","desenfoque":1e9}}});
    let mut r = fixture("receta");
    r["raiz"]["estilo"]["sombra"] = json!("$efecto.panel");
    assert!(cargar_prueba(&r, &s).is_err());
    r["raiz"]["estilo"]
        .as_object_mut()
        .unwrap()
        .remove("sombra");
    r["raiz"]["estilo"]["fondo"] = json!({"lineal":{"angulo":90,"paradas":[[{"lineal":{"angulo":0,"paradas":[["$color.a",0],["$color.b",1]]}},0],["$color.b",1]]}});
    assert!(cargar_prueba(&r, &fixture("sistema")).is_err());
}
#[test]
fn ataque_error_serde_con_puntero() {
    let mut r = fixture("receta");
    r["raiz"]["estilo"]["crecer"] = json!("mucho");
    let errores = cargar_prueba(&r, &fixture("sistema")).unwrap_err();
    assert!(errores.iter().any(|e| e.puntero == "/raiz/estilo/crecer"));
}
#[test]
fn ataque_bezier_enorme_y_duracion_minuscula() {
    let mut r = fixture("receta");
    r["raiz"]["transiciones"] = json!({"opacidad":{"duracion":200,"curva":[0.5,1e38,0.5,-1e38]}});
    assert!(cargar_prueba(&r, &fixture("sistema")).is_err());
    r["raiz"]["transiciones"] = json!({"opacidad":{"duracion":1e-9,"curva":"lineal"}});
    assert!(cargar_prueba(&r, &fixture("sistema")).is_err());
}
#[test]
fn ataque_cambiar_antes_del_primer_modelo() {
    let mut e = escena(&fixture("receta"), &fixture("sistema"));
    let c = cargar_prueba(&fixture("receta"), &fixture("sistema")).unwrap();
    assert!(
        e.cambiar_sistema(c.sistema, Instante(0.0), &Fijo)
            .unwrap()
            .operaciones
            .is_empty()
    );
    assert!(
        e.cambiar_receta(c.receta, Instante(0.1), &Fijo)
            .unwrap()
            .operaciones
            .is_empty()
    );
}
#[test]
fn ataque_no_fijar_valores_por_defecto() {
    let mut e = escena(&fixture("receta"), &fixture("sistema"));
    let l = e
        .actualizar(&fixture("datos"), Instante(0.0), &Fijo)
        .unwrap();
    assert!(
        !l.operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Fijar { .. }))
    );
}
#[test]
fn ataque_curvas_acotadas() {
    for cfg in [
        json!({"duracion":200,"curva":"salida"}),
        json!({"muelle":{"rigidez":170,"amortiguacion":26}}),
    ] {
        for (desde, hasta, v) in [
            (1000.0, 1000.1, None),
            (300.0, 300.0, Some(50.0)),
            (300.0, 300.0, Some(0.0)),
        ] {
            let curva = animacion::transicion(
                &vantare_compositor::receta::leer_transicion(&cfg)
                    .expect("transicion de prueba valida"),
                Instante(0.0),
                desde,
                hasta,
                v,
            )
            .unwrap();
            assert!(curva.tramos.len() <= 1024, "{} tramos", curva.tramos.len());
            assert!(
                curva.tramos.iter().all(|t| t.a.is_finite()
                    && t.b.is_finite()
                    && t.c.is_finite()
                    && t.d.is_finite())
            );
        }
    }
}

#[test]
fn coste_actualizar_relativo_7_filas_1000_fotos() {
    let mut e = escena(&lista(), &fixture("sistema"));
    let mut m = fixture("datos");
    m["filas"] = Value::Array(
        (0..7)
            .map(|i| json!({"id":format!("coche{i}"),"texto":"+0.000","clase":"a"}))
            .collect(),
    );
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    let inicio = std::time::Instant::now();
    let mut operaciones = 0;
    for i in 0..1000 {
        m["filas"][3]["texto"] = json!(format!("+{}.000", i + 1));
        operaciones += e
            .actualizar(&m, Instante(f64::from(i + 1) * 0.02), &Fijo)
            .unwrap()
            .operaciones
            .len();
    }
    println!(
        "COSTE_ACTUALIZAR_7_FILAS iteraciones=1000 total_us={} media_us={} operaciones={operaciones}",
        inicio.elapsed().as_micros(),
        inicio.elapsed().as_secs_f64() * 1000.0
    );
}

#[derive(Default)]
struct Arbol {
    padres: std::collections::BTreeMap<CapaId, Option<CapaId>>,
    orden: std::collections::BTreeMap<Option<CapaId>, Vec<CapaId>>,
}
impl Arbol {
    fn aplicar(&mut self, lote: &vantare_compositor::escena::capas::Lote) {
        use std::collections::BTreeSet;
        for operacion in &lote.operaciones {
            match operacion {
                Operacion::Crear { id, padre, orden } => {
                    assert!(!self.padres.contains_key(id));
                    assert!(padre.is_none_or(|p| self.padres.contains_key(&p)));
                    let hijos = self.orden.entry(*padre).or_default();
                    let posicion = usize::try_from(*orden).expect("orden acotado");
                    assert!(
                        posicion <= hijos.len(),
                        "Crear debe contar también los fantasmas"
                    );
                    hijos.insert(posicion, *id);
                    self.padres.insert(*id, *padre);
                }
                Operacion::Quitar { id } => {
                    assert!(
                        self.padres.contains_key(id),
                        "Quitar una capa ya destruida: {id:?}"
                    );
                    let mut quitar = BTreeSet::from([*id]);
                    loop {
                        let antes = quitar.len();
                        for (hijo, padre) in &self.padres {
                            if padre.is_some_and(|p| quitar.contains(&p)) {
                                quitar.insert(*hijo);
                            }
                        }
                        if antes == quitar.len() {
                            break;
                        }
                    }
                    self.padres.retain(|id, _| !quitar.contains(id));
                    self.orden.retain(|p, h| {
                        h.retain(|id| !quitar.contains(id));
                        p.is_none_or(|id| !quitar.contains(&id))
                    });
                }
                Operacion::Ordenar { padre, hijos } => {
                    let esperadas = self
                        .padres
                        .iter()
                        .filter(|(_, p)| *p == padre)
                        .map(|(id, _)| *id)
                        .collect::<BTreeSet<_>>();
                    assert_eq!(hijos.iter().copied().collect::<BTreeSet<_>>(), esperadas);
                    assert_eq!(hijos.len(), esperadas.len());
                    self.orden.insert(*padre, hijos.clone());
                }
                Operacion::Colocar { id, rect } => {
                    assert!(self.padres.contains_key(id));
                    assert!(
                        [rect.x, rect.y, rect.ancho, rect.alto]
                            .iter()
                            .all(|v| v.is_finite())
                    );
                }
                Operacion::Animar { id, curva, .. } => {
                    assert!(self.padres.contains_key(id));
                    invariantes_curva(curva);
                }
                Operacion::Fijar { id, valor, .. } => {
                    assert!(self.padres.contains_key(id));
                    assert!(valor.is_finite());
                }
                Operacion::Pintar { id, .. } => assert!(self.padres.contains_key(id)),
            }
        }
    }
}
#[test]
fn ataque_no_quitar_hija_despues_de_su_raiz() {
    let mut sistema = fixture("sistema");
    sistema["mov"]["cambio_sistema"]["duracion"] = json!(100);
    let mut escena = escena(&lista(), &sistema);
    let mut modelo = fixture("datos");
    let mut arbol = Arbol::default();
    arbol.aplicar(&escena.actualizar(&modelo, Instante(0.0), &Fijo).unwrap());
    modelo["filas"].as_array_mut().unwrap().pop();
    arbol.aplicar(&escena.actualizar(&modelo, Instante(0.0), &Fijo).unwrap());
    arbol.aplicar(
        &escena
            .cambiar_sistema(
                cargar_prueba(&lista(), &sistema).unwrap().sistema,
                Instante(0.1),
                &Fijo,
            )
            .unwrap(),
    );
    for t in [0.25, 0.6] {
        arbol.aplicar(&escena.avanzar(Instante(t)).unwrap());
    }
    assert_eq!(arbol.padres.len(), 2);
}
#[test]
fn ataque_orden_con_fantasmas_y_reordenacion_minima() {
    let mut escena = escena(&lista(), &fixture("sistema"));
    let mut modelo = fixture("datos");
    let mut arbol = Arbol::default();
    arbol.aplicar(&escena.actualizar(&modelo, Instante(0.0), &Fijo).unwrap());
    modelo["filas"].as_array_mut().unwrap().remove(0);
    arbol.aplicar(&escena.actualizar(&modelo, Instante(0.1), &Fijo).unwrap());
    modelo["filas"]
        .as_array_mut()
        .unwrap()
        .push(json!({"id":"nueva","texto":"N","clase":"a"}));
    let alta = escena.actualizar(&modelo, Instante(0.2), &Fijo).unwrap();
    arbol.aplicar(&alta);
    assert!(
        alta.operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Crear { orden: 2, .. }))
    );
    modelo["filas"].as_array_mut().unwrap().reverse();
    let cambio = escena.actualizar(&modelo, Instante(0.3), &Fijo).unwrap();
    arbol.aplicar(&cambio);
    assert!(cambio.operaciones.iter().any(|o| matches!(o,
        Operacion::Ordenar { padre:Some(CapaId(1)), hijos }
            if hijos == &[CapaId(2),CapaId(4),CapaId(3)])));

    assert_eq!(
        cambio
            .operaciones
            .iter()
            .filter(|o| matches!(o, Operacion::Ordenar { .. }))
            .count(),
        1
    );
    assert!(
        !cambio
            .operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Crear { .. } | Operacion::Pintar { .. }))
    );
    assert!(
        escena
            .actualizar(&modelo, Instante(0.4), &Fijo)
            .unwrap()
            .operaciones
            .is_empty()
    );
}
#[test]
fn ataque_cambiar_ancho_no_anima_y() {
    let mut escena = escena(&lista(), &fixture("sistema"));
    let mut modelo = fixture("datos");
    escena.actualizar(&modelo, Instante(0.0), &Fijo).unwrap();
    modelo["filas"][0]["texto"] = json!("Uno largo");
    let lote = escena.actualizar(&modelo, Instante(1.0), &Fijo).unwrap();
    assert!(!lote.operaciones.iter().any(|o| matches!(
        o,
        Operacion::Animar {
            propiedad: Propiedad::Y,
            ..
        }
    )));
}
#[test]
fn ataque_todas_las_entradas_rechazan_instantes_no_finitos() {
    let mut escena = escena(&fixture("receta"), &fixture("sistema"));
    let carga = cargar_prueba(&fixture("receta"), &fixture("sistema")).unwrap();
    for t in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        assert!(
            escena
                .actualizar(&fixture("datos"), Instante(t), &Fijo)
                .is_err()
        );
        assert!(escena.avanzar(Instante(t)).is_err());
        assert!(escena.valor(CapaId(1), Propiedad::Y, Instante(t)).is_err());
        assert!(
            escena
                .cambiar_sistema(carga.sistema.clone(), Instante(t), &Fijo)
                .is_err()
        );
        assert!(
            escena
                .cambiar_receta(carga.receta.clone(), Instante(t), &Fijo)
                .is_err()
        );
    }
}
#[test]
fn ataque_tokens_bomba_se_rechazan_al_cargar() {
    let mut sistema = fixture("sistema");
    let mut efectos = serde_json::Map::new();
    for i in 0..20 {
        efectos.insert(
            format!("n{i}"),
            json!({"sombra":[format!("$efecto.n{}",i+1),format!("$efecto.n{}",i+1)]}),
        );
    }
    efectos.insert(
        "n20".into(),
        json!({"sombra":{"color":"$color.a","desenfoque":10}}),
    );
    sistema["efecto"] = Value::Object(efectos);
    let mut receta = fixture("receta");
    receta["raiz"]["estilo"]["sombra"] = json!("$efecto.n0");
    assert!(cargar_prueba(&receta, &sistema).is_err());
}
#[test]
fn actualizar_sin_cambios_vacio_y_un_texto_un_pintar() {
    struct Contador(std::cell::Cell<usize>);
    impl Medidor for Contador {
        fn medir(&self, t: &str, f: &Fuente) -> (f32, f32) {
            self.0.set(self.0.get() + 1);
            Fijo.medir(t, f)
        }
    }
    let medidor = Contador(std::cell::Cell::new(0));
    let mut escena = escena(&lista(), &fixture("sistema"));
    let mut modelo = fixture("datos");
    escena.actualizar(&modelo, Instante(0.0), &medidor).unwrap();
    let medidas = medidor.0.get();
    assert!(
        escena
            .actualizar(&modelo, Instante(2.0), &medidor)
            .unwrap()
            .operaciones
            .is_empty()
    );
    assert_eq!(medidas, medidor.0.get());
    modelo["filas"][0]["texto"] = json!("Otr");
    let lote = escena.actualizar(&modelo, Instante(2.1), &medidor).unwrap();
    assert!(matches!(
        lote.operaciones.as_slice(),
        [Operacion::Pintar { .. }]
    ));
}
#[test]
fn ataque_pintada_no_se_cancela_ni_prolonga_por_texto() {
    let mut receta = fixture("receta");
    receta["raiz"]["estados"] = json!([{"cuando":"activo","estilo":{"fondo":"$color.b"}}]);
    receta["raiz"]["transiciones"] = json!({"fondo":"$mov.suave"});
    let mut escena = escena(&receta, &fixture("sistema"));
    let mut modelo = fixture("datos");
    escena.actualizar(&modelo, Instante(0.0), &Fijo).unwrap();
    modelo["activo"] = json!(true);
    escena.actualizar(&modelo, Instante(1.0), &Fijo).unwrap();
    escena.avanzar(Instante(1.25)).unwrap();
    modelo["titulo"] = json!("Otro");
    let lote = escena.actualizar(&modelo, Instante(1.3), &Fijo).unwrap();
    assert_eq!(
        lote.operaciones
            .iter()
            .filter(|o| matches!(o, Operacion::Pintar { .. }))
            .count(),
        1
    );
    let color = lote
        .operaciones
        .iter()
        .find_map(|o| match o {
            Operacion::Pintar { dibujos, .. } => dibujos.iter().find_map(|d| match d {
                Dibujo::Rect {
                    relleno: Some(vantare_compositor::escena::capas::Pintura::Solido(c)),
                    ..
                } => Some(c),
                _ => None,
            }),
            _ => None,
        })
        .unwrap();
    assert!(color.r > 0.1 && color.b > 0.1);
    escena.avanzar(Instante(1.6)).unwrap();
    assert!(escena.proximo_fotograma().is_none());
}
#[test]
fn ataque_claves_largas_y_listas_anidadas() {
    let mut escena = escena(&lista(), &fixture("sistema"));
    let mut modelo = fixture("datos");
    modelo["filas"] = Value::Array(
        (0..64)
            .map(|i| json!({"id":format!("{i}{}","k".repeat(15000)),"texto":"x","clase":"a"}))
            .collect(),
    );
    let inicio = std::time::Instant::now();
    escena.actualizar(&modelo, Instante(0.0), &Fijo).unwrap();
    modelo["filas"] = json!([]);
    escena.actualizar(&modelo, Instante(0.1), &Fijo).unwrap();
    println!(
        "CLAVES_64x15KB alta_y_salida_us={}",
        inicio.elapsed().as_micros()
    );
    let mut receta = lista();
    receta["raiz"]["hijos"][0]["plantilla"] = json!({"tipo":"lista","de":"filas","como":"segunda","clave":"id","plantilla":{"tipo":"caja"}});
    assert!(
        cargar_prueba(&receta, &fixture("sistema")).is_err(),
        "64x64 capas deben rechazarse antes de ejecutar"
    );
}

fn invariantes_curva(c: &vantare_compositor::escena::capas::Curva) {
    assert!(c.inicio.0.is_finite() && c.fin.is_finite());
    assert!(c.final_.is_finite());
    assert!(c.tramos.len() <= animacion::MAX_TRAMOS);
    assert_eq!(c.tramos.first().map(|t| t.desde), Some(0.0));
    assert!(c.tramos.windows(2).all(|w| w[0].desde < w[1].desde));
    assert!(
        c.tramos
            .iter()
            .all(|t| t.desde.is_finite() && [t.a, t.b, t.c, t.d].iter().all(|v| v.is_finite()))
    );
    if let Some((desde, duracion)) = c.repetir {
        assert!(desde >= 0.0 && duracion > 0.0);
        assert!(c.fin >= desde + duracion);
    }
}
fn evaluar_tramo(tramo: &vantare_compositor::escena::capas::Tramo, segundos: f64) -> (f64, f64) {
    let (a, b, c, d) = (
        f64::from(tramo.a),
        f64::from(tramo.b),
        f64::from(tramo.c),
        f64::from(tramo.d),
    );
    (
        a + segundos * (b + segundos * (c + segundos * d)),
        b + segundos * (2.0 * c + 3.0 * segundos * d),
    )
}
fn costuras(c: &vantare_compositor::escena::capas::Curva, desde: f32, v: Option<f32>, escala: f64) {
    invariantes_curva(c);
    for w in c.tramos.windows(2) {
        let (valor, velocidad) = evaluar_tramo(&w[0], w[1].desde - w[0].desde);
        assert!(
            (valor - f64::from(w[1].a)).abs() <= 0.002 * escala,
            "costura valor actual={valor} destino={}",
            w[1].a
        );
        // Sin velocidad solicitada, CSS conserva su tangente natural al acabar
        // un retardo inmóvil. Una interrupción (Some) sí exige C1 también allí.
        let arranque_css =
            v.is_none() && w[0].desde == 0.0 && w[0].b == 0.0 && w[0].c == 0.0 && w[0].d == 0.0;
        if !arranque_css {
            let h = w[1].desde - w[0].desde;
            // Error de redondear a f32 los coeficientes exigidos por DirectComposition.
            let redondeo = 8.0
                * f64::from(f32::EPSILON)
                * (f64::from(w[0].b).abs()
                    + 2.0 * h * f64::from(w[0].c).abs()
                    + 3.0 * h * h * f64::from(w[0].d).abs()
                    + f64::from(w[1].b).abs());
            assert!(
                (velocidad - f64::from(w[1].b)).abs()
                    <= 0.05 * escala + 0.005 * f64::from(v.map_or(0.0, f32::abs)) + redondeo,
                "costura velocidad t={} actual={velocidad} destino={} redondeo={redondeo}",
                w[1].desde,
                w[1].b
            );
        }
    }
    let (valor, velocidad) = animacion::muestra(c, c.inicio);
    assert!(f64::from((valor - desde).abs()) <= 0.001 * escala);
    if let Some(v) = v {
        assert!((velocidad - v).abs() <= 0.01 * (1.0 + v.abs()));
    }
    let ultimo = c.tramos.last().expect("curva no vacía");
    let (valor, _) = evaluar_tramo(ultimo, c.fin - ultimo.desde);
    assert!(
        (valor - f64::from(c.final_)).abs() <= 0.002 * escala,
        "salto final actual={valor} destino={}",
        c.final_
    );
}
fn comprobar_caso(
    config: &vantare_compositor::receta::Transicion,
    desde: f32,
    hasta: f32,
    velocidad: Option<f32>,
    errores: &mut Vec<String>,
) {
    match animacion::transicion(config, Instante(0.0), desde, hasta, velocidad) {
        Ok(curva) => costuras(
            &curva,
            desde,
            velocidad,
            f64::from((hasta - desde).abs()).max(1.0),
        ),
        Err(e) => {
            if !rechazo_dinamico_esperado(config, desde, hasta, velocidad, e) {
                errores.push(format!(
                    "{config:?} {desde}->{hasta} v={velocidad:?}: {e:?}"
                ));
            }
        }
    }
}
// No existe una cúbica nativa con coeficientes f32 para toda tangente CSS
// infinita ni un asentamiento en 10 s para cualquier velocidad de interrupción.
// Se comprueba el error explícito; todas las demás curvas deben representarse.
fn rechazo_dinamico_esperado(
    config: &vantare_compositor::receta::Transicion,
    desde: f32,
    hasta: f32,
    velocidad: Option<f32>,
    error: animacion::ErrorAnimacion,
) -> bool {
    use vantare_compositor::receta::Transicion;
    match (*config, error) {
        (
            Transicion::Muelle {
                rigidez,
                amortiguacion,
            },
            animacion::ErrorAnimacion::Precision,
        ) => {
            let (residuo, v) = animacion::muelle(
                rigidez,
                amortiguacion,
                desde - hasta,
                velocidad.map_or(0.0, |v| v),
                10.0,
            );
            let tolerancia = 0.001 * (hasta - desde).abs().max(1.0);
            residuo.abs() > tolerancia || v.abs() > tolerancia
        }
        (
            Transicion::Bezier {
                duracion,
                retardo,
                puntos,
            },
            animacion::ErrorAnimacion::Coeficientes,
        ) => {
            duracion <= 0.18
                && retardo > 0.0
                && (hasta - desde).abs() <= 1.0
                && velocidad.is_some_and(|v| v.abs() >= 150.0)
                && puntos[0].abs() < f32::EPSILON
                && (puntos[1] - 1.0).abs() < f32::EPSILON
                && (puntos[2] - 1.0).abs() < f32::EPSILON
                && puntos[3].abs() < f32::EPSILON
        }
        _ => false,
    }
}
#[test]
fn ataque_costuras_y_extremos_css_y_muelles() {
    let mut errores = Vec::new();
    let curvas = [
        json!("lineal"),
        json!("entrada"),
        json!("salida"),
        json!("entrada-salida"),
        json!([0.2, 0.7, 0.7, 1.0]),
        json!([0.1, 1.4, 0.9, -0.4]),
        json!([0.0, 1.0, 1.0, 0.0]),
        json!([0.0, 0.0, 0.0, 1.0]),
        json!([1.0, 0.0, 1.0, 1.0]),
    ];
    for curva in curvas {
        for dur in [30, 180, 1500] {
            for ret in [0, 200] {
                let cfg = vantare_compositor::receta::leer_transicion(
                    &json!({"duracion":dur,"retardo":ret,"curva":curva}),
                )
                .unwrap();
                for v in [None, Some(0.0), Some(150.0), Some(-300.0)] {
                    for (d, h) in [(0.0, 1.0), (0.0, 100.0), (50.0, -50.0), (1.0, 1.0)] {
                        comprobar_caso(&cfg, d, h, v, &mut errores);
                    }
                }
            }
        }
    }
    for rig in [20.0, 170.0, 1000.0, 9000.0] {
        for amo in [1.0, 10.0, 26.0, 80.0, 400.0, 9000.0] {
            let Ok(cfg) = vantare_compositor::receta::leer_transicion(
                &json!({"muelle":{"rigidez":rig,"amortiguacion":amo}}),
            ) else {
                continue;
            };
            for v in [None, Some(200.0), Some(-1000.0)] {
                for (d, h) in [(0.0, 100.0), (500.0, 500.0), (1000.0, 1000.5)] {
                    comprobar_caso(&cfg, d, h, v, &mut errores);
                }
            }
        }
    }
    assert!(
        errores.is_empty(),
        "{} casos no representados: {errores:#?}",
        errores.len()
    );
}
#[test]
fn ataque_bucles_repeticion_costuras_y_curvas_emitidas() {
    for valores in [&[0.35, 1.0, 0.35][..], &[0.35, 1.0][..]] {
        let c = animacion::bucle_desde(valores, 1.0, Instante(0.0), 0.8, 0.5).unwrap();
        invariantes_curva(&c);
        let (desde, duracion) = c.repetir.unwrap();
        let a = animacion::muestra(&c, Instante(desde + 0.123));
        for ciclos in [1.0, 2.0, 100.0] {
            let b = animacion::muestra(&c, Instante(desde + 0.123 + ciclos * duracion));
            assert!((a.0 - b.0).abs() < 0.00001 && (a.1 - b.1).abs() < 0.0001);
        }
        let mut anterior = animacion::muestra(&c, Instante(0.0));
        for i in 1..8000 {
            let actual = animacion::muestra(&c, Instante(f64::from(i) * 0.0005));
            assert!((actual.0 - anterior.0).abs() < 0.01);
            anterior = actual;
        }
    }
    let mut r = lista();
    r["raiz"]["hijos"][0]["plantilla"]["bucle"] =
        json!({"propiedad":"opacidad","valores":[0.35,1,0.35],"duracion":1000,"cuando":"activo"});
    let mut e = escena(&r, &fixture("sistema"));
    let mut m = fixture("datos");
    let mut arbol = Arbol::default();
    arbol.aplicar(&e.actualizar(&m, Instante(0.0), &Fijo).unwrap());
    m["activo"] = json!(true);
    arbol.aplicar(&e.actualizar(&m, Instante(0.1), &Fijo).unwrap());
    m["filas"].as_array_mut().unwrap().reverse();
    arbol.aplicar(&e.actualizar(&m, Instante(0.2), &Fijo).unwrap());
    m["activo"] = json!(false);
    arbol.aplicar(&e.actualizar(&m, Instante(0.3), &Fijo).unwrap());
    let sistema = cargar_prueba(&r, &fixture("sistema")).unwrap().sistema;
    arbol.aplicar(&e.cambiar_sistema(sistema, Instante(0.4), &Fijo).unwrap());
    arbol.aplicar(&e.avanzar(Instante(2.0)).unwrap());
}

#[test]
fn recarga_conserva_fichero_y_puntero_y_es_atomica() {
    let r = fixture("receta");
    let s = fixture("sistema");
    let m = fixture("modelo");
    let carga = vantare_compositor::receta::cargar(
        ("panel.receta.json", &r.to_string()),
        ("tema.sistema.json", &s.to_string()),
        ("relativo.modelo.json", &m.to_string()),
    )
    .unwrap();
    let mut e = Escena::nueva(carga.receta);
    e.actualizar(&fixture("datos"), Instante(0.0), &Fijo)
        .unwrap();
    let mut s = carga.sistema;
    s.medida.insert("w".into(), json!(1e39));
    let error = e.cambiar_sistema(s, Instante(1.0), &Fijo).unwrap_err();
    assert_eq!(error.puntero, "/medida/w");
    assert!(error.detalle.contains("tema.sistema.json:/medida/w"));
    assert!(
        e.actualizar(&fixture("datos"), Instante(2.0), &Fijo)
            .unwrap()
            .operaciones
            .is_empty()
    );
}
#[test]
fn recuperar_fantasmas_anidados_preserva_jerarquia() {
    let mut r = fixture("receta");
    r["raiz"]["hijos"] = json!([{"tipo":"lista","de":"filas","como":"fila","clave":"id",
        "salida":{"hacia":{"opacidad":0},"transicion":"$mov.suave"},
        "plantilla":{"tipo":"caja","hijos":[{"tipo":"caja","capa":true,"hijos":[
            {"tipo":"texto","texto":"{fila.texto}","estilo":{"color":"$color.a","tipo":"$tipo.fila"}}]}]}}]);
    let contrato = fixture("modelo");
    let carga = vantare_compositor::receta::cargar(
        ("r", &r.to_string()),
        ("s", &fixture("sistema").to_string()),
        ("m", &contrato.to_string()),
    )
    .unwrap();
    let mut e = Escena::nueva(carga.receta);
    let mut m = fixture("datos");
    m["filas"] = json!([{"id":"a","texto":"A","clase":"a"},{"id":"b","texto":"B","clase":"a"}]);
    let mut arbol = Arbol::default();
    arbol.aplicar(&e.actualizar(&m, Instante(0.0), &Fijo).unwrap());
    let ids = arbol.padres.keys().copied().collect::<Vec<_>>();
    let originales = m["filas"].clone();
    m["filas"] = json!([]);
    arbol.aplicar(&e.actualizar(&m, Instante(0.1), &Fijo).unwrap());
    m["filas"] = originales;
    m["filas"].as_array_mut().unwrap().remove(0);
    arbol.aplicar(&e.actualizar(&m, Instante(0.2), &Fijo).unwrap());
    assert!(
        arbol.padres.keys().all(|id| ids.contains(id)),
        "recuperación sin recrear"
    );
    arbol.aplicar(&e.avanzar(Instante(2.0)).unwrap());
    let finales = arbol.padres.clone();
    assert!(e.avanzar(Instante(3.0)).unwrap().operaciones.is_empty());
    assert_eq!(arbol.padres, finales);
}
#[test]
fn tipos_enlazados_a_enum_se_compilan_en_tabla() {
    let mut r = lista();
    r["raiz"]["hijos"][0]["plantilla"]["estilo"]["tipo"] = json!("$tipo.clase.{fila.clase}");
    let mut s = fixture("sistema");
    let f = s["tipo"]["fila"].clone();
    s["tipo"]["clase"] = json!({"a":f,"b":f});
    let mut e = escena(&r, &s);
    e.actualizar(&fixture("datos"), Instante(0.0), &Fijo)
        .unwrap();
    s["tipo"]["clase"]["b"]["tamano"] = json!(0);
    assert!(cargar_prueba(&r, &s).is_err());
}

#[test]
fn errores_de_compilacion_no_se_tapan_con_defectos() {
    let mut r = fixture("receta");
    r["raiz"]["hijos"] = json!([
        {"tipo":"texto","texto":"A","estilo":{"tipo":"$tipo.incompleta","color":"$color.a"}},
        {"tipo":"texto","texto":"B","estilo":{"tipo":"$tipo.incompleta","color":"$color.a"}}]);
    let mut s = fixture("sistema");
    s["tipo"]["incompleta"] = json!({"familia":"Inter","tamano":13,"interlinea":18});
    let errores = cargar_prueba(&r, &s).unwrap_err();
    for i in 0..2 {
        assert!(
            errores
                .iter()
                .any(|e| e.puntero == format!("/raiz/hijos/{i}/estilo/tipo/peso"))
        );
    }
    r["raiz"]["hijos"] = json!([{"tipo":"texto","texto":"Sin tipo ni color"}]);
    assert!(cargar_prueba(&r, &fixture("sistema")).is_err());
    for radio in [json!([0, 0, 0]), json!([0, 0])] {
        r["raiz"]["estilo"]["radio"] = radio;
        assert!(cargar_prueba(&r, &fixture("sistema")).is_err());
    }
}

#[test]
fn recargas_purgan_fantasmas_antes_del_limite() {
    let mut r = lista();
    let mut segunda = r["raiz"]["hijos"][0].clone();
    r["raiz"]["hijos"][0]["id"] = json!("a");
    segunda["id"] = json!("b");
    r["raiz"]["hijos"].as_array_mut().unwrap().push(segunda);
    let carga = cargar_prueba(&r, &fixture("sistema")).unwrap();
    let mut e = Escena::nueva(carga.receta);
    let mut m = fixture("datos");
    m["filas"] = Value::Array(
        (0..60)
            .map(|i| json!({"id":format!("{i}"),"texto":"x","clase":"a"}))
            .collect(),
    );
    let mut arbol = Arbol::default();
    arbol.aplicar(&e.actualizar(&m, Instante(0.0), &Fijo).unwrap());
    assert_eq!(arbol.padres.len(), 121);
    for t in [0.1, 100.0, 200.0] {
        arbol.aplicar(
            &e.cambiar_sistema(carga.sistema.clone(), Instante(t), &Fijo)
                .unwrap(),
        );
        assert_eq!(arbol.padres.len(), 242);
    }
    arbol.aplicar(&e.avanzar(Instante(201.0)).unwrap());
    assert_eq!(arbol.padres.len(), 121);
}

#[test]
fn bucle_se_reanuda_con_entrada_al_reaparecer() {
    let mut r = fixture("receta");
    r["visible"] = json!("visible");
    r["entrada"] = json!({"desde":{"opacidad":0},"transicion":"$mov.suave"});
    r["salida"] = json!({"hacia":{"opacidad":0},"transicion":"$mov.suave"});
    r["raiz"]["bucle"] = json!({"propiedad":"opacidad","valores":[0.35,1,0.35],"duracion":1000});
    let mut e = escena(&r, &fixture("sistema"));
    let mut m = fixture("datos");
    let mut arbol = Arbol::default();
    m["visible"] = json!(false);
    arbol.aplicar(&e.actualizar(&m, Instante(0.0), &Fijo).unwrap());
    for ahora in [1.0, 3.0] {
        m["visible"] = json!(true);
        let lote = e.actualizar(&m, Instante(ahora), &Fijo).unwrap();
        arbol.aplicar(&lote);
        let curva = lote
            .operaciones
            .iter()
            .find_map(|o| match o {
                Operacion::Animar {
                    propiedad: Propiedad::Opacidad,
                    curva,
                    ..
                } => Some(curva),
                _ => None,
            })
            .unwrap();
        let (inicio_ciclo, _) = curva.repetir.expect("se debe reanudar el bucle");
        assert!(
            (inicio_ciclo - 0.5).abs() < 0.00001,
            "conserva entrada de 500 ms"
        );
        assert!(
            e.valor(CapaId(1), Propiedad::Opacidad, Instante(ahora + 0.75))
                .unwrap()
                > 0.35
        );
        m["visible"] = json!(false);
        arbol.aplicar(&e.actualizar(&m, Instante(ahora + 0.8), &Fijo).unwrap());
        assert!(
            e.valor(CapaId(1), Propiedad::Opacidad, Instante(ahora + 1.5))
                .unwrap()
                .abs()
                < 0.00001
        );
    }
}

#[test]
fn limites_numericos_se_devuelven_como_error_sin_curva_parcial() {
    let cfg = vantare_compositor::receta::leer_transicion(
        &json!({"duracion":30,"retardo":200,"curva":[0,1,1,0]}),
    )
    .unwrap();
    assert_eq!(
        animacion::transicion(&cfg, Instante(0.0), 1.0, 1.0, Some(150.0)).unwrap_err(),
        animacion::ErrorAnimacion::Coeficientes
    );
    let cfg = vantare_compositor::receta::leer_transicion(
        &json!({"muelle":{"rigidez":20,"amortiguacion":26}}),
    )
    .unwrap();
    assert_eq!(
        animacion::transicion(&cfg, Instante(0.0), 500.0, 500.0, Some(200.0)).unwrap_err(),
        animacion::ErrorAnimacion::Precision
    );
}
