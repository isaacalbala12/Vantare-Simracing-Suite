1. Kit privado Windows x64: extrae el ZIP actual en una carpeta nueva; no instalar ni compilar. LMU lo abre Isaac.
2. Isaac: misma práctica, pista y Hypercar; combustible para 15 min. Cierra otros lectores REST/overlays antes de medir.
3. Worker, desde la carpeta extraída por SSH: powershell -NoProfile -ExecutionPolicy Bypass -File .\Iniciar-AB.ps1
4. Si no encuentra el juego, añade -GameExe "ruta\Le Mans Ultimate.exe"; -InteractiveUser DOMINIO\isaac si hace falta.
5. Espera SHM y jugador rodando (máximo 3 min); no abre LMU, no cambia foco ni crea ventanas visibles.
6. Conduce 13 min sin pausas ni cambios de sesión: C0 60 s solo SHM; A1/B2/A3/B4 180 s cada uno (A=6 min, B=6 min).
7. A: standings+sessionInfo como el adapter; B añade race/car cada 2 s. PresentMon mide frametime durante todo el protocolo.
8. Estado en resultados\fecha\run.json; debe pasar waiting_for_driving → recording → complete. La tarea efímera se elimina sola.
9. Para cancelar: powershell -NoProfile -ExecutionPolicy Bypass -File Detener-AB.ps1 -Run "carpeta resultados". No cierra LMU.
10. Copia la carpeta completa al servidor; allí ejecuta Verificar-AB.ps1 -Run "ruta" -Output "carpeta nueva" [-Widgets]. Datos privados con nombres/IA/paths; no publicar.
