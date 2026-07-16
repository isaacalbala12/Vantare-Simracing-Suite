package service

import (
	"encoding/binary"
	"math"
)

// buildSyntheticEngineerFrameBuffer construye un buffer mmap de tamaño
// ObjectOutSize con geometría conocida para tests del adapter y del servicio:
//   - player idx 0 en Position {100, 0, 200};
//   - 2 vehículos en scoring (player + oponente en X=103).
//
// No importa para widgets (no se valida aquí el JSON público); solo alimenta
// ParseEngineerFrame con valores comprobables.
func buildSyntheticEngineerFrameBuffer() []byte {
	const objectOutSize = 324820
	buf := make([]byte, objectOutSize)

	// Marcar player has vehicle, idx 0.
	buf[128466] = 1
	buf[128465] = 0

	// NumVehicles = 2.
	binary.LittleEndian.PutUint32(buf[1736:], 2)

	// Player VehicleTelemetry slot 0.
	po := 128468
	binary.LittleEndian.PutUint32(buf[po:], 11) // ID
	binary.LittleEndian.PutUint64(buf[po+160:], math.Float64bits(100))
	binary.LittleEndian.PutUint64(buf[po+168:], math.Float64bits(0))
	binary.LittleEndian.PutUint64(buf[po+176:], math.Float64bits(200))

	// VehicleScoring slot 0 (player).
	off0 := 2192
	binary.LittleEndian.PutUint32(buf[off0:], 11)
	copy(buf[off0+4:], "Player")
	buf[off0+196] = 1 // isPlayer
	binary.LittleEndian.PutUint64(buf[off0+104:], math.Float64bits(5000))
	binary.LittleEndian.PutUint64(buf[off0+264:], math.Float64bits(100))
	binary.LittleEndian.PutUint64(buf[off0+272:], math.Float64bits(0))
	binary.LittleEndian.PutUint64(buf[off0+280:], math.Float64bits(200))

	// VehicleScoring slot 1 (opponent).
	off1 := 2192 + 584
	binary.LittleEndian.PutUint32(buf[off1:], 22)
	copy(buf[off1+4:], "Opponent")
	binary.LittleEndian.PutUint64(buf[off1+104:], math.Float64bits(5050))
	binary.LittleEndian.PutUint64(buf[off1+264:], math.Float64bits(103))
	binary.LittleEndian.PutUint64(buf[off1+272:], math.Float64bits(0))
	binary.LittleEndian.PutUint64(buf[off1+280:], math.Float64bits(200))

	return buf
}
