package lmu

// DecodeWheels decodes 4 wheel structs from the LMU telemetry buffer.
//
// telemetryBaseOffset is the base offset of the player's vehicle telemetry
// block within the mmap buffer (typically telemetryTelemOffset + playerIdx *
// telemetryTelemStride).
//
// Returns [4]WheelData with Kelvin fields converted to Celsius. Default-zero
// values are returned for out-of-range reads (no panic).
func DecodeWheels(buf []byte, telemetryBaseOffset int) [4]WheelData {
	var wheels [4]WheelData
	for i := 0; i < 4; i++ {
		wheelBase := telemetryBaseOffset + WheelArrayBaseOffset + i*WheelStride
		wheels[i] = WheelData{
			BrakeTemp:   kelvinToCelsius(readFloat64(buf, wheelBase+WheelBrakeTemp)),
			TempLeft:    kelvinToCelsius(readFloat64(buf, wheelBase+WheelTempL)),
			TempCenter:  kelvinToCelsius(readFloat64(buf, wheelBase+WheelTempC)),
			TempRight:   kelvinToCelsius(readFloat64(buf, wheelBase+WheelTempR)),
			Pressure:    readFloat64(buf, wheelBase+WheelPressure),
			Wear:        readFloat64(buf, wheelBase+WheelWear),
			GripFract:   readFloat64(buf, wheelBase+WheelGripFract),
			SurfaceType: readByte(buf, wheelBase+WheelSurfaceType),
			Flat:        readByte(buf, wheelBase+WheelFlat) != 0,
			Detached:    readByte(buf, wheelBase+WheelDetached) != 0,
		}
	}
	return wheels
}
