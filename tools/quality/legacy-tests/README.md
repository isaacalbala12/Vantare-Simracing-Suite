# Pruebas históricas Go/React

La retirada #1533 conserva este contrato como historia. Requiere los analizadores
y el checkout Wails anterior; no es un gate del workspace Rust. Los tests puros
de identidad/ratchet siguen en `../tests/test_ratchet.py`; los de retirada y
workflows comprueban el contrato nativo vigente. No se aceptan baselines nuevos.
