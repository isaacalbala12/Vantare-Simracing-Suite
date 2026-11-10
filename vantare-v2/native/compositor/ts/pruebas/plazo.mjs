export async function conPlazo(promesa, ms, alAgotar = () => {}) {
  let temporizador;
  try {
    return await Promise.race([
      promesa,
      new Promise((_, reject) => { temporizador = setTimeout(() => { alAgotar(); reject(new Error('Plazo agotado esperando el CLI')); }, ms); }),
    ]);
  } finally { clearTimeout(temporizador); }
}
