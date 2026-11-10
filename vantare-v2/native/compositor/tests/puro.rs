use serde_json::{Value, json};
use vantare_compositor::{
    escena::{
        Escena, Medidor, animacion,
        capas::{CapaId, Fuente, Instante, Operacion, Propiedad},
    },
    receta::{Carga, Causa, cargar},
};
struct Fijo;
impl Medidor for Fijo {
    fn medir(&self, texto: &str, _: &Fuente) -> (f32, f32) {
        (
            f32::from(u16::try_from(texto.chars().count()).expect("texto de prueba acotado")) * 7.0,
            18.0,
        )
    }
}
fn sistema() -> Value {
    serde_json::from_str(include_str!("fixtures/sistema.json")).expect("fixture de prueba valido")
}
fn modelo() -> Value {
    serde_json::from_str(include_str!("fixtures/modelo.json")).expect("fixture de prueba valido")
}
fn receta() -> Value {
    serde_json::from_str(include_str!("fixtures/receta.json")).expect("fixture de prueba valido")
}
fn carga(r: &Value, s: &Value) -> Result<Carga, Vec<vantare_compositor::receta::Diagnostico>> {
    cargar(
        ("r.json", &r.to_string()),
        ("s.json", &s.to_string()),
        ("m.json", &modelo().to_string()),
    )
}
fn escenario(r: &Value) -> Escena {
    let c = carga(r, &sistema()).expect("fixture de prueba valido");
    Escena::nueva(c.receta, c.sistema)
}
fn datos() -> Value {
    serde_json::from_str(include_str!("fixtures/datos.json")).expect("fixture de prueba valido")
}
fn error(r: &Value, s: &Value, causa: Causa, p: &str) {
    let e = carga(r, s).expect_err("la receta de esta prueba debe ser rechazada");
    assert!(
        e.iter().any(|e| e.causa == causa && e.puntero == p),
        "{e:?}"
    );
    assert!(e.iter().all(|e| !e.solucion.is_empty()));
}
#[test]
fn minima_valida_y_diff_vacio() {
    let mut e = escenario(&receta());
    let a = e.actualizar(&datos(), Instante(0.0), &Fijo).unwrap();
    assert!(
        a.operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Pintar { .. }))
    );
    assert!(
        e.actualizar(&datos(), Instante(0.1), &Fijo)
            .unwrap()
            .operaciones
            .is_empty()
    );
}
#[test]
fn version_y_tipo_acumulados() {
    let mut r = receta();
    r["receta"] = json!(2);
    r["tipo"] = json!("menu");
    error(&r, &sistema(), Causa::Version, "/receta");
    error(&r, &sistema(), Causa::NoSoportado, "/tipo");
    assert!(carga(&r, &sistema()).unwrap_err().len() >= 2);
}
#[test]
fn desconocido_con_puntero() {
    let mut r = receta();
    r["raiz"]["estilo"]["imajen"] = json!(true);
    error(
        &r,
        &sistema(),
        Causa::CampoDesconocido,
        "/raiz/estilo/imajen",
    );
}
#[test]
fn tokens_y_medidas() {
    let mut r = receta();
    r["raiz"]["estilo"]["fondo"] = json!("#ffffff");
    r["raiz"]["estilo"]["alto"] = json!(24);
    error(&r, &sistema(), Causa::Token, "/raiz/estilo/fondo");
    error(&r, &sistema(), Causa::Medida, "/raiz/estilo/alto");
}
#[test]
fn enlace_y_condicion_tipados() {
    let mut r = receta();
    r["visible"] = json!("titulo");
    r["raiz"]["hijos"][0]["texto"] = json!("{no_existe}");
    error(&r, &sistema(), Causa::Condicion, "/visible");
    error(&r, &sistema(), Causa::Enlace, "/raiz/hijos/0/texto");
}
#[test]
fn ids_unicos() {
    let mut r = receta();
    r["raiz"]["hijos"] = json!([{"tipo":"caja","id":"igual"},{"tipo":"caja","id":"igual"}]);
    error(&r, &sistema(), Causa::Identidad, "/raiz/hijos/1/id");
}
#[test]
fn transicion_y_bucle_limitados() {
    let mut r = receta();
    r["raiz"]["transiciones"] = json!({"opacidad":{"duracion":10001}});
    r["raiz"]["bucle"] = json!({"propiedad":"opacidad","valores":[0,1],"duracion":10001});
    error(
        &r,
        &sistema(),
        Causa::Transicion,
        "/raiz/transiciones/opacidad",
    );
    error(&r, &sistema(), Causa::Transicion, "/raiz/bucle");
}
#[test]
fn pintada_produce_aviso() {
    let mut r = receta();
    r["raiz"]["transiciones"] = json!({"fondo":"$mov.suave"});
    let c = carga(&r, &sistema()).unwrap();
    assert_eq!(c.avisos[0].puntero, "/raiz/transiciones/fondo");
}
#[test]
fn ciclo_y_fuente() {
    let mut s = sistema();
    s["medida"]["w"] = json!("$medida.h");
    s["medida"]["h"] = json!("$medida.w");
    s["tipo"]["fila"]["familia"] = json!("NoEmpaquetada");
    error(&receta(), &s, Causa::Ciclo, "/raiz/estilo/ancho");
    error(&receta(), &s, Causa::Fuente, "/tipo/fila/familia");
}
fn lista() -> Value {
    let mut r = receta();
    r["raiz"]["hijos"] = json!([{"tipo":"lista","de":"filas","como":"fila","clave":"id","movimiento":"$mov.suave","entrada":{"desde":{"opacidad":0},"transicion":"$mov.suave"},"salida":{"hacia":{"opacidad":0},"transicion":"$mov.suave"},"plantilla":{"tipo":"texto","texto":"{fila.texto}","estilo":{"alto":"$medida.h","color":"$color.clase.{fila.clase}","tipo":"$tipo.fila"}}}]);
    r
}
#[test]
fn contrato_lista_alias_clave_y_enum() {
    let mut r = lista();
    r["raiz"]["hijos"][0]["de"] = json!("titulo");
    error(&r, &sistema(), Causa::Lista, "/raiz/hijos/0/de");
    let mut r = lista();
    r["raiz"]["hijos"][0]["clave"] = json!("ausente");
    r["raiz"]["hijos"][0]["como"] = json!("titulo");
    error(&r, &sistema(), Causa::Identidad, "/raiz/hijos/0/clave");
    error(&r, &sistema(), Causa::Lista, "/raiz/hijos/0/como");
    let mut s = sistema();
    s["color"]["clase"].as_object_mut().unwrap().remove("b");
    error(
        &lista(),
        &s,
        Causa::Token,
        "/raiz/hijos/0/plantilla/estilo/color",
    );
}
#[test]
fn listas_flip_y_fantasma() {
    let mut e = escenario(&lista());
    let mut m = datos();
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    m["filas"].as_array_mut().unwrap().reverse();
    let l = e.actualizar(&m, Instante(0.6), &Fijo).unwrap();
    assert!(
        !l.operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Pintar { .. } | Operacion::Crear { .. }))
    );
    let curva = l
        .operaciones
        .iter()
        .find_map(|o| match o {
            Operacion::Animar {
                propiedad: Propiedad::Y,
                curva,
                ..
            } => Some(curva),
            _ => None,
        })
        .unwrap();
    assert!((animacion::muestra(curva, Instante(0.6)).0.abs() - 24.0).abs() < 0.01);
    m["filas"].as_array_mut().unwrap().pop();
    let l = e.actualizar(&m, Instante(0.7), &Fijo).unwrap();
    assert!(
        !l.operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Quitar { .. }))
    );
    assert!(
        e.avanzar(Instante(1.3), &Fijo)
            .operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Quitar { .. }))
    );
}
#[test]
fn estados_solo_compuesta_sin_repintar() {
    let mut r = receta();
    r["raiz"]["estados"] = json!([{"cuando":"activo","estilo":{"opacidad":0.4}},{"cuando":"activo","estilo":{"opacidad":0.7}}]);
    r["raiz"]["transiciones"] = json!({"opacidad":"$mov.suave"});
    let mut e = escenario(&r);
    let mut m = datos();
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    m["activo"] = json!(true);
    let l = e.actualizar(&m, Instante(1.0), &Fijo).unwrap();
    assert_eq!(l.operaciones.len(), 1);
    assert!(
        matches!(&l.operaciones[0],Operacion::Animar {curva,..} if (curva.final_-0.7).abs()<1.0e-6)
    );
}
#[test]
fn interrupcion_c1() {
    let cfg = json!({"duracion":1000,"curva":[0.2,0.7,0.7,1.0]});
    let anterior = animacion::transicion(&cfg, Instante(0.0), 0.0, 100.0, None);
    let (valor_antes, velocidad_antes) = animacion::muestra(&anterior, Instante(0.4));
    let siguiente = animacion::transicion(
        &cfg,
        Instante(0.4),
        valor_antes,
        -50.0,
        Some(velocidad_antes),
    );
    let (valor_despues, velocidad_despues) = animacion::muestra(&siguiente, Instante(0.4));
    assert!((valor_antes - valor_despues).abs() < 1.0e-5);
    assert!((velocidad_antes - velocidad_despues).abs() < 0.001);
}
#[test]
fn bezier_error_menor_medio_por_ciento() {
    for puntos in [
        [0.42, 0.0, 1.0, 1.0],
        [0.0, 0.0, 0.58, 1.0],
        [0.1, 1.4, 0.9, -0.4],
        [0.0, 1.0, 1.0, 0.0],
    ] {
        let cfg = json!({"duracion":1000,"curva":puntos});
        let c = animacion::transicion(&cfg, Instante(0.0), 0.0, 1.0, None);
        for i in 0..=4000_u16 {
            let t = f32::from(i) / 4000.0;
            let exacto = bezier_exacta(puntos, f64::from(t));
            let aproximado = animacion::muestra(&c, Instante(f64::from(t))).0;
            assert!(
                (exacto - f64::from(aproximado)).abs() <= 0.005,
                "{puntos:?}, {t}, {exacto}, {aproximado}"
            );
        }
    }
}
#[test]
fn muelle_contra_referencia_y_c1() {
    for amortiguacion in [10.0, 20.0, 35.0] {
        let cfg = json!({"muelle":{"rigidez":100,"amortiguacion":amortiguacion}});
        let curva = animacion::transicion(&cfg, Instante(0.0), 0.0, 1.0, Some(0.4));
        for i in 0..1000_u16 {
            let t = f32::from(i) / 1000.0;
            let referencia = animacion::muelle(100.0, amortiguacion, -1.0, 0.4, t).0 + 1.0;
            let actual = animacion::muestra(&curva, Instante(f64::from(t))).0;
            assert!((referencia - actual).abs() < 0.005);
        }
        let (valor_antes, velocidad_antes) = animacion::muestra(&curva, Instante(0.3));
        let nueva =
            animacion::transicion(&cfg, Instante(0.3), valor_antes, 0.0, Some(velocidad_antes));
        let (valor_despues, velocidad_despues) = animacion::muestra(&nueva, Instante(0.3));
        assert!(
            (valor_antes - valor_despues).abs() < 1.0e-5
                && (velocidad_antes - velocidad_despues).abs() < 1.0e-4
        );
    }
}
#[test]
fn bucle_sale_sin_salto() {
    let mut r = receta();
    r["raiz"]["estados"] = json!([{"cuando":"activo","bucle":{"propiedad":"opacidad","valores":[1,0.35,1],"duracion":1000}}]);
    let mut e = escenario(&r);
    let mut m = datos();
    m["activo"] = json!(true);
    let l = e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    let id = l
        .operaciones
        .iter()
        .find_map(|o| match o {
            Operacion::Crear { id, .. } => Some(*id),
            _ => None,
        })
        .unwrap();
    let antes = e.valor(id, Propiedad::Opacidad, Instante(0.3));
    m["activo"] = json!(false);
    let l = e.actualizar(&m, Instante(0.3), &Fijo).unwrap();
    assert!((e.valor(id, Propiedad::Opacidad, Instante(0.3)) - antes).abs() < 1.0e-5);
    assert!(
        l.operaciones
            .iter()
            .any(|o| matches!(o,Operacion::Animar{curva,..} if curva.repetir.is_none()))
    );
    assert!((e.valor(id, Propiedad::Opacidad, Instante(2.0)) - 1.0).abs() < 1.0e-5);
}
#[test]
fn cambio_sistema_funde_y_retira() {
    let mut receta_actual = receta();
    receta_actual["entrada"] = json!({"desde":{"opacidad":0},"transicion":"$mov.suave"});
    let mut escena = escenario(&receta_actual);
    escena.actualizar(&datos(), Instante(0.0), &Fijo).unwrap();
    let mut sistema_nuevo = sistema();
    sistema_nuevo["color"]["a"] = json!("#00ff00");
    let nuevo = carga(&receta_actual, &sistema_nuevo).unwrap().sistema;
    let lote = escena.cambiar_sistema(nuevo, Instante(1.0), &Fijo).unwrap();
    let raiz_nueva = lote
        .operaciones
        .iter()
        .find_map(|operacion| match operacion {
            Operacion::Crear {
                id, padre: None, ..
            } => Some(*id),
            _ => None,
        })
        .unwrap();
    assert!((escena.valor(raiz_nueva, Propiedad::Opacidad, Instante(1.6)) - 1.0).abs() < 1.0e-5);
    assert!(
        lote.operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Crear { .. }))
    );
    assert!(
        !lote
            .operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Quitar { .. }))
    );
    assert!(
        escena
            .avanzar(Instante(1.6), &Fijo)
            .operaciones
            .iter()
            .any(|o| matches!(o, Operacion::Quitar { id: CapaId(1) }))
    );
}
#[test]
fn limites_sin_panico_y_error_atomico() {
    let mut r = receta();
    r["raiz"]["hijos"] = Value::Array((0..513).map(|_| json!({"tipo":"caja"})).collect());
    error(&r, &sistema(), Causa::Limite, "/raiz/hijos/511");
    let mut e = escenario(&lista());
    let mut m = datos();
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    m["filas"] = Value::Array(
        (0..65)
            .map(|i| json!({"id":i.to_string(),"texto":"x","clase":"a"}))
            .collect(),
    );
    assert!(e.actualizar(&m, Instante(0.1), &Fijo).is_err());
    assert!(
        e.actualizar(&datos(), Instante(0.2), &Fijo)
            .unwrap()
            .operaciones
            .is_empty()
    );
}
#[test]
fn visibilidad_raiz_entrada_salida_e_interrupcion() {
    let mut r = receta();
    r["visible"] = json!("visible");
    r["entrada"] = json!({"desde":{"opacidad":0,"y":-8},"transicion":"$mov.suave"});
    r["salida"] = json!({"hacia":{"opacidad":0,"y":-8},"transicion":"$mov.suave"});
    let mut e = escenario(&r);
    let mut m = datos();
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    m["visible"] = json!(false);
    let l = e.actualizar(&m, Instante(1.0), &Fijo).unwrap();
    assert!(l.operaciones.iter().any(|o| matches!(
        o,
        Operacion::Animar {
            propiedad: Propiedad::Opacidad,
            ..
        }
    )));
    let antes = e.valor(CapaId(1), Propiedad::Y, Instante(1.2));
    m["visible"] = json!(true);
    e.actualizar(&m, Instante(1.2), &Fijo).unwrap();
    assert!((e.valor(CapaId(1), Propiedad::Y, Instante(1.2)) - antes).abs() < 1.0e-5);
    assert!(e.valor(CapaId(1), Propiedad::Y, Instante(2.0)).abs() < 1.0e-5);
}
#[test]
fn pintadas_programan_solo_la_capa_afectada() {
    let mut r = receta();
    r["raiz"]["estados"] = json!([{"cuando":"activo","estilo":{"fondo":"$color.b"}}]);
    r["raiz"]["transiciones"] = json!({"fondo":"$mov.suave"});
    let mut e = escenario(&r);
    let mut m = datos();
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    m["activo"] = json!(true);
    e.actualizar(&m, Instante(1.0), &Fijo).unwrap();
    assert!(e.proximo_fotograma().unwrap().0 > 1.0);
    let l = e.avanzar(Instante(1.2), &Fijo);
    assert!(matches!(
        l.operaciones.as_slice(),
        [Operacion::Pintar { id: CapaId(1), .. }]
    ));
    assert!(e.proximo_fotograma().unwrap().0 > 1.2);
    e.avanzar(Instante(1.6), &Fijo);
    assert!(e.proximo_fotograma().is_none());
    assert!(e.avanzar(Instante(1.7), &Fijo).operaciones.is_empty());
}
#[test]
fn profundidad_tamano_fuentes_y_modelo_invalido() {
    let mut r = receta();
    let mut n = json!({"tipo":"caja"});
    for _ in 0..34 {
        n = json!({"tipo":"caja","hijos":[n]});
    }
    r["raiz"] = n;
    let errores = carga(&r, &sistema()).unwrap_err();
    assert!(
        errores
            .iter()
            .any(|e| e.causa == Causa::Limite && e.puntero.starts_with("/raiz/hijos/0"))
    );
    let grande = " ".repeat(256 * 1024 + 1);
    let e = cargar(("r.json", &grande), ("s.json", "{}"), ("m.json", "{}")).unwrap_err();
    assert_eq!(e[0].causa, Causa::Limite);
    let mut e = escenario(&receta());
    let mut m = datos();
    m["titulo"] = json!("x".repeat(257));
    assert!(e.actualizar(&m, Instante(0.0), &Fijo).is_err());
}
#[test]
fn cambio_invalido_conserva_escena() {
    let mut e = escenario(&receta());
    e.actualizar(&datos(), Instante(0.0), &Fijo).unwrap();
    let mut nuevo = carga(&receta(), &sistema()).unwrap().receta;
    nuevo.raiz.texto = Some("{ausente}".into());
    assert!(e.cambiar_receta(nuevo, Instante(1.0), &Fijo).is_err());
    assert!(
        e.actualizar(&datos(), Instante(1.1), &Fijo)
            .unwrap()
            .operaciones
            .is_empty()
    );
}

#[test]
fn texto_recibe_la_caja_disponible_para_el_recorte() {
    let mut escena = escenario(&receta());
    let mut m = datos();
    m["titulo"] = json!("un texto que no cabe en los 140 puntos del panel");
    let lote = escena.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    let caja = lote
        .operaciones
        .iter()
        .filter_map(|o| match o {
            Operacion::Pintar { dibujos, .. } => Some(dibujos),
            _ => None,
        })
        .flatten()
        .find_map(|d| match d {
            vantare_compositor::escena::capas::Dibujo::Texto { caja, .. } => Some(caja),
            _ => None,
        })
        .unwrap();
    assert!(caja.ancho <= 140.0 && caja.ancho > 0.0);
}

#[test]
fn retardo_conserva_c1_y_el_plazo() {
    let cfg = json!({"duracion":500,"retardo":200,"curva":"lineal"});
    let c = animacion::transicion(&cfg, Instante(1.0), 0.5, 1.0, Some(0.4));
    let inicial = animacion::muestra(&c, Instante(1.0));
    assert!((inicial.0 - 0.5).abs() < 1.0e-6 && (inicial.1 - 0.4).abs() < 1.0e-6);
    let antes = animacion::muestra(&c, Instante(1.2 - 1.0e-6));
    let despues = animacion::muestra(&c, Instante(1.2 + 1.0e-6));
    assert!((antes.0 - despues.0).abs() < 1.0e-5 && (antes.1 - despues.1).abs() < 1.0e-4);
    assert!((c.fin - 0.7).abs() < 1.0e-6);
}
#[test]
fn bezier_error_relativo_en_recorridos_pequenos() {
    let puntos = [0.42, 0.0, 1.0, 1.0];
    let cfg = json!({"duracion":1000,"curva":puntos});
    let c = animacion::transicion(&cfg, Instante(0.0), 0.99, 1.0, None);
    for i in 0..=2000 {
        let t = f64::from(i) / 2000.0;
        let exacto = 0.99 + 0.01 * bezier_exacta(puntos, t);
        let real = f64::from(animacion::muestra(&c, Instante(t)).0);
        assert!((exacto - real).abs() <= 0.00005);
    }
}
#[test]
fn un_bucle_no_muestra_una_raiz_oculta() {
    let mut r = receta();
    r["visible"] = json!("visible");
    r["raiz"]["bucle"] = json!({"propiedad":"opacidad","valores":[0.35,1,0.35],"duracion":1000});
    let mut e = escenario(&r);
    let mut m = datos();
    m["visible"] = json!(false);
    e.actualizar(&m, Instante(0.0), &Fijo).unwrap();
    assert!(e.valor(CapaId(1), Propiedad::Opacidad, Instante(2.0)).abs() < 1.0e-6);
}

#[test]
fn documentos_minimos_v1() {
    let r = r#"{"receta":1,"tipo":"overlay","nombre":"minima","modelo":"minima/1","raiz":{"tipo":"caja"}}"#;
    let s = r#"{"sistema":1,"nombre":"minimo","fuentes":[]}"#;
    let m = r#"{"modelo":"minima/1","campos":{}}"#;
    let c = cargar(("r.json", r), ("s.json", s), ("m.json", m)).unwrap();
    let mut escena = Escena::nueva(c.receta, c.sistema);
    assert!(escena.actualizar(&json!({}), Instante(0.0), &Fijo).is_ok());
}
#[test]
fn errores_json_y_tipo_llevan_puntero() {
    let errores = cargar(("roto.json", "{"), ("s.json", "{}"), ("m.json", "{}")).unwrap_err();
    assert_eq!(errores[0].causa, Causa::Json);
    assert_eq!(errores[0].puntero, "");
    assert_eq!(errores[0].fichero, "roto.json");
    let mut r = receta();
    r["raiz"]["tipo"] = json!("imagen");
    error(&r, &sistema(), Causa::Tipo, "/raiz/tipo");
}
#[test]
fn limite_estatico_de_capas_y_fuentes_del_paquete() {
    let mut r = receta();
    r["raiz"]["hijos"] = Value::Array(
        (0..256)
            .map(|_| json!({"tipo":"caja","capa":true}))
            .collect(),
    );
    error(&r, &sistema(), Causa::Limite, "/raiz/hijos/255");
    let mut s = sistema();
    s["fuentes"] = json!(["Ajena"]);
    error(&receta(), &s, Causa::Fuente, "/fuentes/0");
}

#[test]
fn reaparecer_durante_salida_recupera_identidad_y_c1() {
    use vantare_compositor::escena::capas::Dibujo;
    let mut escena = escenario(&lista());
    let mut modelo = datos();
    let inicial = escena.actualizar(&modelo, Instante(0.0), &Fijo).unwrap();
    let id_fila = inicial
        .operaciones
        .iter()
        .find_map(|operacion| match operacion {
            Operacion::Pintar { id, dibujos }
                if dibujos
                    .iter()
                    .any(|d| matches!(d,Dibujo::Texto {texto,..} if texto=="Dos")) =>
            {
                Some(*id)
            }
            _ => None,
        })
        .unwrap();
    modelo["filas"].as_array_mut().unwrap().pop();
    let salida = escena.actualizar(&modelo, Instante(1.0), &Fijo).unwrap();
    let curva_salida = salida
        .operaciones
        .iter()
        .find_map(|operacion| match operacion {
            Operacion::Animar {
                id,
                propiedad: Propiedad::Opacidad,
                curva,
            } if *id == id_fila => Some(curva),
            _ => None,
        })
        .unwrap();
    let antes = animacion::muestra(curva_salida, Instante(1.2));
    let regreso = escena.actualizar(&datos(), Instante(1.2), &Fijo).unwrap();
    assert!(
        !regreso
            .operaciones
            .iter()
            .any(|operacion| matches!(operacion, Operacion::Crear { .. }))
    );
    let curva_regreso = regreso
        .operaciones
        .iter()
        .find_map(|operacion| match operacion {
            Operacion::Animar {
                id,
                propiedad: Propiedad::Opacidad,
                curva,
            } if *id == id_fila => Some(curva),
            _ => None,
        })
        .unwrap();
    let despues = animacion::muestra(curva_regreso, Instante(1.2));
    assert!((antes.0 - despues.0).abs() < 1.0e-5 && (antes.1 - despues.1).abs() < 1.0e-5);
    assert!(
        !escena
            .avanzar(Instante(2.0), &Fijo)
            .operaciones
            .iter()
            .any(|operacion| matches!(operacion,Operacion::Quitar {id} if *id==id_fila))
    );
    assert!((escena.valor(id_fila, Propiedad::Opacidad, Instante(2.0)) - 1.0).abs() < 1.0e-5);
}
fn bezier_exacta(puntos: [f32; 4], tiempo: f64) -> f64 {
    let [x1, y1, x2, y2] = puntos.map(f64::from);
    let evaluar =
        |a, b, u: f64| 3.0 * (1.0 - u).powi(2) * u * a + 3.0 * (1.0 - u) * u * u * b + u * u * u;
    let (mut inferior, mut superior) = (0.0, 1.0);
    for _ in 0..70 {
        let medio = (inferior + superior) * 0.5;
        if evaluar(x1, x2, medio) < tiempo {
            inferior = medio;
        } else {
            superior = medio;
        }
    }
    evaluar(y1, y2, (inferior + superior) * 0.5)
}
#[test]
fn muelle_contra_integracion_runge_kutta() {
    for amortiguacion in [10.0, 20.0, 35.0] {
        let cfg = json!({"muelle":{"rigidez":100,"amortiguacion":amortiguacion}});
        let curva = animacion::transicion(&cfg, Instante(0.0), 0.0, 1.0, Some(0.4));
        let (mut posicion, mut velocidad) = (0.0, 0.4);
        let paso = 0.0001;
        let aceleracion = |pos, vel| 100.0 * (1.0 - pos) - amortiguacion * vel;
        for i in 1..=10000 {
            let (p1, v1) = (velocidad, aceleracion(posicion, velocidad));
            let (p2, v2) = (
                velocidad + v1 * paso * 0.5,
                aceleracion(posicion + p1 * paso * 0.5, velocidad + v1 * paso * 0.5),
            );
            let (p3, v3) = (
                velocidad + v2 * paso * 0.5,
                aceleracion(posicion + p2 * paso * 0.5, velocidad + v2 * paso * 0.5),
            );
            let (p4, v4) = (
                velocidad + v3 * paso,
                aceleracion(posicion + p3 * paso, velocidad + v3 * paso),
            );
            posicion += paso * (p1 + 2.0 * p2 + 2.0 * p3 + p4) / 6.0;
            velocidad += paso * (v1 + 2.0 * v2 + 2.0 * v3 + v4) / 6.0;
            if i % 100 == 0 {
                let actual = animacion::muestra(&curva, Instante(f64::from(i) * paso)).0;
                assert!((f64::from(actual) - posicion).abs() < 0.005);
            }
        }
    }
}
