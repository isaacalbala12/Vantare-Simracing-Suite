import { Overlay, Caja, Texto, Lista, tokens, no, es } from '../receta/index.js';
import { m } from '../generado/relativo.js';
export default <Overlay nombre="t" modelo="relativo/1"><Caja>
{/* @ts-expect-error */}
<Texto estilo={{color: "#ff0000"}}>hola</Texto></Caja></Overlay>;
