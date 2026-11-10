import { Overlay, Caja, Texto, Lista, tokens, no, es } from '../receta/index.js';
import { m } from '../generado/relativo.js';
export default <Overlay nombre="t" modelo="relativo/1"><Caja><Lista de={m.filas} clave="id">{(fila = m.filas[0]) => <Texto>{fila.piloto}</Texto>}</Lista></Caja></Overlay>;
