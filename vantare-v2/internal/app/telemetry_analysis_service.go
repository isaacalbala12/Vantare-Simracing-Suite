package app

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetryanalysis"
	"github.com/vantare/overlays/v2/internal/telemetryanalysis/duckdbadapter"
)

const maxTelemetryAnalysisOpenSessions = 4

var (
	ErrTelemetryAnalysisUnauthorized       = errors.New("Telemetry Analysis requires an active eligible license")
	ErrTelemetryAnalysisApprovalRequired   = errors.New("approve this discovered telemetry file before opening it")
	ErrTelemetryAnalysisCandidateUnknown   = errors.New("the discovered telemetry candidate is no longer available")
	ErrTelemetryAnalysisSessionUnknown     = errors.New("the Telemetry Analysis session is no longer open")
	ErrTelemetryAnalysisNotReady           = errors.New("the telemetry file is still active or changed; wait and discover it again")
	ErrTelemetryAnalysisRuntimeUnavailable = errors.New("the Telemetry Analysis reader is missing or damaged; repair the installation")
	ErrTelemetryAnalysisTooLarge           = errors.New("the telemetry file exceeds the configured analysis limit")
	ErrTelemetryAnalysisInvalidRequest     = errors.New("the Telemetry Analysis request is outside the configured limits")
	ErrTelemetryAnalysisIncompatible       = errors.New("the telemetry file is not compatible with this Telemetry Analysis reader")
	ErrTelemetryAnalysisBusy               = errors.New("close an open Telemetry Analysis session before opening another")
	ErrTelemetryAnalysisClosed             = errors.New("Telemetry Analysis is shutting down")
	ErrTelemetryAnalysisCleanup            = errors.New("Telemetry Analysis could not release all private resources")
)

type telemetryAnalysisAuthorizer interface {
	AllowsTelemetryAnalysis() bool
}

type telemetryAnalysisReader interface {
	telemetryanalysis.LMUDuckDBReader
	Handshake(context.Context) error
	Close() error
}

type telemetryAnalysisReaderFactory func(
	telemetryanalysis.AuthorizedHistoricalArtifact,
	telemetryanalysis.StagedHistoricalArtifact,
) (telemetryAnalysisReader, error)

// TelemetryAnalysisConfig is supplied only by the native composition root.
// No public method accepts or changes roots, runtime paths or staging paths.
type TelemetryAnalysisConfig struct {
	LMURoots             []string
	ApplicationDirectory string
	StagingRoot          string
	StabilityWindow      time.Duration
	MaxCandidates        int
	MaxSourceBytes       int64
	MaxPageRows          int
}

type TelemetryAnalysisStatus struct {
	Available bool   `json:"available"`
	Code      string `json:"code"`
}

type TelemetryAnalysisCandidate struct {
	ID         string    `json:"id"`
	State      string    `json:"state"`
	Size       int64     `json:"size"`
	ModifiedAt time.Time `json:"modifiedAt"`
	WALPresent bool      `json:"walPresent"`
}

type TelemetryAnalysisOpenRequest struct {
	CandidateID  string `json:"candidateId"`
	UserApproved bool   `json:"userApproved"`
}

type TelemetryAnalysisOpenedSession struct {
	SessionID string                              `json:"sessionId"`
	Session   telemetryanalysis.HistoricalSession `json:"session"`
}

type TelemetryAnalysisPageRequest struct {
	SessionID string `json:"sessionId"`
	ChannelID string `json:"channelId"`
	Start     int64  `json:"start"`
	Limit     int    `json:"limit"`
}

type telemetryAnalysisCandidateRecord struct {
	mu        sync.Mutex
	root      telemetryanalysis.SourceRoot
	candidate telemetryanalysis.Candidate
	tracker   *telemetryanalysis.StabilityTracker
}

type telemetryAnalysisSession struct {
	mu           sync.Mutex
	parser       *telemetryanalysis.LMUDuckDBParser
	reader       telemetryAnalysisReader
	staged       telemetryanalysis.StagedHistoricalArtifact
	retired      bool
	readerClosed bool
	stagingClean bool
	closed       bool
}

// TelemetryAnalysisService is the non-visual application boundary for the
// existing TA-02/TA-03C contracts. Paths stay inside candidate records and the
// private staging artifact; consumers receive only opaque IDs.
type TelemetryAnalysisService struct {
	cfg        TelemetryAnalysisConfig
	authorizer telemetryAnalysisAuthorizer
	metadata   telemetryanalysis.MetadataSource
	content    telemetryanalysis.ContentSource
	now        func() time.Time

	discoveryMu     sync.Mutex
	closeMu         sync.Mutex
	mu              sync.Mutex
	candidates      map[string]*telemetryAnalysisCandidateRecord
	sessions        map[string]*telemetryAnalysisSession
	pendingCleanup  map[*telemetryAnalysisSession]struct{}
	openingSessions int
	runtimeReady    bool
	readerFactory   telemetryAnalysisReaderFactory
	cleanupStaged   func(*telemetryanalysis.StagedHistoricalArtifact) error
	closed          bool
	closeCtx        context.Context
	cancelClose     context.CancelFunc
	operations      sync.WaitGroup
}

func NewTelemetryAnalysisService(cfg TelemetryAnalysisConfig, authorizer telemetryAnalysisAuthorizer) (*TelemetryAnalysisService, error) {
	if err := validateTelemetryAnalysisConfig(cfg, authorizer); err != nil {
		return nil, ErrTelemetryAnalysisInvalidRequest
	}
	if err := os.MkdirAll(cfg.StagingRoot, 0o700); err != nil {
		return nil, ErrTelemetryAnalysisInvalidRequest
	}
	stagingInfo, err := os.Lstat(cfg.StagingRoot)
	if err != nil || !stagingInfo.IsDir() || stagingInfo.Mode()&os.ModeSymlink != 0 {
		return nil, ErrTelemetryAnalysisInvalidRequest
	}

	closeCtx, cancelClose := context.WithCancel(context.Background())
	service := &TelemetryAnalysisService{
		cfg: cfg, authorizer: authorizer,
		metadata: telemetryanalysis.OSMetadataSource{}, content: telemetryanalysis.OSContentSource{},
		now: time.Now, candidates: make(map[string]*telemetryAnalysisCandidateRecord),
		sessions:       make(map[string]*telemetryAnalysisSession),
		pendingCleanup: make(map[*telemetryAnalysisSession]struct{}), closeCtx: closeCtx, cancelClose: cancelClose,
		cleanupStaged: func(staged *telemetryanalysis.StagedHistoricalArtifact) error { return staged.Cleanup() },
	}
	runtimeFiles, runtimeErr := duckdbadapter.LoadRuntime(duckdbadapter.ProductionTrust(cfg.ApplicationDirectory))
	if runtimeErr == nil {
		service.runtimeReady = true
		service.readerFactory = func(artifact telemetryanalysis.AuthorizedHistoricalArtifact, staged telemetryanalysis.StagedHistoricalArtifact) (telemetryAnalysisReader, error) {
			return duckdbadapter.NewReader(runtimeFiles, artifact, staged)
		}
	}
	return service, nil
}

func validateTelemetryAnalysisConfig(cfg TelemetryAnalysisConfig, authorizer telemetryAnalysisAuthorizer) error {
	if authorizer == nil || !cleanAbsolutePath(cfg.ApplicationDirectory) || !cleanAbsolutePath(cfg.StagingRoot) ||
		cfg.StabilityWindow <= 0 || cfg.StabilityWindow > 10*time.Minute ||
		cfg.MaxCandidates <= 0 || cfg.MaxCandidates > 256 ||
		cfg.MaxSourceBytes <= 0 || cfg.MaxSourceBytes > 8<<30 ||
		cfg.MaxPageRows <= 0 || cfg.MaxPageRows > telemetryanalysis.MaxLMUDuckDBPageRows {
		return ErrTelemetryAnalysisInvalidRequest
	}
	seen := make(map[string]struct{}, len(cfg.LMURoots))
	for _, root := range cfg.LMURoots {
		if !cleanAbsolutePath(root) {
			return ErrTelemetryAnalysisInvalidRequest
		}
		info, err := os.Lstat(root)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return ErrTelemetryAnalysisInvalidRequest
		}
		key := filepath.Clean(root)
		if _, duplicate := seen[key]; duplicate {
			return ErrTelemetryAnalysisInvalidRequest
		}
		seen[key] = struct{}{}
	}
	return nil
}

func cleanAbsolutePath(path string) bool {
	return filepath.IsAbs(path) && filepath.Clean(path) == path
}

func (service *TelemetryAnalysisService) Status() TelemetryAnalysisStatus {
	if service == nil {
		return TelemetryAnalysisStatus{Code: "closed"}
	}
	service.mu.Lock()
	defer service.mu.Unlock()
	if service.closed {
		return TelemetryAnalysisStatus{Code: "closed"}
	}
	if !service.runtimeReady {
		return TelemetryAnalysisStatus{Code: "runtime_unavailable"}
	}
	return TelemetryAnalysisStatus{Available: true, Code: "ready"}
}

func (service *TelemetryAnalysisService) Discover(ctx context.Context) ([]TelemetryAnalysisCandidate, error) {
	operationCtx, finish, err := service.begin(ctx)
	if err != nil {
		return nil, err
	}
	defer finish()
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return nil, ErrTelemetryAnalysisUnauthorized
	}
	if err := operationCtx.Err(); err != nil {
		return nil, err
	}

	service.discoveryMu.Lock()
	defer service.discoveryMu.Unlock()
	discovered := make(map[string]*telemetryAnalysisCandidateRecord)
	remaining := service.cfg.MaxCandidates
	for _, rootPath := range service.cfg.LMURoots {
		root := telemetryanalysis.SourceRoot{
			Kind: telemetryanalysis.SourceLMU, Root: rootPath,
			Format: telemetryanalysis.LMUDuckDBParserID, Extensions: []string{".duckdb"},
		}
		candidates, discoverErr := telemetryanalysis.Discover(operationCtx, service.metadata, root, remaining)
		if discoverErr != nil {
			return nil, publicTelemetryAnalysisError(discoverErr)
		}
		remaining -= len(candidates)
		for _, candidate := range candidates {
			record := service.currentCandidate(candidate.Locator)
			if record == nil || record.root.Root != root.Root {
				tracker, trackerErr := telemetryanalysis.NewStabilityTracker(service.cfg.StabilityWindow)
				if trackerErr != nil {
					return nil, ErrTelemetryAnalysisInvalidRequest
				}
				record = &telemetryAnalysisCandidateRecord{root: root, tracker: tracker}
			}
			record.mu.Lock()
			record.candidate = record.tracker.Assess(candidate, observationForCandidate(candidate, service.now()))
			record.mu.Unlock()
			discovered[candidate.Locator] = record
		}
	}

	service.mu.Lock()
	if service.closed {
		service.mu.Unlock()
		return nil, ErrTelemetryAnalysisClosed
	}
	service.candidates = discovered
	service.mu.Unlock()
	result := make([]TelemetryAnalysisCandidate, 0, len(discovered))
	for _, record := range discovered {
		record.mu.Lock()
		result = append(result, publicTelemetryAnalysisCandidate(record.candidate))
		record.mu.Unlock()
	}
	sort.Slice(result, func(i, j int) bool { return result[i].ID < result[j].ID })
	return result, nil
}

func observationForCandidate(candidate telemetryanalysis.Candidate, observedAt time.Time) telemetryanalysis.Observation {
	return telemetryanalysis.Observation{
		ObservedAt: observedAt.UTC(), Exists: true, Compatible: true,
		WALPresent: candidate.WALPresent, Size: candidate.Size, ModTime: candidate.ModTime,
	}
}

func publicTelemetryAnalysisCandidate(candidate telemetryanalysis.Candidate) TelemetryAnalysisCandidate {
	return TelemetryAnalysisCandidate{
		ID: candidate.Locator, State: string(candidate.State), Size: candidate.Size,
		ModifiedAt: candidate.ModTime, WALPresent: candidate.WALPresent,
	}
}

func (service *TelemetryAnalysisService) currentCandidate(id string) *telemetryAnalysisCandidateRecord {
	service.mu.Lock()
	defer service.mu.Unlock()
	return service.candidates[id]
}

func (service *TelemetryAnalysisService) Open(ctx context.Context, request TelemetryAnalysisOpenRequest) (opened TelemetryAnalysisOpenedSession, returnErr error) {
	operationCtx, finish, err := service.begin(ctx)
	if err != nil {
		return TelemetryAnalysisOpenedSession{}, err
	}
	defer finish()
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisUnauthorized
	}
	if !request.UserApproved {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisApprovalRequired
	}
	record := service.currentCandidate(request.CandidateID)
	if record == nil {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisCandidateUnknown
	}
	service.mu.Lock()
	tooManySessions := len(service.sessions)+service.openingSessions >= maxTelemetryAnalysisOpenSessions
	if !tooManySessions {
		service.openingSessions++
	}
	service.mu.Unlock()
	if tooManySessions {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisBusy
	}
	defer func() {
		service.mu.Lock()
		service.openingSessions--
		service.mu.Unlock()
	}()

	candidate, revalidateErr := service.revalidateCandidate(operationCtx, record)
	if revalidateErr != nil {
		return TelemetryAnalysisOpenedSession{}, revalidateErr
	}
	if !service.runtimeReady || service.readerFactory == nil {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisRuntimeUnavailable
	}
	artifact, buildErr := telemetryanalysis.BuildAuthorizedHistoricalArtifact(operationCtx, service.content, candidate, telemetryanalysis.ImportOptions{
		Storage: telemetryanalysis.StorageReference, Access: telemetryanalysis.AccessUserApproved,
		MaxBytes: service.cfg.MaxSourceBytes, ParserID: telemetryanalysis.LMUDuckDBParserID,
		ParserVersion: telemetryanalysis.LMUDuckDBParserVersion,
		Provenance:    telemetryanalysis.Provenance{Kind: telemetryanalysis.ProvenanceUser, EvidenceID: "ta03e-lmu-local-v1"},
	})
	if buildErr != nil {
		return TelemetryAnalysisOpenedSession{}, publicTelemetryAnalysisError(buildErr)
	}
	staged, stageErr := telemetryanalysis.StageAuthorizedHistoricalArtifact(operationCtx, service.content, candidate, artifact, service.cfg.StagingRoot)
	if stageErr != nil {
		return TelemetryAnalysisOpenedSession{}, publicTelemetryAnalysisError(stageErr)
	}
	ownedSession := &telemetryAnalysisSession{staged: staged}
	cleanupOwnedSession := true
	defer func() {
		if cleanupOwnedSession {
			if cleanupErr := service.cleanupOwnedSession(ownedSession); cleanupErr != nil {
				opened = TelemetryAnalysisOpenedSession{}
				returnErr = ErrTelemetryAnalysisCleanup
			}
		}
	}()

	reader, readerErr := service.readerFactory(artifact, staged)
	ownedSession.reader = reader
	if readerErr != nil {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisRuntimeUnavailable
	}
	if reader == nil {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisRuntimeUnavailable
	}
	if handshakeErr := reader.Handshake(operationCtx); handshakeErr != nil {
		return TelemetryAnalysisOpenedSession{}, publicTelemetryAnalysisError(handshakeErr)
	}
	parser, parserErr := telemetryanalysis.NewLMUDuckDBParser(artifact, reader, service.cfg.MaxPageRows)
	if parserErr != nil {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisIncompatible
	}
	session, inspectErr := parser.Inspect(operationCtx)
	if inspectErr != nil {
		return TelemetryAnalysisOpenedSession{}, publicTelemetryAnalysisError(inspectErr)
	}
	if err := operationCtx.Err(); err != nil {
		return TelemetryAnalysisOpenedSession{}, err
	}
	sessionID, idErr := newTelemetryAnalysisSessionID()
	if idErr != nil {
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisIncompatible
	}
	ownedSession.parser = parser
	service.mu.Lock()
	if service.closed {
		service.mu.Unlock()
		return TelemetryAnalysisOpenedSession{}, ErrTelemetryAnalysisClosed
	}
	service.sessions[sessionID] = ownedSession
	service.mu.Unlock()
	cleanupOwnedSession = false
	return TelemetryAnalysisOpenedSession{SessionID: sessionID, Session: session}, nil
}

func (service *TelemetryAnalysisService) revalidateCandidate(ctx context.Context, record *telemetryAnalysisCandidateRecord) (telemetryanalysis.Candidate, error) {
	record.mu.Lock()
	defer record.mu.Unlock()
	candidates, err := telemetryanalysis.Discover(ctx, service.metadata, record.root, service.cfg.MaxCandidates)
	if err != nil {
		return telemetryanalysis.Candidate{}, publicTelemetryAnalysisError(err)
	}
	for _, candidate := range candidates {
		if candidate.Locator != record.candidate.Locator {
			continue
		}
		record.candidate = record.tracker.Assess(candidate, observationForCandidate(candidate, service.now()))
		if record.candidate.State != telemetryanalysis.StateReady {
			return telemetryanalysis.Candidate{}, ErrTelemetryAnalysisNotReady
		}
		return record.candidate, nil
	}
	return telemetryanalysis.Candidate{}, ErrTelemetryAnalysisCandidateUnknown
}

func (service *TelemetryAnalysisService) ReadPage(ctx context.Context, request TelemetryAnalysisPageRequest) (telemetryanalysis.HistoricalPage, error) {
	operationCtx, finish, err := service.begin(ctx)
	if err != nil {
		return telemetryanalysis.HistoricalPage{}, err
	}
	defer finish()
	if !service.authorizer.AllowsTelemetryAnalysis() {
		return telemetryanalysis.HistoricalPage{}, ErrTelemetryAnalysisUnauthorized
	}
	if request.SessionID == "" || request.ChannelID == "" || request.Start < 0 ||
		request.Limit <= 0 || request.Limit > service.cfg.MaxPageRows {
		return telemetryanalysis.HistoricalPage{}, ErrTelemetryAnalysisInvalidRequest
	}
	service.mu.Lock()
	ownedSession := service.sessions[request.SessionID]
	service.mu.Unlock()
	if ownedSession == nil {
		return telemetryanalysis.HistoricalPage{}, ErrTelemetryAnalysisSessionUnknown
	}
	ownedSession.mu.Lock()
	if ownedSession.retired || ownedSession.closed {
		ownedSession.mu.Unlock()
		return telemetryanalysis.HistoricalPage{}, ErrTelemetryAnalysisSessionUnknown
	}
	page, readErr := ownedSession.parser.ReadPage(operationCtx, request.ChannelID, request.Start, request.Limit)
	if readErr != nil {
		ownedSession.retired = true
	}
	ownedSession.mu.Unlock()
	if readErr == nil {
		return page, nil
	}
	if cleanupErr := service.cleanupOwnedSession(ownedSession); cleanupErr != nil {
		return telemetryanalysis.HistoricalPage{}, ErrTelemetryAnalysisCleanup
	}
	service.removeSession(request.SessionID, ownedSession)
	return telemetryanalysis.HistoricalPage{}, publicTelemetryAnalysisError(readErr)
}

func (service *TelemetryAnalysisService) CloseSession(sessionID string) error {
	_, finish, err := service.begin(context.Background())
	if err != nil {
		return err
	}
	defer finish()
	if sessionID == "" {
		return ErrTelemetryAnalysisInvalidRequest
	}
	service.mu.Lock()
	ownedSession := service.sessions[sessionID]
	service.mu.Unlock()
	if ownedSession == nil {
		return ErrTelemetryAnalysisSessionUnknown
	}
	if err := service.cleanupOwnedSession(ownedSession); err != nil {
		return ErrTelemetryAnalysisCleanup
	}
	service.removeSession(sessionID, ownedSession)
	return nil
}

func (service *TelemetryAnalysisService) removeSession(id string, expected *telemetryAnalysisSession) {
	service.mu.Lock()
	if service.sessions[id] == expected {
		delete(service.sessions, id)
	}
	service.mu.Unlock()
}

func (service *TelemetryAnalysisService) removeSessionReferences(expected *telemetryAnalysisSession) {
	service.mu.Lock()
	for id, session := range service.sessions {
		if session == expected {
			delete(service.sessions, id)
		}
	}
	service.mu.Unlock()
}

func (service *TelemetryAnalysisService) cleanupOwnedSession(session *telemetryAnalysisSession) error {
	err := session.close(service.cleanupStaged)
	service.mu.Lock()
	if err != nil {
		service.pendingCleanup[session] = struct{}{}
	} else {
		delete(service.pendingCleanup, session)
	}
	service.mu.Unlock()
	return err
}

func (session *telemetryAnalysisSession) close(cleanupStaged func(*telemetryanalysis.StagedHistoricalArtifact) error) error {
	session.mu.Lock()
	defer session.mu.Unlock()
	session.retired = true
	if session.closed {
		return nil
	}
	if !session.readerClosed {
		if session.reader == nil {
			session.readerClosed = true
		} else if err := session.reader.Close(); err == nil {
			session.readerClosed = true
		}
	}
	if session.readerClosed && !session.stagingClean {
		if session.staged.Directory() == "" {
			session.stagingClean = true
		} else if err := cleanupStaged(&session.staged); err == nil {
			session.stagingClean = true
		}
	}
	session.closed = session.readerClosed && session.stagingClean
	if !session.closed {
		return ErrTelemetryAnalysisCleanup
	}
	return nil
}

func (service *TelemetryAnalysisService) begin(parent context.Context) (context.Context, func(), error) {
	if service == nil {
		return nil, nil, ErrTelemetryAnalysisClosed
	}
	service.mu.Lock()
	if service.closed {
		service.mu.Unlock()
		return nil, nil, ErrTelemetryAnalysisClosed
	}
	service.operations.Add(1)
	closeCtx := service.closeCtx
	service.mu.Unlock()
	operationCtx, cancel := context.WithCancel(parent)
	stop := context.AfterFunc(closeCtx, cancel)
	finish := func() {
		stop()
		cancel()
		service.operations.Done()
	}
	return operationCtx, finish, nil
}

// Close cancels in-flight work, waits for it to release its transient state,
// then closes every reader and removes every private staged copy.
func (service *TelemetryAnalysisService) Close() error {
	if service == nil {
		return nil
	}
	service.closeMu.Lock()
	defer service.closeMu.Unlock()

	service.mu.Lock()
	if !service.closed {
		service.closed = true
		service.cancelClose()
	}
	service.mu.Unlock()
	service.operations.Wait()

	service.mu.Lock()
	sessionSet := make(map[*telemetryAnalysisSession]struct{}, len(service.sessions)+len(service.pendingCleanup))
	for _, session := range service.sessions {
		sessionSet[session] = struct{}{}
	}
	for session := range service.pendingCleanup {
		sessionSet[session] = struct{}{}
	}
	service.candidates = make(map[string]*telemetryAnalysisCandidateRecord)
	service.mu.Unlock()

	cleanupFailed := false
	for session := range sessionSet {
		if err := service.cleanupOwnedSession(session); err != nil {
			cleanupFailed = true
			continue
		}
		service.removeSessionReferences(session)
	}
	if cleanupFailed {
		return ErrTelemetryAnalysisCleanup
	}
	return nil
}

func newTelemetryAnalysisSessionID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	return "ta-" + hex.EncodeToString(value[:]), nil
}

func publicTelemetryAnalysisError(err error) error {
	switch {
	case err == nil:
		return nil
	case errors.Is(err, context.Canceled), errors.Is(err, context.DeadlineExceeded):
		return err
	case errors.Is(err, telemetryanalysis.ErrByteLimit):
		return ErrTelemetryAnalysisTooLarge
	case errors.Is(err, telemetryanalysis.ErrNotReady), errors.Is(err, telemetryanalysis.ErrSourceChanged),
		errors.Is(err, telemetryanalysis.ErrStagingRejected):
		return ErrTelemetryAnalysisNotReady
	case errors.Is(err, duckdbadapter.ErrRuntimeUnavailable):
		return ErrTelemetryAnalysisRuntimeUnavailable
	case errors.Is(err, telemetryanalysis.ErrInvalidHistoricalCatalog), errors.Is(err, telemetryanalysis.ErrInvalidHistoricalPage),
		errors.Is(err, telemetryanalysis.ErrHistoricalSource), errors.Is(err, telemetryanalysis.ErrHistoricalArtifactChanged),
		errors.Is(err, duckdbadapter.ErrProtocol), errors.Is(err, duckdbadapter.ErrArtifactChanged):
		return ErrTelemetryAnalysisIncompatible
	default:
		return ErrTelemetryAnalysisIncompatible
	}
}
