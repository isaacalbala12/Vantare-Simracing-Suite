package telemetrytransport

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
)

func TestBuildMergePatchRoundTrips(t *testing.T) {
	for name, testCase := range map[string]struct{ previous, next string }{
		"scalar changed": {`{"a":1,"b":2}`, `{"a":9,"b":2}`},
		"nested changed": {`{"a":{"x":1,"y":2}}`, `{"a":{"x":1,"y":3}}`},
		"key added":      {`{"a":1}`, `{"a":1,"b":2}`},
		"key removed":    {`{"a":1,"b":2}`, `{"a":1}`},
		"array changed":  {`{"a":[1,2,3]}`, `{"a":[1,2,4]}`},
		"unchanged":      {`{"a":1,"b":{"c":2}}`, `{"a":1,"b":{"c":2}}`},
	} {
		t.Run(name, func(t *testing.T) {
			patch, err := BuildMergePatch(json.RawMessage(testCase.previous), json.RawMessage(testCase.next))
			if err != nil {
				t.Fatal(err)
			}
			rebuilt, err := ApplyMergePatch(json.RawMessage(testCase.previous), patch)
			if err != nil {
				t.Fatal(err)
			}
			if !semanticJSONEqual(rebuilt, json.RawMessage(testCase.next)) {
				t.Fatalf("patch %s rebuilt %s, want %s", patch, rebuilt, testCase.next)
			}
		})
	}
}

// RFC 7396 spends null on "remove this key", so a patch cannot ask for a key
// whose value is null. The Overlay contract never emits one — absence travels
// as present:false with a zero value, and arrays are always allocated — but the
// limitation belongs in a test rather than in someone's memory.
func TestBuildMergePatchCannotExpressANullValue(t *testing.T) {
	previous := json.RawMessage(`{"a":{"x":1}}`)
	next := json.RawMessage(`{"a":null}`)

	patch, err := BuildMergePatch(previous, next)
	if err != nil {
		t.Fatal(err)
	}
	rebuilt, err := ApplyMergePatch(previous, patch)
	if err != nil {
		t.Fatal(err)
	}
	if semanticJSONEqual(rebuilt, next) {
		t.Fatal("a null value round-tripped; the format changed and the caveat can be dropped")
	}
	if !semanticJSONEqual(rebuilt, json.RawMessage(`{}`)) {
		t.Fatalf("rebuilt = %s, want the key removed", rebuilt)
	}
}

func TestBuildMergePatchIsEmptyWhenNothingChanged(t *testing.T) {
	patch, err := BuildMergePatch(json.RawMessage(`{"a":1,"b":{"c":2}}`), json.RawMessage(`{"a":1,"b":{"c":2}}`))
	if err != nil {
		t.Fatal(err)
	}
	if string(patch) != "{}" {
		t.Fatalf("patch = %s, want {}", patch)
	}
}

// TestMergePatchCannotCompressAnArrayOfVehicles is the measurement this issue
// exists for.
//
// RFC 7396 replaces an array whole, and the Overlay payload keeps almost all of
// its bulk in the vehicles array. If one car moves, the patch has to carry all
// of them, so the saving from switching the runtime to deltas is nearly nothing
// while the payload keeps that shape.
func TestMergePatchCannotCompressAnArrayOfVehicles(t *testing.T) {
	const vehicles = 44
	previous := gridPayload(vehicles, 0)
	next := gridPayload(vehicles, 1)

	patch, err := BuildMergePatch(previous, next)
	if err != nil {
		t.Fatal(err)
	}

	saving := 1 - float64(len(patch))/float64(len(next))
	t.Logf("one car moved: full %d bytes, patch %d bytes, saving %.1f%%",
		len(next), len(patch), saving*100)

	if saving > 0.25 {
		t.Fatalf("the array now compresses by %.1f%%; the shape assumption in ISA-354 no longer holds",
			saving*100)
	}
}

// TestMergePatchCompressesAVehicleMap shows the same frame keyed by vehicle
// rather than listed, which is what would make deltas worth publishing.
func TestMergePatchCompressesAVehicleMap(t *testing.T) {
	const vehicles = 44
	previous := gridPayloadKeyed(vehicles, 0)
	next := gridPayloadKeyed(vehicles, 1)

	patch, err := BuildMergePatch(previous, next)
	if err != nil {
		t.Fatal(err)
	}

	saving := 1 - float64(len(patch))/float64(len(next))
	t.Logf("same frame keyed by vehicle: full %d bytes, patch %d bytes, saving %.1f%%",
		len(next), len(patch), saving*100)

	if saving < 0.9 {
		t.Fatalf("keying by vehicle only saved %.1f%%, expected the change to isolate", saving*100)
	}
}

// gridPayload mimics the Overlay payload's shape: a list of vehicles, each a
// bundle of quality-wrapped fields. Only the first vehicle moves.
func gridPayload(count, tick int) json.RawMessage {
	rows := make([]string, count)
	for index := range rows {
		rows[index] = vehicleJSON(index, tick)
	}
	return json.RawMessage(fmt.Sprintf(`{"sessionType":"race","vehicles":[%s]}`, strings.Join(rows, ",")))
}

func gridPayloadKeyed(count, tick int) json.RawMessage {
	rows := make([]string, count)
	for index := range rows {
		rows[index] = fmt.Sprintf(`"car-%d":%s`, index, vehicleJSON(index, tick))
	}
	return json.RawMessage(fmt.Sprintf(`{"sessionType":"race","vehicles":{%s}}`, strings.Join(rows, ",")))
}

func vehicleJSON(index, tick int) string {
	moved := 0
	if index == 0 {
		moved = tick
	}
	return fmt.Sprintf(
		`{"id":"car-%d",`+
			`"name":{"present":true,"value":"Vantare GT","provenance":"observed","freshness":"fresh"},`+
			`"driverName":{"present":true,"value":"Driver %d","provenance":"observed","freshness":"fresh"},`+
			`"vehicleClass":{"present":true,"value":"HYPERCAR","provenance":"observed","freshness":"fresh"},`+
			`"bestLapSeconds":{"present":true,"value":90.5,"provenance":"observed","freshness":"fresh"},`+
			`"groundPositionCm":{"present":true,"value":{"xCm":%d,"zCm":%d},"provenance":"observed","freshness":"fresh"}}`,
		index, index, 1000+moved, 2000+moved)
}
