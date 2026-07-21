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
	"strings"
	"time"

	drivercontract "github.com/vantare/overlays/v2/internal/telemetry/driver"
	"github.com/vantare/overlays/v2/internal/telemetry/schema"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/pit"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/session"
	"github.com/vantare/overlays/v2/internal/telemetry/schema/standings"
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
	SourceSharedMemory ObservationSource = iota + 1
	SourceREST
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
	Status         RESTEndpointStatus
	LastAttemptUTC time.Time
	LastSuccessUTC time.Time
}

type TimedField[T comparable] struct {
	Field      schema.Field[T]
	UpdatedUTC time.Time
}

type RESTObservation struct {
	Status      RESTStatus
	Standings   RESTEndpointSnapshot
	SessionInfo RESTEndpointSnapshot

	TrackName      TimedField[string]
	SessionType    TimedField[session.Type]
	VehicleCount   TimedField[schema.Count]
	PlayerPresent  TimedField[bool]
	PlayerPosition TimedField[standings.Position]
	CompletedLaps  TimedField[standings.CompletedLaps]
	PitStopCount   TimedField[pit.StopCount]
}

type restDoer interface {
	Do(*http.Request) (*http.Response, error)
}

type restConfig struct {
	baseURL        string
	client         restDoer
	now            func() time.Time
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
	return &http.Client{Transport: transport}
}

func normalizeRESTConfig(cfg *restConfig, fallbackNow func() time.Time) *restConfig {
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
	}
	if copy.now == nil {
		copy.now = fallbackNow
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
	sessionType    TimedField[session.Type]
	vehicleCount   TimedField[schema.Count]
	playerPresent  TimedField[bool]
	playerPosition TimedField[standings.Position]
	completedLaps  TimedField[standings.CompletedLaps]
	pitStopCount   TimedField[pit.StopCount]
}

type restStanding struct {
	Player        bool  `json:"player"`
	Position      int32 `json:"position"`
	LapsCompleted int32 `json:"lapsCompleted"`
	Pitstops      int32 `json:"pitstops"`
}

type restSessionInfo struct {
	TrackName        string  `json:"trackName"`
	Session          string  `json:"session"`
	NumberOfVehicles int32   `json:"numberOfVehicles"`
	CurrentEventTime float64 `json:"currentEventTime"`
}

func runREST(ctx context.Context, cfg *restConfig, output chan<- Observation) error {
	cache := restCache{}
	backoff := cfg.interval
	for {
		now := cfg.now().Round(0).UTC()
		observation, complete := pollREST(ctx, cfg, &cache, now)
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

func pollREST(ctx context.Context, cfg *restConfig, cache *restCache, now time.Time) (Observation, bool) {
	standingsStatus, standingsBody := fetchREST(ctx, cfg, standingsEndpoint, now)
	cache.standings.LastAttemptUTC = now
	cache.standings.Status = standingsStatus
	if standingsStatus == RESTEndpointFresh {
		rows, err := decodeStandings(standingsBody)
		if err != nil {
			cache.standings.Status = classifyDecodeError(err)
		} else {
			cache.standings.LastSuccessUTC = now
			updateStandingsFields(cache, rows, now)
		}
	}
	if ctx.Err() != nil {
		rest := cache.snapshot()
		rest.Status = overallRESTStatus(rest)
		return Observation{Source: SourceREST, ReceivedUTC: now, REST: rest}, false
	}

	sessionStatus, sessionBody := fetchREST(ctx, cfg, sessionInfoEndpoint, now)
	cache.sessionInfo.LastAttemptUTC = now
	cache.sessionInfo.Status = sessionStatus
	if sessionStatus == RESTEndpointFresh {
		info, err := decodeSessionInfo(sessionBody)
		if err != nil {
			cache.sessionInfo.Status = classifyDecodeError(err)
		} else {
			cache.sessionInfo.LastSuccessUTC = now
			updateSessionFields(cache, info, now)
		}
	}

	markRESTStale(cache, now, cfg.ttl)
	rest := cache.snapshot()
	rest.Status = overallRESTStatus(rest)
	return Observation{Source: SourceREST, ReceivedUTC: now, REST: rest}, rest.Status == RESTStatusLive
}

func fetchREST(parent context.Context, cfg *restConfig, path string, _ time.Time) (RESTEndpointStatus, []byte) {
	ctx, cancel := context.WithTimeout(parent, cfg.deadline)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.baseURL+path, nil)
	if err != nil {
		return RESTEndpointMalformed, nil
	}
	resp, err := cfg.client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return RESTEndpointTimeout, nil
		}
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			return RESTEndpointOffline, nil
		}
		var networkError net.Error
		if errors.As(err, &networkError) {
			return RESTEndpointOffline, nil
		}
		return RESTEndpointOffline, nil
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusMethodNotAllowed || resp.StatusCode == http.StatusNotImplemented:
		return RESTEndpointUnsupported, nil
	case resp.StatusCode >= 500:
		return RESTEndpointOffline, nil
	case resp.StatusCode < 200 || resp.StatusCode >= 300:
		return RESTEndpointMalformed, nil
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maximumRESTResponseBytes+1))
	if err != nil {
		return RESTEndpointOffline, nil
	}
	if len(body) == 0 || len(bytes.TrimSpace(body)) == 0 {
		return RESTEndpointEmpty, nil
	}
	if len(body) > maximumRESTResponseBytes {
		return RESTEndpointMalformed, nil
	}
	return RESTEndpointFresh, body
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

func updateStandingsFields(cache *restCache, rows []restStanding, now time.Time) {
	cache.playerPresent = timedObserved(false, now)
	cache.playerPosition = timedMissing[standings.Position](now)
	cache.completedLaps = timedMissing[standings.CompletedLaps](now)
	cache.pitStopCount = timedMissing[pit.StopCount](now)
	for _, row := range rows {
		if !row.Player {
			continue
		}
		cache.playerPresent = timedObserved(true, now)
		cache.playerPosition = timedValidated[standings.Position](row.Position, 1, math.MaxInt32, now)
		cache.completedLaps = timedValidated[standings.CompletedLaps](row.LapsCompleted, 0, math.MaxInt32, now)
		cache.pitStopCount = timedValidated[pit.StopCount](row.Pitstops, 0, math.MaxInt32, now)
		return
	}
}

func updateSessionFields(cache *restCache, info restSessionInfo, now time.Time) {
	if strings.TrimSpace(info.TrackName) == "" {
		cache.trackName = timedMissing[string](now)
	} else {
		cache.trackName = timedObserved(info.TrackName, now)
	}
	cache.sessionType = TimedField[session.Type]{Field: parseRESTSessionType(info.Session), UpdatedUTC: now}
	cache.vehicleCount = timedValidated[schema.Count](info.NumberOfVehicles, 0, maxVehicles, now)
	if !finite(info.CurrentEventTime) || info.CurrentEventTime < 0 {
		cache.sessionInfo.Status = RESTEndpointMalformed
	}
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
	return TimedField[T]{Field: observed(value), UpdatedUTC: now}
}

func timedMissing[T comparable](now time.Time) TimedField[T] {
	return TimedField[T]{Field: schema.MissingField[T](), UpdatedUTC: now}
}

func timedValidated[T ~int32](value int32, minimum, maximum int32, now time.Time) TimedField[T] {
	if value < minimum || value > maximum {
		return TimedField[T]{Field: invalid[T](), UpdatedUTC: now}
	}
	return timedObserved(T(value), now)
}

func markRESTStale(cache *restCache, now time.Time, ttl time.Duration) {
	cache.standings = staleEndpoint(cache.standings, now, ttl)
	cache.sessionInfo = staleEndpoint(cache.sessionInfo, now, ttl)
	cache.trackName = staleTimedField(cache.trackName, now, ttl)
	cache.sessionType = staleTimedField(cache.sessionType, now, ttl)
	cache.vehicleCount = staleTimedField(cache.vehicleCount, now, ttl)
	cache.playerPresent = staleTimedField(cache.playerPresent, now, ttl)
	cache.playerPosition = staleTimedField(cache.playerPosition, now, ttl)
	cache.completedLaps = staleTimedField(cache.completedLaps, now, ttl)
	cache.pitStopCount = staleTimedField(cache.pitStopCount, now, ttl)
}

func staleEndpoint(value RESTEndpointSnapshot, now time.Time, ttl time.Duration) RESTEndpointSnapshot {
	if !value.LastSuccessUTC.IsZero() && now.Sub(value.LastSuccessUTC) > ttl && value.Status != RESTEndpointUnsupported {
		value.Status = RESTEndpointStale
	}
	return value
}

func staleTimedField[T comparable](value TimedField[T], now time.Time, ttl time.Duration) TimedField[T] {
	if value.UpdatedUTC.IsZero() || now.Sub(value.UpdatedUTC) <= ttl || value.Field.Freshness() == schema.FreshnessMissing || value.Field.Freshness() == schema.FreshnessInvalid {
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
		TrackName: cache.trackName, SessionType: cache.sessionType, VehicleCount: cache.vehicleCount,
		PlayerPresent: cache.playerPresent, PlayerPosition: cache.playerPosition,
		CompletedLaps: cache.completedLaps, PitStopCount: cache.pitStopCount,
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
