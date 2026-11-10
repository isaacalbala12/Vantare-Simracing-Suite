import { Overlay, Caja, Texto, Lista, tokens, no, es } from '../receta/index.js';
import { m } from '../generado/relativo.js';
export default <Overlay nombre="t" modelo="relativo/1"><Caja><Texto estilo={{color: "#fff"}}>{m.no_existe}</Texto>{m.en_garaje ? <Caja/> : <Caja/>}</Caja></Overlay>;
