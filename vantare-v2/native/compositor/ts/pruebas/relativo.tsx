import { Overlay, Caja, Texto, Lista, no } from '../receta/index.js';
import { m } from '../generado/relativo.js';

export default <Overlay nombre={"relativo"} modelo={"relativo/1"} visible={no(m.en_garaje)} entrada={{ "desde": { "opacidad": 0, "y": -8 }, "transicion": "$mov.aparecer" }} salida={{ "hacia": { "opacidad": 0, "y": -8 }, "transicion": "$mov.desaparecer" }}>
  <Caja id={"panel"} estilo={{ "ancho": "$relativo.ancho", "direccion": "columna", "relleno": ["$relativo.arriba", 0, "$relativo.abajo", 0], "fondo": { "lineal": { "angulo": 180, "paradas": [["$color.panel.arriba", 0], ["$color.panel.abajo", 1]] } }, "borde": { "ancho": "$medida.linea", "color": "$color.panel.borde" }, "radio": "$medida.radio_panel", "sombra": "$efecto.panel" }}>
    <Caja id={"cabecera"} estilo={{ "direccion": "fila", "justificar": "entre", "alinear": "centro", "alto": "$medida.cabecera", "relleno": [0, "$medida.margen"] }}>
      <Texto id={"titulo"} estilo={{ "tipo": "$tipo.cabecera", "color": "$color.apagado" }}>{`${m.titulo}`}</Texto>
      <Texto id={"contexto"} estilo={{ "tipo": "$tipo.cabecera", "color": "$color.apagado" }}>{`${m.contexto}`}</Texto>
    </Caja>
    <Caja id={"separacion"} estilo={{ "alto": "$relativo.bajo_cabecera" }} />
    <Lista id={"filas"} de={m.filas} clave={"id"} movimiento={"$mov.desliza"} entrada={{ "desde": { "opacidad": 0 }, "transicion": "$mov.fila_entra" }} salida={{ "hacia": { "opacidad": 0 }, "transicion": "$mov.fila_sale" }}>
      {(fila) => (
        <Caja id={"fila"} estilo={{ "direccion": "fila", "alinear": "centro", "alto": "$medida.fila", "hueco": "$medida.hueco", "relleno": [0, "$medida.margen"] }}>
          <Caja id={"resalte_jugador"} visible={fila.jugador} estilo={{ "posicion": "absoluta", "izquierda": "$relativo.sangria", "arriba": 0, "ancho": "$relativo.ancho_resalte", "alto": "$medida.fila", "radio": "$medida.radio_fila", "fondo": { "lineal": { "angulo": 90, "paradas": [["$color.acento_fuerte", 0], ["$color.acento_suave", 1]] } } }} />
          <Caja id={"resalte_cerca"} capa={true} estilo={{ "posicion": "absoluta", "izquierda": "$relativo.sangria", "arriba": 0, "ancho": "$relativo.ancho_resalte", "alto": "$medida.fila", "radio": "$medida.radio_fila", "fondo": "$color.cerca_fondo", "borde": { "ancho": "$medida.linea", "color": "$color.cerca" }, "opacidad": 0 }} transiciones={{ "opacidad": "$mov.resalte" }} estados={[{ "cuando": fila.cerca, "bucle": { "propiedad": "opacidad", "valores": [1, 0.35, 1], "duracion": 1200 } }]} />
          <Caja id={"punto"} estilo={{ "ancho": "$medida.punto", "alto": "$medida.punto", "radio": "$medida.radio_punto", "fondo": `$color.clase.${fila.clase}` }} estados={[{ "cuando": fila.vacio, "estilo": { "opacidad": 0 } }]} />
          <Texto id={"posicion"} estilo={{ "ancho": "$relativo.col_posicion", "tipo": "$tipo.posicion", "color": "$color.apagado", "alinear_texto": "fin" }}>{`${fila.posicion}`}</Texto>
          <Caja id={"nombre"} estilo={{ "ancho": "$relativo.col_piloto", "direccion": "fila", "alinear": "centro" }}>
            <Texto id={"piloto"} estilo={{ "tipo": "$tipo.piloto", "color": "$color.texto", "encoger": 0 }}>{`${fila.piloto}`}</Texto>
            <Texto id={"detalle"} estilo={{ "tipo": "$tipo.detalle", "color": "$color.apagado", "encoger": 1 }}>{`${fila.detalle}`}</Texto>
          </Caja>
          <Caja id={"vueltas"} estilo={{ "ancho": "$relativo.col_vueltas", "alinear": "centro" }}>
            <Texto id={"pildora"} visible={fila.vueltas_visible} estilo={{ "alto": "$medida.pildora", "relleno": [0, "$medida.radio_pildora"], "radio": "$medida.radio_pildora", "tipo": "$tipo.pildora", "fondo": `$color.vueltas.${fila.vueltas_tipo}_fondo`, "color": `$color.vueltas.${fila.vueltas_tipo}_texto` }}>{`${fila.vueltas}`}</Texto>
          </Caja>
          <Texto id={"gap"} estilo={{ "ancho": "$relativo.col_gap", "tipo": "$tipo.gap", "color": "$color.gap", "alinear_texto": "fin" }} estados={[{ "cuando": fila.jugador, "estilo": { "color": "$color.texto" } }]}>{`${fila.gap}`}</Texto>
        </Caja>
      )}
    </Lista>
    <Caja id={"pie"} visible={m.pie_visible} estilo={{ "direccion": "columna", "relleno": [0, "$medida.margen"] }}>
      <Caja id={"linea"} estilo={{ "alto": "$medida.linea", "fondo": "$color.linea" }} />
      <Caja id={"textos"} estilo={{ "direccion": "fila", "justificar": "entre", "alinear": "centro", "alto": "$medida.fila" }}>
        <Texto id={"izquierda"} estilo={{ "tipo": "$tipo.pie", "color": "$color.apagado" }}>{`${m.pie_trafico}${m.pie_salida}${m.pie_sesion}`}</Texto>
        <Texto id={"derecha"} estilo={{ "tipo": "$tipo.pie", "color": "$color.apagado" }}>{`${m.pie_perdida}`}</Texto>
      </Caja>
    </Caja>
  </Caja>
</Overlay>;
