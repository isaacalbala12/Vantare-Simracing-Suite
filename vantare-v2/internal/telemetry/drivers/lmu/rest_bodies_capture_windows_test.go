//go:build windows

package lmu

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"
)

// captureSanitizedRESTBodies keeps only decoder inputs. Source names and
// unknown endpoint fields never leave memory; slot aliases match the SHM
// sanitizer that has already processed this sample.
func captureSanitizedRESTBodies(ctx context.Context, sanitizer *FrameSanitizer) ([]byte, error) {
	result, err := captureSanitizedRESTBodiesTimed(ctx, sanitizer)
	return result.body, err
}

type timedRESTBodies struct {
	body               []byte
	standingsStarted   time.Time
	standingsCompleted time.Time
	sessionStarted     time.Time
	sessionCompleted   time.Time
}

func captureSanitizedRESTBodiesTimed(ctx context.Context, sanitizer *FrameSanitizer) (timedRESTBodies, error) {
	var result timedRESTBodies
	cfg := normalizeRESTConfig(defaultRESTConfig(), time.Now, nil)
	result.standingsStarted = time.Now().Round(0).UTC()
	standings := fetchREST(ctx, cfg, standingsEndpoint)
	result.standingsCompleted = time.Now().Round(0).UTC()
	defer clear(standings.body)
	if standings.status != RESTEndpointFresh {
		return result, fmt.Errorf("standings status %d", standings.status)
	}
	result.sessionStarted = time.Now().Round(0).UTC()
	session := fetchREST(ctx, cfg, sessionInfoEndpoint)
	result.sessionCompleted = time.Now().Round(0).UTC()
	defer clear(session.body)
	if session.status != RESTEndpointFresh {
		return result, fmt.Errorf("sessionInfo status %d", session.status)
	}
	safeStandings, err := sanitizeRESTStandings(standings.body, sanitizer)
	if err != nil {
		return result, err
	}
	safeSession, err := sanitizeRESTSession(session.body)
	if err != nil {
		return result, err
	}
	result.body, err = json.Marshal(struct {
		Schema      string          `json:"schema"`
		Standings   json.RawMessage `json:"standings"`
		SessionInfo json.RawMessage `json:"sessionInfo"`
	}{sanitizedRESTBodiesSchema, safeStandings, safeSession})
	return result, err
}

func sanitizeRESTStandings(body []byte, sanitizer *FrameSanitizer) ([]byte, error) {
	var rows []map[string]json.RawMessage
	if err := json.Unmarshal(body, &rows); err != nil || rows == nil {
		return nil, errors.New("invalid standings array")
	}
	sanitizer.mu.Lock()
	aliases := make(map[int32]sanitizedIdentity, len(sanitizer.ids))
	for source, alias := range sanitizer.ids {
		aliases[source] = alias
	}
	sanitizer.mu.Unlock()
	result := make([]map[string]json.RawMessage, 0, len(rows))
	for _, row := range rows {
		if row == nil {
			return nil, errors.New("null standings row")
		}
		safe := make(map[string]json.RawMessage)
		for _, key := range []string{"player", "position", "lapsCompleted", "pitstops"} {
			if raw, ok := row[key]; ok {
				if err := safeRESTScalar(raw); err != nil {
					return nil, fmt.Errorf("unsafe standings %s: %w", key, err)
				}
				safe[key] = raw
			}
		}
		if raw, ok := row["slotID"]; ok && string(raw) != "null" {
			var source int32
			if err := json.Unmarshal(raw, &source); err != nil {
				return nil, errors.New("invalid standings slot")
			}
			alias, ok := aliases[source]
			if !ok {
				return nil, errors.New("standings slot has no SHM alias")
			}
			safe["slotID"] = strconv.AppendInt(nil, int64(alias.ID), 10)
			if _, present := row["vehicleName"]; present {
				var err error
				safe["vehicleName"], err = json.Marshal(fmt.Sprintf("Vehicle-%03d", alias.Alias))
				if err != nil {
					return nil, err
				}
			}
		}
		if raw, ok := row["carNumber"]; ok && string(raw) != "null" {
			var number string
			if err := json.Unmarshal(raw, &number); err != nil || len(number) > 4 ||
				strings.Trim(number, "0123456789") != "" {
				return nil, errors.New("unsafe car number")
			}
			var err error
			safe["carNumber"], err = json.Marshal(number)
			if err != nil {
				return nil, err
			}
		}
		result = append(result, safe)
	}
	return json.Marshal(result)
}

func sanitizeRESTSession(body []byte) ([]byte, error) {
	var row map[string]json.RawMessage
	if err := json.Unmarshal(body, &row); err != nil || row == nil {
		return nil, errors.New("invalid sessionInfo object")
	}
	safe := make(map[string]json.RawMessage)
	for _, key := range []string{"numberOfVehicles", "currentEventTime", "ambientTemp", "trackTemp", "averagePathWetness", "yellowFlagState"} {
		if raw, ok := row[key]; ok {
			if len(raw) > 0 && raw[0] == '"' &&
				(key == "ambientTemp" || key == "trackTemp" || key == "averagePathWetness" || key == "yellowFlagState") {
				// Both decoders treat these text shapes as invalid or absent.
				// Retain that behavior without persisting source text.
				safe[key] = json.RawMessage(`"invalid"`)
				continue
			}
			if err := safeRESTScalar(raw); err != nil {
				return nil, fmt.Errorf("unsafe sessionInfo %s: %w", key, err)
			}
			safe[key] = raw
		}
	}
	if raw, ok := row["trackName"]; ok && string(raw) != "null" {
		safe["trackName"] = json.RawMessage(`"Track-01"`)
	}
	if raw, ok := row["session"]; ok {
		var label string
		if err := json.Unmarshal(raw, &label); err != nil || len(label) > 32 {
			return nil, errors.New("unsafe session label")
		}
		upper := strings.ToUpper(label)
		var fixed string
		switch {
		case strings.HasPrefix(upper, "PRACTICE"):
			fixed = "PRACTICE"
		case strings.HasPrefix(upper, "QUAL"):
			fixed = "QUALIFY"
		case strings.HasPrefix(upper, "RACE"):
			fixed = "RACE"
		case strings.HasPrefix(upper, "WARMUP"):
			fixed = "WARMUP"
		default:
			return nil, errors.New("unrecognized session label")
		}
		safe["session"] = json.RawMessage(strconv.Quote(fixed))
	}
	return json.Marshal(safe)
}

func safeRESTScalar(raw json.RawMessage) error {
	if len(raw) == 0 {
		return errors.New("empty scalar")
	}
	switch raw[0] {
	case '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 't', 'f', 'n':
		return nil
	default:
		return errors.New("non-scalar or text field")
	}
}

func TestSanitizeRESTEndpointBodiesKeepsDecoderInputsWithoutSourceText(t *testing.T) {
	sanitizer := &FrameSanitizer{ids: map[int32]sanitizedIdentity{
		17: {ID: 1_000_001, Alias: 1},
	}}
	standings, err := sanitizeRESTStandings([]byte(`[{"slotID":17,"player":true,"position":2,"lapsCompleted":4,"pitstops":0,"carNumber":"007","vehicleName":"Real Team","driverName":"Alice"}]`), sanitizer)
	if err != nil {
		t.Fatal(err)
	}
	session, err := sanitizeRESTSession([]byte(`{"trackName":"Real Circuit","session":"PRACTICE1","numberOfVehicles":47,"currentEventTime":123,"ambientTemp":31,"yellowFlagState":"Secret Flag","unknown":"Private"}`))
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{"Real Team", "Alice", "Real Circuit", "Private", "Secret Flag"} {
		if bytes.Contains(standings, []byte(private)) || bytes.Contains(session, []byte(private)) {
			t.Fatalf("sanitized REST leaked source text %q", private)
		}
	}
	if !bytes.Contains(standings, []byte(`"slotID":1000001`)) ||
		!bytes.Contains(standings, []byte(`"vehicleName":"Vehicle-001"`)) ||
		!bytes.Contains(standings, []byte(`"carNumber":"007"`)) ||
		!bytes.Contains(session, []byte(`"trackName":"Track-01"`)) ||
		!bytes.Contains(session, []byte(`"session":"PRACTICE"`)) ||
		!bytes.Contains(session, []byte(`"yellowFlagState":"invalid"`)) {
		t.Fatalf("sanitized REST lost required decoder inputs")
	}
	if _, err := sanitizeRESTStandings([]byte(`[{"slotID":17,"carNumber":"Alice"}]`), sanitizer); err == nil {
		t.Fatal("accepted source text as car number")
	}
	if _, err := sanitizeRESTStandings([]byte(`[{"slotID":18}]`), sanitizer); err == nil {
		t.Fatal("accepted unmapped slot")
	}
}
