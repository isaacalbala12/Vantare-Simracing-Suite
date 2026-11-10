import { Overlay, Caja, Texto, Lista, tokens, no, es } from '../receta/index.js';
import { m } from '../generado/relativo.js';
export default <Overlay nombre="t" modelo="relativo/1"><Caja><Texto>{`a${`b${m.titulo}`}`}</Texto></Caja></Overlay>;
