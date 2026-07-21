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
	SourceTime     TimedField[time.Duration]
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
	return &http.Client{Transport: transport, CheckRedirect: rejectRESTRedirect}
}

func rejectRESTRedirect(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }

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
	} else if client, ok := copy.client.(*http.Client); ok {
		clone := *client
		clone.CheckRedirect = rejectRESTRedirect
		copy.client = &clone
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
	sourceTime     TimedField[time.Duration]
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
			updateStandingsFields(&next, rows, standingsResponse.receivedUTC)
			cache.applyStandings(next)
			cache.standings.LastSuccessUTC = standingsResponse.receivedUTC
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
			if validationErr := cache.acceptSession(info, sessionResponse.receivedUTC); validationErr != nil {
				cache.sessionInfo.Status = RESTEndpointMalformed
			}
		}
	}

	snapshotUTC := restNow(cfg)
	markRESTStale(cache, snapshotUTC, cfg.ttl)
	rest := cache.snapshot()
	rest.Status = overallRESTStatus(rest)
	return Observation{Source: SourceREST, ReceivedUTC: snapshotUTC, REST: rest}, rest.Status == RESTStatusLive
}

type restResponse struct {
	status       RESTEndpointStatus
	body         []byte
	attemptedUTC time.Time
	receivedUTC  time.Time
}

func fetchREST(parent context.Context, cfg *restConfig, path string) restResponse {
	result := restResponse{attemptedUTC: restNow(cfg)}
	target, err := url.Parse(cfg.baseURL + path)
	if err != nil || !isLoopbackHTTP(target) {
		result.status = RESTEndpointMalformed
		result.receivedUTC = restNow(cfg)
		return result
	}
	ctx, cancel := context.WithTimeout(parent, cfg.deadline)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		result.status = RESTEndpointMalformed
		result.receivedUTC = restNow(cfg)
		return result
	}
	resp, err := cfg.client.Do(req)
	if err != nil {
		result.receivedUTC = restNow(cfg)
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
	result.receivedUTC = restNow(cfg)
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
	result.receivedUTC = restNow(cfg)
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

func restNow(cfg *restConfig) time.Time { return cfg.now().Round(0).UTC() }

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

func (cache *restCache) applyStandings(next restCache) {
	cache.playerPresent = next.playerPresent
	cache.playerPosition = next.playerPosition
	cache.completedLaps = next.completedLaps
	cache.pitStopCount = next.pitStopCount
}

type sessionFields struct {
	trackName    TimedField[string]
	sourceTime   TimedField[time.Duration]
	sessionType  TimedField[session.Type]
	vehicleCount TimedField[schema.Count]
}

func validateSessionFields(info restSessionInfo, now time.Time) (sessionFields, error) {
	if !finite(info.CurrentEventTime) || info.CurrentEventTime < 0 || info.CurrentEventTime > float64(math.MaxInt64)/float64(time.Second) {
		return sessionFields{}, errors.New("invalid LMU REST current event time")
	}
	fields := sessionFields{
		sourceTime:   timedObserved(time.Duration(info.CurrentEventTime*float64(time.Second)), now),
		sessionType:  TimedField[session.Type]{Field: parseRESTSessionType(info.Session), UpdatedUTC: now},
		vehicleCount: timedValidated[schema.Count](info.NumberOfVehicles, 0, maxVehicles, now),
	}
	if strings.TrimSpace(info.TrackName) == "" {
		fields.trackName = timedMissing[string](now)
	} else {
		fields.trackName = timedObserved(info.TrackName, now)
	}
	return fields, nil
}

func (cache *restCache) applySession(fields sessionFields) {
	cache.trackName = fields.trackName
	cache.sourceTime = fields.sourceTime
	cache.sessionType = fields.sessionType
	cache.vehicleCount = fields.vehicleCount
}

func (cache *restCache) acceptSession(info restSessionInfo, receivedUTC time.Time) error {
	fields, err := validateSessionFields(info, receivedUTC)
	if err != nil {
		return err
	}
	cache.applySession(fields)
	cache.sessionInfo.LastSuccessUTC = receivedUTC
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
	cache.sourceTime = staleTimedField(cache.sourceTime, now, ttl)
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
		TrackName: cache.trackName, SourceTime: cache.sourceTime, SessionType: cache.sessionType, VehicleCount: cache.vehicleCount,
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
