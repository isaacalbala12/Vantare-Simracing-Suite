# VANTA-135 · Paso 0: caracterización previa

Base: `0479c704af07df7c229a421091045cb30ca28634` (`origin/nightly`).

Siete tests de caracterización, sin cambiar producción:

- El fichero principal prevalece sobre un borrador diferente.
- Un borrador importado al arranque no tiene ruta para persistir ediciones.
- Un fichero dañado impide guardar en la ruta normal y conserva sus bytes.
- **Histórico (antes del paso 5):** guardar borrador mantiene dirty y no cambia el fichero principal.
- Un documento manual nativo no produce preparación automática ni cambia sus bytes.
- Persistir rechaza un formulario pendiente y un documento nuevo sin ruta.
- El corpus por vueltas sin deadline agota un presupuesto numérico de trabajo de forma repetible, sin cambiar la entrada.

Límites: los rechazos de Strategy no prueban el guardado completo de otros módulos de Hub; esa comprobación se hará con 7b y la coordinación de `shell.rs`. No se ha comparado el motor escalar con el extendido: el paso 8 está excluido. El paso 9 está aplazado por decisión del orquestador: `seed.rs` conserva 200 ms incluso con `deadline=None`. El test por vueltas no elimina esa deuda para carreras por duración. Además, `search.rs` deja deliberadamente exhaustivo el oráculo por vueltas sin deadline: no se espera su límite de historial en ese modo. No son pruebas físicas de GPUI.

Los resultados de gates y SHA finales se registran en el PR y en #1977.