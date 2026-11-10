//! Ejecutor de un programa compilado. El único JSON leído en carrera es el modelo.
pub mod animacion;
pub mod capas;
mod maquetacion;
mod pintura;
use crate::receta::{
    Diagnostico, Programa, Sistema, Transicion,
    programa::{PROPIEDADES, REPOSO, indice_propiedad},
};
use capas::{CapaId, Curva, Fuente, Instante, Lote, Operacion, Propiedad};
use maquetacion::{Clave, Plano};
use serde_json::Value;
use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

pub trait Medidor {
    fn medir(&self, texto: &str, fuente: &Fuente) -> (f32, f32);
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CausaModelo {
    Enlace,
    Identidad,
    Limite,
    Maquetacion,
    Instante,
    Diseno,
    Animacion,
    Jerarquia,
    Capa,
}
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ErrorModelo {
    pub puntero: String,
    pub causa: CausaModelo,
    pub detalle: String,
}
impl ErrorModelo {
    fn nueva(p: &str, causa: CausaModelo, detalle: &str) -> Self {
        Self {
            puntero: p.into(),
            causa,
            detalle: detalle.into(),
        }
    }
    pub(crate) fn enlace(p: &str) -> Self {
        Self::nueva(
            p,
            CausaModelo::Enlace,
            "Corrige el modelo según el campo y tipo declarados en el contrato; los números están acotados a ±1000000.",
        )
    }
    pub(crate) fn identidad(p: &str) -> Self {
        Self::nueva(
            p,
            CausaModelo::Identidad,
            "Usa una clave escalar única por elemento de lista.",
        )
    }
    pub(crate) fn limite(p: &str) -> Self {
        Self::nueva(
            p,
            CausaModelo::Limite,
            "Reduce el modelo: 64 elementos por lista, 256 capas y 4096 nodos expandidos.",
        )
    }
    pub(crate) fn layout(p: &str) -> Self {
        Self::nueva(
            p,
            CausaModelo::Maquetacion,
            "Revisa tamaños y medición: deben ser finitos y estar entre 0 y 1000000.",
        )
    }
    fn animacion(p: &str, e: animacion::ErrorAnimacion) -> Self {
        Self::nueva(p, CausaModelo::Animacion, &e.to_string())
    }
    fn diseno(errores: &[Diagnostico]) -> Self {
        let puntero = errores.first().map_or("", |e| e.puntero.as_str());
        Self::nueva(
            puntero,
            CausaModelo::Diseno,
            &errores
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("\n"),
        )
    }
}
impl std::fmt::Display for ErrorModelo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {:?}: {}", self.puntero, self.causa, self.detalle)
    }
}
impl std::error::Error for ErrorModelo {}
fn instante(ahora: Instante) -> Result<(), ErrorModelo> {
    if ahora.0.is_finite() && ahora.0.abs() <= 1.0e12 {
        Ok(())
    } else {
        Err(ErrorModelo::nueva(
            "/ahora",
            CausaModelo::Instante,
            "Usa un instante finito y representable del reloj del compositor (±1e12 segundos).",
        ))
    }
}
#[derive(Clone)]
struct Viva {
    id: CapaId,
    padre: Option<CapaId>,
    plano: Plano,
    curvas: [Option<Curva>; 5],
    pintada: Option<pintura::TransicionPintada>,
}
impl Viva {
    fn muestra(&self, i: usize, t: Instante) -> (f32, f32) {
        match &self.curvas[i] {
            Some(c) => animacion::muestra(c, t),
            None => (self.plano.valores[i], 0.0),
        }
    }
    fn animar(
        &mut self,
        i: usize,
        config: &Transicion,
        ahora: Instante,
        extremos: (f32, f32),
        velocidad: Option<f32>,
        lote: &mut Lote,
    ) -> Result<(), ErrorModelo> {
        let (desde, hasta) = extremos;
        let curva = animacion::transicion(config, ahora, desde, hasta, velocidad)
            .map_err(|e| ErrorModelo::animacion(&self.plano.puntero, e))?;
        self.curva(i, curva, lote);
        Ok(())
    }
    fn curva(&mut self, i: usize, curva: Curva, lote: &mut Lote) {
        self.curvas[i] = Some(curva.clone());
        lote.operaciones.push(Operacion::Animar {
            id: self.id,
            propiedad: PROPIEDADES[i],
            curva,
        });
    }
    fn activa(&self, i: usize, t: Instante) -> bool {
        self.curvas[i]
            .as_ref()
            .is_some_and(|c| c.repetir.is_some() || t.0 < c.inicio.0 + c.fin)
    }
}
#[derive(Clone)]
struct Fantasma {
    vivas: Vec<Viva>,
    raiz: CapaId,
    fin: Instante,
    recuperable: bool,
}
#[derive(Clone)]
pub struct Escena {
    programa: Programa,
    modelo: Option<Arc<Value>>,
    vivas: BTreeMap<Clave, Viva>,
    fantasmas: Vec<Fantasma>,
    siguiente: u32,
    ultimo: Instante,
    ordenes: BTreeMap<Option<CapaId>, Vec<CapaId>>,
}
impl Escena {
    /// Solo acepta programas opacos producidos por `receta::cargar`.
    pub fn nueva(programa: Programa) -> Self {
        Self {
            programa,
            modelo: None,
            vivas: BTreeMap::new(),
            fantasmas: Vec::new(),
            siguiente: 1,
            ultimo: Instante(0.0),
            ordenes: BTreeMap::new(),
        }
    }
    pub fn actualizar(
        &mut self,
        modelo: &Value,
        ahora: Instante,
        medidor: &dyn Medidor,
    ) -> Result<Lote, ErrorModelo> {
        instante(ahora)?;
        if self.modelo.as_deref() == Some(modelo) {
            return self.avanzar(ahora);
        }
        let planos = maquetacion::maquetar(&self.programa, modelo, medidor)?;
        // La copia transaccional comparte programa, modelo y dibujos mediante referencias contadas.
        let mut siguiente = self.clone();
        let mut lote = Lote::default();
        siguiente.purgar(ahora, &mut lote);
        let nuevas = planos
            .iter()
            .filter(|p| {
                !siguiente.vivas.contains_key(&p.clave)
                    && !siguiente
                        .fantasmas
                        .iter()
                        .any(|f| f.recuperable && f.vivas.iter().any(|v| v.plano.clave == p.clave))
            })
            .count();
        siguiente.limite(nuevas)?;
        siguiente.aplicar(planos, ahora, &mut lote)?;
        siguiente.pintar(ahora, &mut lote)?;
        siguiente.ultimo = ahora;
        siguiente.modelo = Some(Arc::new(modelo.clone()));
        *self = siguiente;
        Ok(lote)
    }
    fn limite(&self, nuevas: usize) -> Result<(), ErrorModelo> {
        let existentes =
            self.vivas.len() + self.fantasmas.iter().map(|f| f.vivas.len()).sum::<usize>();
        if existentes + nuevas > 256
            || u32::try_from(nuevas)
                .ok()
                .and_then(|n| self.siguiente.checked_add(n))
                .is_none()
        {
            Err(ErrorModelo::limite("/capas"))
        } else {
            Ok(())
        }
    }
    fn aplicar(
        &mut self,
        planos: Vec<Plano>,
        ahora: Instante,
        lote: &mut Lote,
    ) -> Result<(), ErrorModelo> {
        let mut anteriores = std::mem::take(&mut self.vivas);
        self.recuperar(&planos, &mut anteriores)?;
        let mut deseadas = BTreeMap::<Option<CapaId>, Vec<CapaId>>::new();
        for plano in planos {
            let clave = plano.clave.clone();
            let viva = if let Some(v) = anteriores.remove(&clave) {
                Self::modificar(v, plano, ahora, lote)?
            } else {
                self.crear(plano, ahora, lote)?
            };
            deseadas.entry(viva.padre).or_default().push(viva.id);
            self.vivas.insert(clave, viva);
        }
        self.retirar(anteriores.into_values().collect(), ahora, lote)?;
        self.ordenar(&deseadas, lote);
        Ok(())
    }
    fn crear(
        &mut self,
        plano: Plano,
        ahora: Instante,
        lote: &mut Lote,
    ) -> Result<Viva, ErrorModelo> {
        let padre = match &plano.padre {
            None => None,
            Some(p) => Some(
                self.vivas
                    .get(p)
                    .ok_or_else(|| {
                        ErrorModelo::nueva(
                            &plano.puntero,
                            CausaModelo::Jerarquia,
                            "Falta la capa padre del programa compilado.",
                        )
                    })?
                    .id,
            ),
        };
        let hermanas = self.ordenes.entry(padre).or_default();
        let orden =
            u32::try_from(hermanas.len()).map_err(|_| ErrorModelo::limite(&plano.puntero))?;
        let id = CapaId(self.siguiente);
        self.siguiente = self
            .siguiente
            .checked_add(1)
            .ok_or_else(|| ErrorModelo::limite("/capas"))?;
        hermanas.push(id);
        lote.operaciones.push(Operacion::Crear { id, padre, orden });
        lote.operaciones.push(Operacion::Colocar {
            id,
            rect: plano.rect,
        });
        if !plano.dibujos.is_empty() {
            lote.operaciones.push(Operacion::Pintar {
                id,
                dibujos: plano.dibujos.to_vec(),
            });
        }
        let mut viva = Viva {
            id,
            padre,
            plano,
            curvas: std::array::from_fn(|_| None),
            pintada: None,
        };
        for (i, defecto) in REPOSO.iter().enumerate() {
            if viva.plano.valores[i].partial_cmp(defecto) != Some(std::cmp::Ordering::Equal) {
                lote.operaciones.push(Operacion::Fijar {
                    id,
                    propiedad: PROPIEDADES[i],
                    valor: viva.plano.valores[i],
                });
            }
        }
        if viva.plano.visible
            && let Some(a) = viva.plano.entrada.clone()
        {
            for (i, desde) in a.valores.iter().enumerate() {
                if let Some(desde) = desde {
                    let hasta = viva.plano.valores[i];
                    viva.animar(i, &a.transicion, ahora, (*desde, hasta), None, lote)?;
                }
            }
        }
        if let Some(b) = viva.plano.bucle.clone() {
            let (actual, velocidad) = viva.muestra(b.propiedad, ahora);
            let curva = animacion::bucle_desde(&b.valores, b.duracion, ahora, actual, velocidad)
                .map_err(|e| ErrorModelo::animacion(&viva.plano.puntero, e))?;
            viva.curva(b.propiedad, curva, lote);
        }
        Ok(viva)
    }
    fn modificar(
        mut viva: Viva,
        plano: Plano,
        ahora: Instante,
        lote: &mut Lote,
    ) -> Result<Viva, ErrorModelo> {
        let movimiento = viva.plano.rect.y.partial_cmp(&plano.rect.y)
            != Some(std::cmp::Ordering::Equal)
            && plano.movimiento.is_some();
        if viva.plano.rect != plano.rect {
            lote.operaciones.push(Operacion::Colocar {
                id: viva.id,
                rect: plano.rect,
            });
        }
        if movimiento && let Some(t) = &plano.movimiento {
            let (actual, velocidad) = viva.muestra(2, ahora);
            let desde = actual + viva.plano.rect.y - plano.rect.y;
            viva.animar(
                2,
                t,
                ahora,
                (desde, plano.valores[2]),
                Some(velocidad),
                lote,
            )?;
        }
        if viva.plano.dibujos != plano.dibujos {
            viva.pintada = pintura::TransicionPintada::nueva(
                &viva.plano,
                &plano,
                ahora,
                viva.pintada.as_ref(),
            )
            .map_err(|e| ErrorModelo::animacion(&plano.puntero, e))?;
            if viva.pintada.is_none() {
                lote.operaciones.push(Operacion::Pintar {
                    id: viva.id,
                    dibujos: plano.dibujos.to_vec(),
                });
            }
        }
        Self::propiedades(&mut viva, &plano, ahora, movimiento, lote)?;
        viva.plano = plano;
        Ok(viva)
    }
    fn visibilidad(
        viva: &mut Viva,
        plano: &Plano,
        ahora: Instante,
        lote: &mut Lote,
    ) -> Result<[bool; 5], ErrorModelo> {
        let mut tocadas = [false; 5];
        if viva.plano.visible == plano.visible {
            return Ok(tocadas);
        }
        let entrada = plano.entrada.as_deref();
        let salida = plano.salida.as_deref();
        let aparicion = if plano.visible { entrada } else { salida };
        for (i, tocada) in tocadas.iter_mut().enumerate() {
            let por_salida = salida.is_some_and(|a| a.valores[i].is_some());
            let por_entrada = entrada.is_some_and(|a| a.valores[i].is_some());
            if i != 0 && !por_salida && (!plano.visible || !por_entrada) {
                continue;
            }
            let config = aparicion.map_or(Transicion::PREDETERMINADA, |a| a.transicion);
            let (actual, velocidad) = viva.muestra(i, ahora);
            let destino = if plano.visible {
                plano.valores[i]
            } else {
                salida
                    .and_then(|a| a.valores[i])
                    .map_or(plano.valores[i], |v| v)
            };
            let desde = if plano.visible && !por_salida && !viva.activa(i, ahora) {
                entrada.and_then(|a| a.valores[i]).map_or(actual, |v| v)
            } else {
                actual
            };
            viva.animar(i, &config, ahora, (desde, destino), Some(velocidad), lote)?;
            *tocada = true;
        }
        Ok(tocadas)
    }
    fn propiedades(
        viva: &mut Viva,
        plano: &Plano,
        ahora: Instante,
        movimiento: bool,
        lote: &mut Lote,
    ) -> Result<(), ErrorModelo> {
        let tocadas = Self::visibilidad(viva, plano, ahora, lote)?;
        for (i, tocada) in tocadas.iter().enumerate() {
            if *tocada || (i == 2 && movimiento) {
                continue;
            }
            let antes = viva.plano.bucle.as_ref().filter(|b| b.propiedad == i);
            let despues = plano.bucle.as_ref().filter(|b| b.propiedad == i);
            let cambio = antes != despues;
            if viva.plano.valores[i].partial_cmp(&plano.valores[i])
                == Some(std::cmp::Ordering::Equal)
                && !cambio
            {
                continue;
            }
            let (actual, velocidad) = viva.muestra(i, ahora);
            if let Some(b) = despues {
                let curva =
                    animacion::bucle_desde(&b.valores, b.duracion, ahora, actual, velocidad)
                        .map_err(|e| ErrorModelo::animacion(&plano.puntero, e))?;
                viva.curva(i, curva, lote);
            } else if let Some(t) =
                plano.transiciones.compuestas[i].or(if cambio || viva.activa(i, ahora) {
                    Some(Transicion::PREDETERMINADA)
                } else {
                    None
                })
            {
                viva.animar(
                    i,
                    &t,
                    ahora,
                    (actual, plano.valores[i]),
                    Some(velocidad),
                    lote,
                )?;
            } else {
                viva.curvas[i] = None;
                lote.operaciones.push(Operacion::Fijar {
                    id: viva.id,
                    propiedad: PROPIEDADES[i],
                    valor: plano.valores[i],
                });
            }
        }
        Ok(())
    }
    fn recuperar(
        &mut self,
        planos: &[Plano],
        anteriores: &mut BTreeMap<Clave, Viva>,
    ) -> Result<(), ErrorModelo> {
        let mut padres = anteriores.values().map(|v| v.id).collect::<BTreeSet<_>>();
        for grupo in std::mem::take(&mut self.fantasmas) {
            if !grupo.recuperable {
                self.fantasmas.push(grupo);
                continue;
            }
            let mut resto = Vec::new();
            for mut viva in grupo.vivas {
                if planos.iter().any(|p| p.clave == viva.plano.clave)
                    && viva.padre.is_none_or(|p| padres.contains(&p))
                {
                    viva.plano.visible = false;
                    for (i, c) in viva.curvas.iter().enumerate() {
                        if let Some(c) = c {
                            viva.plano.valores[i] = c.final_;
                        }
                    }
                    padres.insert(viva.id);
                    anteriores.insert(viva.plano.clave.clone(), viva);
                } else {
                    resto.push(viva);
                }
            }
            for mut nuevo in agrupar(resto, grupo.fin, true)? {
                nuevo.fin = grupo.fin;
                self.fantasmas.push(nuevo);
            }
        }
        Ok(())
    }
    fn retirar(
        &mut self,
        vivas: Vec<Viva>,
        ahora: Instante,
        lote: &mut Lote,
    ) -> Result<(), ErrorModelo> {
        for mut grupo in agrupar(vivas, ahora, true)? {
            for viva in &mut grupo.vivas {
                if let Some(salida) = viva.plano.salida.clone() {
                    for (i, hasta) in salida.valores.iter().enumerate() {
                        if let Some(hasta) = hasta {
                            let (desde, velocidad) = viva.muestra(i, ahora);
                            viva.animar(
                                i,
                                &salida.transicion,
                                ahora,
                                (desde, *hasta),
                                Some(velocidad),
                                lote,
                            )?;
                            if let Some(c) = &viva.curvas[i] {
                                grupo.fin.0 = grupo.fin.0.max(ahora.0 + c.fin);
                            }
                        }
                    }
                }
            }
            if grupo.fin > ahora {
                self.fantasmas.push(grupo);
            } else {
                self.destruir(&grupo, lote);
            }
        }
        Ok(())
    }
    fn destruir(&mut self, grupo: &Fantasma, lote: &mut Lote) {
        lote.operaciones.push(Operacion::Quitar { id: grupo.raiz });
        let ids = grupo.vivas.iter().map(|v| v.id).collect::<BTreeSet<_>>();
        self.ordenes.retain(|p, hijos| {
            if p.is_some_and(|p| ids.contains(&p)) {
                return false;
            }
            hijos.retain(|id| !ids.contains(id));
            !hijos.is_empty()
        });
    }
    fn purgar(&mut self, ahora: Instante, lote: &mut Lote) {
        for grupo in std::mem::take(&mut self.fantasmas) {
            if grupo.fin <= ahora {
                self.destruir(&grupo, lote);
            } else {
                self.fantasmas.push(grupo);
            }
        }
    }
    fn pintar(&mut self, ahora: Instante, lote: &mut Lote) -> Result<(), ErrorModelo> {
        for viva in self.vivas.values_mut() {
            if let Some(p) = &viva.pintada {
                let dibujos = p
                    .dibujos(ahora)
                    .map_err(|e| ErrorModelo::animacion(&viva.plano.puntero, e))?;
                lote.operaciones.push(Operacion::Pintar {
                    id: viva.id,
                    dibujos,
                });
                if p.fin() <= ahora {
                    viva.pintada = None;
                }
            }
        }
        Ok(())
    }
    pub fn avanzar(&mut self, ahora: Instante) -> Result<Lote, ErrorModelo> {
        instante(ahora)?;
        let mut siguiente = self.clone();
        let mut lote = Lote::default();
        siguiente.purgar(ahora, &mut lote);
        siguiente.pintar(ahora, &mut lote)?;
        siguiente.ultimo = ahora;
        *self = siguiente;
        Ok(lote)
    }
    /// El anfitrión sincroniza este trabajo con SU siguiente fotograma; no hay frecuencia fija.
    pub fn proximo_fotograma(&self) -> Option<Instante> {
        if self.vivas.values().any(|v| v.pintada.is_some()) {
            Some(self.ultimo)
        } else {
            self.fantasmas
                .iter()
                .map(|f| f.fin)
                .min_by(|a, b| a.0.total_cmp(&b.0))
        }
    }
    pub fn cambiar_receta(
        &mut self,
        programa: Programa,
        ahora: Instante,
        medidor: &dyn Medidor,
    ) -> Result<Lote, ErrorModelo> {
        instante(ahora)?;
        let programa = self
            .programa
            .con_receta(programa)
            .map_err(|e| ErrorModelo::diseno(&e))?;
        self.cambiar(programa, ahora, medidor)
    }
    pub fn cambiar_sistema(
        &mut self,
        sistema: Sistema,
        ahora: Instante,
        medidor: &dyn Medidor,
    ) -> Result<Lote, ErrorModelo> {
        instante(ahora)?;
        let programa = self
            .programa
            .con_sistema(sistema)
            .map_err(|e| ErrorModelo::diseno(&e))?;
        self.cambiar(programa, ahora, medidor)
    }
    fn cambiar(
        &mut self,
        programa: Programa,
        ahora: Instante,
        medidor: &dyn Medidor,
    ) -> Result<Lote, ErrorModelo> {
        let Some(modelo) = &self.modelo else {
            self.programa = programa;
            self.ultimo = ahora;
            return Ok(Lote::default());
        };
        let planos = maquetacion::maquetar(&programa, modelo, medidor)?;
        let mut siguiente = self.clone();
        let mut lote = Lote::default();
        siguiente.purgar(ahora, &mut lote);
        siguiente.limite(planos.len())?;
        siguiente.programa = programa;
        siguiente.fundir(planos, ahora, &mut lote)?;
        siguiente.pintar(ahora, &mut lote)?;
        siguiente.ultimo = ahora;
        *self = siguiente;
        Ok(lote)
    }
    fn fundir(
        &mut self,
        planos: Vec<Plano>,
        ahora: Instante,
        lote: &mut Lote,
    ) -> Result<(), ErrorModelo> {
        let mut anteriores = std::mem::take(&mut self.vivas)
            .into_values()
            .collect::<Vec<_>>();
        for grupo in std::mem::take(&mut self.fantasmas) {
            anteriores.extend(grupo.vivas);
        }
        for mut grupo in agrupar(anteriores, ahora, false)? {
            let raiz = grupo.vivas.first_mut().ok_or_else(|| {
                ErrorModelo::nueva("/raiz", CausaModelo::Jerarquia, "Grupo fantasma sin raíz.")
            })?;
            let (desde, velocidad) = raiz.muestra(0, ahora);
            raiz.animar(
                0,
                &self.programa.datos.cambio_sistema,
                ahora,
                (desde, 0.0),
                Some(velocidad),
                lote,
            )?;
            grupo.fin = match &raiz.curvas[0] {
                Some(c) => Instante(ahora.0 + c.fin),
                None => {
                    return Err(ErrorModelo::nueva(
                        "/raiz",
                        CausaModelo::Jerarquia,
                        "Fundido sin curva de raíz.",
                    ));
                }
            };
            self.fantasmas.push(grupo);
        }
        self.aplicar(planos, ahora, lote)?;
        for viva in self.vivas.values_mut().filter(|v| v.padre.is_none()) {
            viva.animar(
                0,
                &self.programa.datos.cambio_sistema,
                ahora,
                (0.0, viva.plano.valores[0]),
                None,
                lote,
            )?;
        }
        Ok(())
    }
    fn ordenar(&mut self, deseadas: &BTreeMap<Option<CapaId>, Vec<CapaId>>, lote: &mut Lote) {
        let fantasmas = self
            .fantasmas
            .iter()
            .flat_map(|f| f.vivas.iter().map(|v| v.id))
            .collect::<BTreeSet<_>>();
        for (padre, actuales) in &mut self.ordenes {
            let vivas = deseadas.get(padre).map_or(&[][..], Vec::as_slice);
            let mut iterador = vivas.iter();
            let mut orden = Vec::new();
            for id in actuales.iter() {
                if fantasmas.contains(id) {
                    orden.push(*id);
                } else if let Some(nuevo) = iterador.next() {
                    orden.push(*nuevo);
                }
            }
            orden.extend(iterador.copied());
            if *actuales != orden {
                lote.operaciones.push(Operacion::Ordenar {
                    padre: *padre,
                    hijos: orden.clone(),
                });
                *actuales = orden;
            }
        }
    }
    pub fn valor(
        &self,
        capa: CapaId,
        propiedad: Propiedad,
        ahora: Instante,
    ) -> Result<f32, ErrorModelo> {
        instante(ahora)?;
        let viva = self
            .vivas
            .values()
            .chain(self.fantasmas.iter().flat_map(|f| f.vivas.iter()))
            .find(|v| v.id == capa)
            .ok_or_else(|| {
                ErrorModelo::nueva("/capas", CausaModelo::Capa, "La capa ya no existe.")
            })?;
        Ok(viva.muestra(indice_propiedad(propiedad), ahora).0)
    }
}
fn agrupar(
    vivas: Vec<Viva>,
    fin: Instante,
    recuperable: bool,
) -> Result<Vec<Fantasma>, ErrorModelo> {
    let mut por_id = vivas
        .into_iter()
        .map(|v| (v.id, v))
        .collect::<BTreeMap<_, _>>();
    let raices = por_id
        .values()
        .filter(|v| v.padre.is_none_or(|p| !por_id.contains_key(&p)))
        .map(|v| v.id)
        .collect::<Vec<_>>();
    let mut grupos = Vec::new();
    for raiz in raices {
        let mut pendientes = vec![raiz];
        let mut vivas = Vec::new();
        while let Some(id) = pendientes.pop() {
            let viva = por_id.remove(&id).ok_or_else(|| {
                ErrorModelo::nueva(
                    "/capas",
                    CausaModelo::Jerarquia,
                    "Capa duplicada al formar un árbol.",
                )
            })?;
            let hijos = por_id
                .values()
                .filter(|v| v.padre == Some(id))
                .map(|v| v.id)
                .collect::<Vec<_>>();
            pendientes.extend(hijos.into_iter().rev());
            vivas.push(viva);
        }
        grupos.push(Fantasma {
            vivas,
            raiz,
            fin,
            recuperable,
        });
    }
    if !por_id.is_empty() {
        return Err(ErrorModelo::nueva(
            "/capas",
            CausaModelo::Jerarquia,
            "La jerarquía contiene un ciclo.",
        ));
    }
    Ok(grupos)
}
