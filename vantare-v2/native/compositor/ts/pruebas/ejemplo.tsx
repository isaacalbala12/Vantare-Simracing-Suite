import { Overlay, Caja, Texto, Lista, tokens, no, es } from '../receta/index.js';
import { m } from '../generado/relativo.js';

const panel = { fondo: tokens.color.panel.arriba, hueco: tokens.medida.hueco };
export default <Overlay nombre="muestra" modelo="relativo/1" visible={no(m.en_garaje)}
  entrada={{ desde: { opacidad: 0, y: -8 }, transicion: tokens.mov.aparecer }}
  salida={{ hacia: { opacidad: 0 }, transicion: tokens.mov.aparecer }}>
  <Caja estilo={panel}>
    <Lista de={m.filas} clave="id"
      entrada={{ desde: { opacidad: 0 }, transicion: tokens.mov.aparecer }}
      salida={{ hacia: { opacidad: 0 }, transicion: tokens.mov.aparecer }}
      movimiento={tokens.mov.aparecer}>
      {(fila) => <Caja capa={true} visible={no(fila.vacio)}
        estados={[{ cuando: es(fila.lado, 'jugador'), estilo: { opacidad: 1 } }]}
        bucle={{ cuando: fila.cerca, propiedad: 'opacidad', valores: [0.35, 1, 0.35], duracion: 800 }}>
        <Texto estilo={{ color: `$color.clase.${fila.clase}`, tipo: tokens.tipo.piloto }}>{`P${fila.posicion} ${fila.piloto}`}</Texto>
      </Caja>}
    </Lista>
  </Caja>
</Overlay>;
