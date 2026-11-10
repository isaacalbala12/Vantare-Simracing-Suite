import { Overlay, Caja, Texto, Lista, tokens, no, es } from '../receta/index.js';
import { m } from '../generado/relativo.js';
export default <Overlay nombre="t" modelo="relativo/1"><Caja><Lista de={m.filas} clave="id">{(titulo) => <Texto>{m.titulo}</Texto>}</Lista></Caja></Overlay>;
