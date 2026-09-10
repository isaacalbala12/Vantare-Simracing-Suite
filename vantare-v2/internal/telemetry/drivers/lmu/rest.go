package lmu

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/weather"
)

const (
	CapabilityREST            drivercontract.Capability = "rest"
	defaultRESTBaseURL                                  = "http://127.0.0.1:6397"
	defaultRESTInterval                                 = 250 * time.Millisecond
	defaultRESTDeadline                                 = 750 * time.Millisecond
	defaultRESTTTL                                      = 2 * time.Second
	defaultRESTMaximumBackoff                           = 2 * time.Second
	maximumRESTResponseBytes                            = 4 << 20
	standingsEndpoint                                   = "/rest/watch/standings"
	sessionInfoEndpoint                                 = "/rest/watch/sessionInfo"
)

type ObservationSource uint8

const (
	SourceUnknown ObservationSource = iota
	SourceSharedMemory
	SourceREST
	SourceCanonical
)

type RESTStatus uint8

const (
	RESTStatusUnknown RESTStatus = iota
	RESTStatusLive
	RESTStatusPartial
	RESTStatusUnsupported
	RESTStatusOffline
	RESTStatusTimeout
	RESTStatusStale
)

type RESTEndpointStatus uint8

const (
	RESTEndpointUnknown RESTEndpointStatus = iota
	RESTEndpointFresh
	RESTEndpointEmpty
	RESTEndpointUnsupported
	RESTEndpointOffline
	RESTEndpointTimeout
	RESTEndpointMalformed
	RESTEndpointStale
)

type RESTEndpointSnapshot struct {
	Status          RESTEndpointStatus
	LastAttemptUTC  time.Time
	LastSuccessUTC  time.Time
	lastSuccessMono monotonicStamp
}

type TimedField[T comparable] struct {
	Field       schema.Field[T]
	UpdatedUTC  time.Time
	updatedMono monotonicStamp
}

type RESTObservation struct {
	Status      RESTStatus
	Standings   RESTEndpointSnapshot
	SessionInfo RESTEndpointSnapshot

	TrackName      TimedField[string]
	SourceTime     TimedField[time.Duration]
	SessionType    TimedField[session.Type]
	VehicleCount   TimedField[schema.Count]
	PlayerPresent  TimedField[bool]
	PlayerPosition TimedField[standings.Position]
	CompletedLaps  TimedField[standings.CompletedLaps]
	PitStopCount   TimedField[pit.StopCount]

	// AmbientTemp and TrackTemp carry the sessionInfo air/track readings in
	// Celsius (ISA-1106, weather.Temperature). Each field owns its presence,
	// freshness and expiry independently: an absent or null reading is
	// missing, a non-numeric or out-of-range one is invalid, and neither
	// poisons the sibling fields.
	AmbientTemp TimedField[weather.Temperature]
	TrackTemp   TimedField[weather.Temperature]
	// SessionFlag carries the conservative global flag assertion (ISA-1106):
	// FlagYellow only on positive yellowFlagState evidence, missing
	// otherwise. A sector-scoped flag never promotes to this global signal.
	SessionFlag TimedField[session.Flag]

	// CarNumbers is the per-row identity grid from the same standings poll.
	// The number stays a string so "007" survives; the grid shares the REST
	// TTL and is dropped (never frozen) once stale.
	CarNumbers            []restCarNumber
	CarNumbersUpdatedUTC  time.Time
	carNumbersUpdatedMono monotonicStamp
}

// restCarNumber is one validated standings identity: the LMU slot plus the
// source-supplied number and the vehicle label used to detect a reused slot.
type restCarNumber struct {
	Slot    int32
	Number  string
	Vehicle string
}

type restDoer interface {
	Do(*http.Request) (*http.Response, error)
}

type restConfig struct {
	baseURL        string
	client         restDoer
	now            func() time.Time
	elapsed        func() time.Duration
	wait           func(context.Context, time.Duration) error
	interval       time.Duration
	deadline       time.Duration
	ttl            time.Duration
	maximumBackoff time.Duration
}

func defaultRESTConfig() *restConfig {
	return &restConfig{baseURL: defaultRESTBaseURL, client: newRESTHTTPClient()}
}

func newRESTHTTPClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	return &http.Client{Transport: transport, CheckRedirect: rejectRESTRedirect}
}

func rejectRESTRedirect(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }

func normalizeRESTConfig(cfg *restConfig, fallbackNow func() time.Time, fallbackElapsed func() time.Duration) *restConfig {
	if cfg == nil {
		return nil
	}
	copy := *cfg
	copy.baseURL = strings.TrimRight(copy.baseURL, "/")
	if copy.baseURL == "" {
		copy.baseURL = defaultRESTBaseURL
	}
	if copy.client == nil {
		copy.client = newRESTHTTPClient()
	} else if client, ok := copy.client.(*http.Client); ok {
		clone := *client
		clone.CheckRedirect = rejectRESTRedirect
		copy.client = &clone
	}
	if copy.now == nil {
		copy.now = fallbackNow
	}
	if copy.elapsed == nil {
		if fallbackElapsed != nil {
			copy.elapsed = fallbackElapsed
		} else {
			started := time.Now()
			copy.elapsed = func() time.Duration { return time.Since(started) }
		}
	}
	if copy.wait == nil {
		copy.wait = waitContext
	}
	if copy.interval <= 0 {
		copy.interval = defaultRESTInterval
	}
	if copy.deadline <= 0 {
		copy.deadline = defaultRESTDeadline
	}
	if copy.ttl <= 0 {
		copy.ttl = defaultRESTTTL
	}
	if copy.maximumBackoff < copy.interval {
		copy.maximumBackoff = defaultRESTMaximumBackoff
	}
	return &copy
}

func waitContext(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

type restCache struct {
	standings      RESTEndpointSnapshot
	sessionInfo    RESTEndpointSnapshot
	trackName      TimedField[string]
	sourceTime     TimedField[time.Duration]
	sessionType    TimedField[session.Type]
	vehicleCount   TimedField[schema.Count]
	playerPresent  TimedField[bool]
	playerPosition TimedField[standings.Position]
	completedLaps  TimedField[standings.CompletedLaps]
	pitStopCount   TimedField[pit.StopCount]
	ambientTemp    TimedField[weather.Temperature]
	trackTemp      TimedField[weather.Temperature]
	sessionFlag    TimedField[session.Flag]
	carNumbers     []restCarNumber
	carNumbersUTC  time.Time
	carNumbersMono monotonicStamp
}

type restStanding struct {
	Player        bool  `json:"player"`
	Position      int32 `json:"position"`
	LapsCompleted int32 `json:"lapsCompleted"`
	Pitstops      int32 `json:"pitstops"`
	// SlotID is a pointer so an absent/null slot is never confused with the
	// valid slot 0.
	SlotID      *int32 `json:"slotID"`
	CarNumber   string `json:"carNumber"`
	VehicleName string `json:"vehicleName"`
}

type restSessionInfo struct {
	TrackName        *string `json:"trackName"`
	Session          string  `json:"session"`
	NumberOfVehicles int32   `json:"numberOfVehicles"`
	CurrentEventTime float64 `json:"currentEventTime"`
	// Session signals admitted by ISA-1106. RawMessage keeps decoding
	// tolerant per field: absent/null is missing, a present but unusable
	// value is invalid, and one bad field never fails its siblings.
	AmbientTemp     json.RawMessage `json:"ambientTemp"`
	TrackTemp       json.RawMessage `json:"trackTemp"`
	YellowFlagState json.RawMessage `json:"yellowFlagState"`
	// SectorFlag is accepted and ignored for the global flag assertion: a
	// sector-scoped flag must never promote to the session-global signal.
	// GamePhase is accepted for future vocabulary work; unrecognized values
	// stay missing rather than failing the session.
	SectorFlag json.RawMessage `json:"sectorFlag"`
	GamePhase  *string         `json:"gamePhase"`
}

func runREST(ctx context.Context, cfg *restConfig, output chan<- Observation) error {
	cache := restCache{}
	backoff := cfg.interval
	for {
		observation, complete := pollREST(ctx, cfg, &cache)
		if err := ctx.Err(); err != nil {
			return err
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case output <- observation:
		}
		if complete {
			backoff = cfg.interval
		} else {
			backoff = min(backoff*2, cfg.maximumBackoff)
		}
		if err := cfg.wait(ctx, backoff); err != nil {
			return err
		}
	}
}

func pollREST(ctx context.Context, cfg *restConfig, cache *restCache) (Observation, bool) {
	standingsResponse := fetchREST(ctx, cfg, standingsEndpoint)
	cache.standings.LastAttemptUTC = standingsResponse.attemptedUTC
	cache.standings.Status = standingsResponse.status
	if standingsResponse.status == RESTEndpointFresh {
		rows, err := decodeStandings(standingsResponse.body)
		if err != nil {
			cache.standings.Status = classifyDecodeError(err)
		} else {
			next := *cache
			updateStandingsFields(&next, rows, standingsResponse)
			cache.applyStandings(next)
			cache.standings.LastSuccessUTC = standingsResponse.receivedUTC
			cache.standings.lastSuccessMono = standingsResponse.receivedMono
		}
	}
	if ctx.Err() != nil {
		snapshotUTC := restNow(cfg)
		rest := cache.snapshot()
		rest.Status = overallRESTStatus(rest)
		return Observation{Source: SourceREST, ReceivedUTC: snapshotUTC, REST: rest}, false
	}

	sessionResponse := fetchREST(ctx, cfg, sessionInfoEndpoint)
	cache.sessionInfo.LastAttemptUTC = sessionResponse.attemptedUTC
	cache.sessionInfo.Status = sessionResponse.status
	if sessionResponse.status == RESTEndpointFresh {
		info, err := decodeSessionInfo(sessionResponse.body)
		if err != nil {
			cache.sessionInfo.Status = classifyDecodeError(err)
		} else {
			if validationErr := cache.acceptSession(info, sessionResponse.receivedUTC, sessionResponse.receivedMono); validationErr != nil {
				cache.sessionInfo.Status = RESTEndpointMalformed
			}
		}
	}

	snapshotUTC := restNow(cfg)
	snapshotMono := restElapsed(cfg)
	markRESTStale(cache, snapshotMono, cfg.ttl)
	rest := cache.snapshot()
	rest.Status = overallRESTStatus(rest)
	return Observation{Source: SourceREST, ReceivedUTC: snapshotUTC, REST: rest}, rest.Status == RESTStatusLive
}

type restResponse struct {
	status       RESTEndpointStatus
	body         []byte
	attemptedUTC time.Time
	receivedUTC  time.Time
	receivedMono monotonicStamp
	// startedMono stamps the request start. The car-number grid uses it (not
	// the response end): a request sent before a session boundary must not
	// pass the fusion floor just because its response arrived afterwards.
	startedMono monotonicStamp
}

func fetchREST(parent context.Context, cfg *restConfig, path string) restResponse {
	result := restResponse{attemptedUTC: restNow(cfg), startedMono: monotonicStamp{elapsed: restElapsed(cfg), set: true}}
	target, err := url.Parse(cfg.baseURL + path)
	if err != nil || !isLoopbackHTTP(target) {
		result.status = RESTEndpointMalformed
		result.receivedUTC, result.receivedMono = restNow(cfg), monotonicStamp{elapsed: restElapsed(cfg), set: true}
		return result
	}
	ctx, cancel := context.WithTimeout(parent, cfg.deadline)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		result.status = RESTEndpointMalformed
		result.receivedUTC, result.receivedMono = restNow(cfg), monotonicStamp{elapsed: restElapsed(cfg), set: true}
		return result
	}
	resp, err := cfg.client.Do(req)
	if err != nil {
		result.receivedUTC, result.receivedMono = restNow(cfg), monotonicStamp{elapsed: restElapsed(cfg), set: true}
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			result.status = RESTEndpointTimeout
			return result
		}
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			result.status = RESTEndpointOffline
			return result
		}
		var networkError net.Error
		if errors.As(err, &networkError) {
			result.status = RESTEndpointOffline
			return result
		}
		result.status = RESTEndpointOffline
		return result
	}
	defer resp.Body.Close()
	result.receivedUTC, result.receivedMono = restNow(cfg), monotonicStamp{elapsed: restElapsed(cfg), set: true}
	if resp.Request == nil || !isLoopbackHTTP(resp.Request.URL) {
		result.status = RESTEndpointMalformed
		return result
	}
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented:
		result.status = RESTEndpointUnsupported
		return result
	case resp.StatusCode >= 500:
		result.status = RESTEndpointOffline
		return result
	case resp.StatusCode < 200 || resp.StatusCode >= 300:
		result.status = RESTEndpointMalformed
		return result
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maximumRESTResponseBytes+1))
	result.receivedUTC, result.receivedMono = restNow(cfg), monotonicStamp{elapsed: restElapsed(cfg), set: true}
	if err != nil {
		result.status = RESTEndpointOffline
		return result
	}
	if len(body) == 0 || len(bytes.TrimSpace(body)) == 0 {
		result.status = RESTEndpointEmpty
		return result
	}
	if len(body) > maximumRESTResponseBytes {
		result.status = RESTEndpointMalformed
		return result
	}
	result.status = RESTEndpointFresh
	result.body = body
	return result
}

func restNow(cfg *restConfig) time.Time         { return cfg.now().Round(0).UTC() }
func restElapsed(cfg *restConfig) time.Duration { return cfg.elapsed() }

func isLoopbackHTTP(target *url.URL) bool {
	if target == nil || target.Scheme != "http" || target.Hostname() == "" {
		return false
	}
	host := strings.ToLower(target.Hostname())
	if host == "localhost" {
		return true
	}
	address := net.ParseIP(host)
	return address != nil && address.IsLoopback()
}

func decodeStandings(body []byte) ([]restStanding, error) {
	var rows []restStanding
	if err := decodeSingleJSON(body, &rows); err != nil {
		return nil, err
	}
	if rows == nil {
		return nil, io.EOF
	}
	return rows, nil
}

func decodeSessionInfo(body []byte) (restSessionInfo, error) {
	var info restSessionInfo
	if err := decodeSingleJSON(body, &info); err != nil {
		return restSessionInfo{}, err
	}
	return info, nil
}

func decodeSingleJSON(body []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(body))
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("multiple JSON values")
		}
		return err
	}
	return nil
}

func classifyDecodeError(err error) RESTEndpointStatus {
	if errors.Is(err, io.EOF) {
		return RESTEndpointEmpty
	}
	return RESTEndpointMalformed
}

func updateStandingsFields(cache *restCache, rows []restStanding, response restResponse) {
	now, elapsed := response.receivedUTC, response.receivedMono
	cache.playerPresent = timedObservedAt(false, now, elapsed)
	cache.playerPosition = timedMissingAt[standings.Position](now, elapsed)
	cache.completedLaps = timedMissingAt[standings.CompletedLaps](now, elapsed)
	cache.pitStopCount = timedMissingAt[pit.StopCount](now, elapsed)
	cache.carNumbers = updateCarNumberGrid(rows)
	cache.carNumbersUTC = response.attemptedUTC
	cache.carNumbersMono = response.startedMono
	for _, row := range rows {
		if !row.Player {
			continue
		}
		cache.playerPresent = timedObservedAt(true, now, elapsed)
		cache.playerPosition = timedValidatedAt[standings.Position](row.Position, 1, math.MaxInt32, now, elapsed)
		cache.completedLaps = timedValidatedAt[standings.CompletedLaps](row.LapsCompleted, 0, math.MaxInt32, now, elapsed)
		cache.pitStopCount = timedValidatedAt[pit.StopCount](row.Pitstops, 0, math.MaxInt32, now, elapsed)
		return
	}
}

// updateCarNumberGrid keeps one validated identity per slot from a single
// poll. Rows without an explicit slot never contribute (slot 0 is valid, so
// absence is not zero). Slots are counted before any number is validated: a
// slot claimed twice in one poll is ambiguous even when only one of the rows
// carries a usable number, so neither entry publishes.
func updateCarNumberGrid(rows []restStanding) []restCarNumber {
	if len(rows) == 0 {
		return nil
	}
	counts := make(map[int32]int, len(rows))
	for _, row := range rows {
		if row.SlotID == nil || *row.SlotID < 0 {
			continue
		}
		counts[*row.SlotID]++
	}
	var grid []restCarNumber
	for _, row := range rows {
		if row.SlotID == nil || *row.SlotID < 0 || counts[*row.SlotID] != 1 {
			continue
		}
		number, ok := normalizeRESTCarNumber(row.CarNumber)
		if !ok {
			continue
		}
		grid = append(grid, restCarNumber{Slot: *row.SlotID, Number: number, Vehicle: strings.TrimSpace(row.VehicleName)})
	}
	return grid
}

// normalizeRESTCarNumber validates a source-supplied car number and returns it
// verbatim. Short numeric strings keep their exact form ("007" stays "007");
// anything else is rejected so the fusion never publishes a guessed identity.
func normalizeRESTCarNumber(value string) (string, bool) {
	trimmed := strings.TrimSpace(value)
	if len(trimmed) == 0 || len(trimmed) > 4 {
		return "", false
	}
	for index := 0; index < len(trimmed); index++ {
		if trimmed[index] < '0' || trimmed[index] > '9' {
			return "", false
		}
	}
	return trimmed, true
}

func (cache *restCache) applyStandings(next restCache) {
	cache.playerPresent = next.playerPresent
	cache.playerPosition = next.playerPosition
	cache.completedLaps = next.completedLaps
	cache.pitStopCount = next.pitStopCount
	cache.carNumbers = next.carNumbers
	cache.carNumbersUTC = next.carNumbersUTC
	cache.carNumbersMono = next.carNumbersMono
}

type sessionFields struct {
	trackName    TimedField[string]
	sourceTime   TimedField[time.Duration]
	sessionType  TimedField[session.Type]
	vehicleCount TimedField[schema.Count]
	ambientTemp  TimedField[weather.Temperature]
	trackTemp    TimedField[weather.Temperature]
	sessionFlag  TimedField[session.Flag]
}

// Plausible Celsius sanity bounds for the sessionInfo temperature readings.
// They reject garbage without certifying the exact sensor vocabulary, which
// still awaits an active-session capture.
const (
	minAmbientTempC = -30
	maxAmbientTempC = 60
	minTrackTempC   = -20
	maxTrackTempC   = 80
)

func validateSessionFields(info restSessionInfo, now time.Time, elapsed monotonicStamp) (sessionFields, error) {
	sourceTime, valid := durationFromSeconds(info.CurrentEventTime)
	if !valid {
		return sessionFields{}, errors.New("invalid LMU REST current event time")
	}
	fields := sessionFields{
		sourceTime:   timedObservedAt(sourceTime, now, elapsed),
		sessionType:  TimedField[session.Type]{Field: parseRESTSessionType(info.Session), UpdatedUTC: now, updatedMono: elapsed},
		vehicleCount: timedValidatedAt[schema.Count](info.NumberOfVehicles, 0, maxVehicles, now, elapsed),
		ambientTemp:  parseRESTTemperature(info.AmbientTemp, minAmbientTempC, maxAmbientTempC, now, elapsed),
		trackTemp:    parseRESTTemperature(info.TrackTemp, minTrackTempC, maxTrackTempC, now, elapsed),
		sessionFlag:  parseRESTSessionFlag(info.YellowFlagState, now, elapsed),
	}
	if info.TrackName == nil {
		fields.trackName = timedMissingAt[string](now, elapsed)
	} else {
		fields.trackName = timedObservedAt(normalizeTrackName(*info.TrackName), now, elapsed)
	}
	return fields, nil
}

func durationFromSeconds(seconds float64) (time.Duration, bool) {
	if !finite(seconds) || seconds < 0 {
		return 0, false
	}
	wholeFloat, fraction := math.Modf(seconds)
	maxWholeSeconds := int64(math.MaxInt64) / int64(time.Second)
	if wholeFloat > float64(maxWholeSeconds) {
		return 0, false
	}
	wholeSeconds := int64(wholeFloat)
	fractionalNanos := int64(fraction * float64(time.Second))
	if wholeSeconds == maxWholeSeconds {
		maxFractionalNanos := int64(math.MaxInt64) % int64(time.Second)
		if fractionalNanos > maxFractionalNanos {
			return 0, false
		}
	}
	return time.Duration(wholeSeconds)*time.Second + time.Duration(fractionalNanos), true
}

func (cache *restCache) applySession(fields sessionFields) {
	cache.trackName = fields.trackName
	cache.sourceTime = fields.sourceTime
	cache.sessionType = fields.sessionType
	cache.vehicleCount = fields.vehicleCount
	cache.ambientTemp = fields.ambientTemp
	cache.trackTemp = fields.trackTemp
	cache.sessionFlag = fields.sessionFlag
}

// parseRESTTemperature decodes one optional Celsius reading with per-field
// independence: absent/null is missing, a present but non-numeric,
// non-finite or out-of-range value is invalid, and never affects siblings.
func parseRESTTemperature(raw json.RawMessage, minimum, maximum float64, now time.Time, elapsed monotonicStamp) TimedField[weather.Temperature] {
	if len(bytes.TrimSpace(raw)) == 0 || string(bytes.TrimSpace(raw)) == "null" {
		return timedMissingAt[weather.Temperature](now, elapsed)
	}
	var value float64
	if err := json.Unmarshal(raw, &value); err != nil {
		return TimedField[weather.Temperature]{Field: invalid[weather.Temperature](), UpdatedUTC: now, updatedMono: elapsed}
	}
	if !finite(value) || value < minimum || value > maximum {
		return TimedField[weather.Temperature]{Field: invalid[weather.Temperature](), UpdatedUTC: now, updatedMono: elapsed}
	}
	return timedObservedAt(weather.Temperature(value), now, elapsed)
}

// parseRESTSessionFlag asserts FlagYellow only on positive yellowFlagState
// evidence. The state is numeric on the observed vocabulary (0 while green);
// a nonzero number, numeric string or true means yellow. Absent, null, zero,
// false or an unrecognized shape stays missing: absence is never green, and
// unknown vocabulary never invents a flag. SectorFlag and GamePhase are
// deliberately not consulted here: sector scope must not promote to global.
func parseRESTSessionFlag(raw json.RawMessage, now time.Time, elapsed monotonicStamp) TimedField[session.Flag] {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || string(trimmed) == "null" {
		return timedMissingAt[session.Flag](now, elapsed)
	}
	var number float64
	if err := json.Unmarshal(trimmed, &number); err == nil {
		if !finite(number) {
			return TimedField[session.Flag]{Field: invalid[session.Flag](), UpdatedUTC: now, updatedMono: elapsed}
		}
		if number != 0 {
			return timedObservedAt(session.FlagYellow, now, elapsed)
		}
		return timedMissingAt[session.Flag](now, elapsed)
	}
	var text string
	if err := json.Unmarshal(trimmed, &text); err == nil {
		lowered := strings.ToLower(strings.TrimSpace(text))
		switch lowered {
		case "", "0", "none", "green", "false", "no":
			return timedMissingAt[session.Flag](now, elapsed)
		case "yellow", "1", "true", "yes":
			return timedObservedAt(session.FlagYellow, now, elapsed)
		default:
			if parsed, err := strconv.ParseFloat(lowered, 64); err == nil && finite(parsed) {
				if parsed != 0 {
					return timedObservedAt(session.FlagYellow, now, elapsed)
				}
				return timedMissingAt[session.Flag](now, elapsed)
			}
			return timedMissingAt[session.Flag](now, elapsed)
		}
	}
	var flag bool
	if err := json.Unmarshal(trimmed, &flag); err == nil {
		if flag {
			return timedObservedAt(session.FlagYellow, now, elapsed)
		}
		return timedMissingAt[session.Flag](now, elapsed)
	}
	return TimedField[session.Flag]{Field: invalid[session.Flag](), UpdatedUTC: now, updatedMono: elapsed}
}

func (cache *restCache) acceptSession(info restSessionInfo, receivedUTC time.Time, receivedMono monotonicStamp) error {
	fields, err := validateSessionFields(info, receivedUTC, receivedMono)
	if err != nil {
		return err
	}
	cache.applySession(fields)
	cache.sessionInfo.LastSuccessUTC = receivedUTC
	cache.sessionInfo.lastSuccessMono = receivedMono
	return nil
}

func parseRESTSessionType(value string) schema.Field[session.Type] {
	upper := strings.ToUpper(strings.TrimSpace(value))
	var result session.Type
	switch {
	case strings.HasPrefix(upper, "PRACTICE"):
		result = session.TypePractice
	case strings.HasPrefix(upper, "QUAL"):
		result = session.TypeQualifying
	case strings.HasPrefix(upper, "RACE"):
		result = session.TypeRace
	case strings.HasPrefix(upper, "WARMUP"):
		result = session.TypeWarmup
	default:
		return invalid[session.Type]()
	}
	return observed(result)
}

func timedObserved[T comparable](value T, now time.Time) TimedField[T] {
	return timedObservedAt(value, now, monotonicStamp{elapsed: 0, set: true})
}

func timedMissing[T comparable](now time.Time) TimedField[T] {
	return timedMissingAt[T](now, monotonicStamp{elapsed: 0, set: true})
}

func timedValidated[T ~int32](value int32, minimum, maximum int32, now time.Time) TimedField[T] {
	return timedValidatedAt[T](value, minimum, maximum, now, monotonicStamp{elapsed: 0, set: true})
}

func timedObservedAt[T comparable](value T, now time.Time, elapsed monotonicStamp) TimedField[T] {
	return TimedField[T]{Field: observed(value), UpdatedUTC: now, updatedMono: elapsed}
}

func timedMissingAt[T comparable](now time.Time, elapsed monotonicStamp) TimedField[T] {
	return TimedField[T]{Field: schema.MissingField[T](), UpdatedUTC: now, updatedMono: elapsed}
}

func timedValidatedAt[T ~int32](value int32, minimum, maximum int32, now time.Time, elapsed monotonicStamp) TimedField[T] {
	if value < minimum || value > maximum {
		return TimedField[T]{Field: invalid[T](), UpdatedUTC: now, updatedMono: elapsed}
	}
	return timedObservedAt(T(value), now, elapsed)
}

func markRESTStale(cache *restCache, elapsed time.Duration, ttl time.Duration) {
	cache.standings = staleEndpoint(cache.standings, elapsed, ttl)
	cache.sessionInfo = staleEndpoint(cache.sessionInfo, elapsed, ttl)
	cache.trackName = staleTimedField(cache.trackName, elapsed, ttl)
	cache.sourceTime = staleTimedField(cache.sourceTime, elapsed, ttl)
	cache.sessionType = staleTimedField(cache.sessionType, elapsed, ttl)
	cache.vehicleCount = staleTimedField(cache.vehicleCount, elapsed, ttl)
	cache.ambientTemp = staleTimedField(cache.ambientTemp, elapsed, ttl)
	cache.trackTemp = staleTimedField(cache.trackTemp, elapsed, ttl)
	cache.sessionFlag = staleTimedField(cache.sessionFlag, elapsed, ttl)
	cache.playerPresent = staleTimedField(cache.playerPresent, elapsed, ttl)
	cache.playerPosition = staleTimedField(cache.playerPosition, elapsed, ttl)
	cache.completedLaps = staleTimedField(cache.completedLaps, elapsed, ttl)
	cache.pitStopCount = staleTimedField(cache.pitStopCount, elapsed, ttl)
	// A stale identity grid is dropped, never frozen: a number that outlives
	// its poll could belong to a reused slot.
	if !cache.carNumbersMono.set || elapsed < cache.carNumbersMono.elapsed || elapsed-cache.carNumbersMono.elapsed > ttl {
		cache.carNumbers = nil
	}
}

func staleEndpoint(value RESTEndpointSnapshot, elapsed time.Duration, ttl time.Duration) RESTEndpointSnapshot {
	if value.lastSuccessMono.set && (elapsed < value.lastSuccessMono.elapsed || elapsed-value.lastSuccessMono.elapsed > ttl) && value.Status != RESTEndpointUnsupported {
		value.Status = RESTEndpointStale
	}
	return value
}

func staleTimedField[T comparable](value TimedField[T], elapsed time.Duration, ttl time.Duration) TimedField[T] {
	if !value.updatedMono.set || (elapsed >= value.updatedMono.elapsed && elapsed-value.updatedMono.elapsed <= ttl) || value.Field.Freshness() == schema.FreshnessMissing || value.Field.Freshness() == schema.FreshnessInvalid {
		return value
	}
	fieldValue, present := value.Field.Value()
	if !present {
		return value
	}
	field, err := schema.NewField(fieldValue, value.Field.Provenance(), schema.FreshnessStale)
	if err == nil {
		value.Field = field
	}
	return value
}

func (cache restCache) snapshot() RESTObservation {
	return RESTObservation{
		Standings: cache.standings, SessionInfo: cache.sessionInfo,
		TrackName: cache.trackName, SourceTime: cache.sourceTime, SessionType: cache.sessionType, VehicleCount: cache.vehicleCount,
		PlayerPresent: cache.playerPresent, PlayerPosition: cache.playerPosition,
		CompletedLaps: cache.completedLaps, PitStopCount: cache.pitStopCount,
		AmbientTemp: cache.ambientTemp, TrackTemp: cache.trackTemp, SessionFlag: cache.sessionFlag,
		CarNumbers:           cache.carNumbers,
		CarNumbersUpdatedUTC: cache.carNumbersUTC, carNumbersUpdatedMono: cache.carNumbersMono,
	}
}

func overallRESTStatus(value RESTObservation) RESTStatus {
	statuses := []RESTEndpointStatus{value.Standings.Status, value.SessionInfo.Status}
	if statuses[0] == RESTEndpointFresh && statuses[1] == RESTEndpointFresh {
		return RESTStatusLive
	}
	if statuses[0] == RESTEndpointStale || statuses[1] == RESTEndpointStale {
		return RESTStatusStale
	}
	if statuses[0] == RESTEndpointUnsupported && statuses[1] == RESTEndpointUnsupported {
		return RESTStatusUnsupported
	}
	if statuses[0] == RESTEndpointOffline && statuses[1] == RESTEndpointOffline {
		return RESTStatusOffline
	}
	if statuses[0] == RESTEndpointTimeout || statuses[1] == RESTEndpointTimeout {
		return RESTStatusTimeout
	}
	return RESTStatusPartial
}
