// Package diagnostics provides local, privacy-preserving diagnostic surfaces
// for Telemetry Core. Its exported DTOs never contain filesystem paths,
// recording session IDs, database names or telemetry values.
package diagnostics

import (
	"bytes"
	"container/heap"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/vantare/overlays/v2/internal/telemetry/recording"
)

const (
	DefaultCatalogLimit     = 100
	MaxCatalogLimit         = 500
	DefaultCatalogHandleTTL = 5 * time.Minute
	inspectionPageSize      = 256
	maxInspectionPages      = 16
	maxCatalogMetadataBytes = 32 << 10
	manifestFilename        = "manifest.json"
)

var ErrStaleCatalogHandle = errors.New("diagnostics catalog handle is stale")

type Compatibility string

const (
	CompatibilityCurrent Compatibility = "current"
	CompatibilityFuture  Compatibility = "future"
	CompatibilityCorrupt Compatibility = "corrupt"
)

type Availability string

const (
	AvailabilityReady        Availability = "ready"
	AvailabilityMetadataOnly Availability = "metadata_only"
	AvailabilityUnavailable  Availability = "unavailable"
)

type Session struct {
	Handle              string          `json:"handle"`
	Compatibility       Compatibility   `json:"compatibility"`
	Availability        Availability    `json:"availability"`
	UnavailableReason   string          `json:"unavailableReason,omitempty"`
	ManifestVersion     uint16          `json:"manifestVersion"`
	SchemaVersion       uint16          `json:"schemaVersion"`
	Simulator           string          `json:"simulator"`
	StartedAtUTC        time.Time       `json:"startedAtUtc"`
	EndedAtUTC          *time.Time      `json:"endedAtUtc,omitempty"`
	Integrity           string          `json:"integrity"`
	ObservedCount       uint64          `json:"observedCount"`
	FactCount           uint64          `json:"factCount"`
	CountsKnown         bool            `json:"countsKnown"`
	LapCount            uint64          `json:"lapCount"`
	VehicleCount        int             `json:"vehicleCount"`
	Fields              []FieldPresence `json:"fields"`
	Quality             []QualityCount  `json:"quality"`
	InspectionTruncated bool            `json:"inspectionTruncated"`
}

type ListResult struct {
	Sessions  []Session `json:"sessions"`
	Truncated bool      `json:"truncated"`
}

type FieldPresence struct {
	Name    string `json:"name"`
	Present bool   `json:"present"`
}

type QualityCount struct {
	Quality string `json:"quality"`
	Count   uint64 `json:"count"`
}

type store interface {
	Inspect(context.Context, recording.SessionRef) (recording.SessionSummary, error)
	OpenHistoricalReplay(context.Context, recording.SessionRef) (recording.HistoricalReplayReader, error)
}

type handleBinding struct {
	generation  string
	expiresAt   time.Time
	ref         recording.SessionRef
	directory   os.FileInfo
	manifest    os.FileInfo
	manifestID  [sha256.Size]byte
	database    os.FileInfo
	header      manifestHeader
	manifestErr error
	modified    time.Time
}

type catalogCandidateHeap []handleBinding

func (items catalogCandidateHeap) Len() int { return len(items) }
func (items catalogCandidateHeap) Less(left, right int) bool {
	return candidatePreferred(items[right], items[left])
}
func (items catalogCandidateHeap) Swap(left, right int) {
	items[left], items[right] = items[right], items[left]
}
func (items *catalogCandidateHeap) Push(value any) {
	*items = append(*items, value.(handleBinding))
}
func (items *catalogCandidateHeap) Pop() any {
	old := *items
	last := old[len(old)-1]
	*items = old[:len(old)-1]
	return last
}

type Catalog struct {
	root     string
	rootInfo os.FileInfo
	store    store
	now      func() time.Time
	ttl      time.Duration

	mu                sync.Mutex
	currentGeneration string
	handles           map[string]handleBinding
}

// NewCatalog accepts a trusted configuration-derived root. It is deliberately
// not exposed through a frontend contract.
func NewCatalog(root string, backend store) (*Catalog, error) {
	if root == "" || !filepath.IsAbs(root) || backend == nil {
		return nil, errors.New("invalid diagnostics catalog configuration")
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		return nil, fmt.Errorf("resolve diagnostics catalog root: %w", err)
	}
	info, err := os.Lstat(resolved)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("invalid diagnostics catalog root")
	}
	return &Catalog{
		root: resolved, rootInfo: info, store: backend, now: time.Now,
		ttl: DefaultCatalogHandleTTL, handles: make(map[string]handleBinding),
	}, nil
}

// List performs bounded metadata discovery only. It never opens SQLite and
// never scans historical records; callers must use Inspect with a current
// opaque handle for that work.
func (catalog *Catalog) List(ctx context.Context, limit int) (ListResult, error) {
	if err := ctx.Err(); err != nil {
		return ListResult{}, err
	}
	if limit == 0 {
		limit = DefaultCatalogLimit
	}
	if limit < 1 || limit > MaxCatalogLimit {
		return ListResult{}, errors.New("invalid diagnostics catalog limit")
	}
	if !catalog.rootStable() {
		return ListResult{}, ErrStaleCatalogHandle
	}
	directory, err := os.Open(catalog.root)
	if err != nil {
		return ListResult{}, fmt.Errorf("open diagnostics session catalog: %w", err)
	}
	candidates := make(catalogCandidateHeap, 0, limit)
	heap.Init(&candidates)
	candidateCount := 0
	for {
		entries, readErr := directory.ReadDir(128)
		for _, entry := range entries {
			if err := ctx.Err(); err != nil {
				directory.Close()
				return ListResult{}, err
			}
			candidate, ok := catalog.readCandidate(entry)
			if !ok {
				continue
			}
			candidateCount++
			if candidates.Len() < limit {
				heap.Push(&candidates, candidate)
				continue
			}
			if candidatePreferred(candidate, candidates[0]) {
				heap.Pop(&candidates)
				heap.Push(&candidates, candidate)
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			directory.Close()
			return ListResult{}, fmt.Errorf("read diagnostics session catalog: %w", readErr)
		}
	}
	if err := directory.Close(); err != nil {
		return ListResult{}, fmt.Errorf("close diagnostics session catalog: %w", err)
	}
	sort.Slice(candidates, func(left, right int) bool {
		return candidatePreferred(candidates[left], candidates[right])
	})
	truncated := candidateCount > limit

	generation, err := randomOpaque("generation-")
	if err != nil {
		return ListResult{}, err
	}
	expiresAt := catalog.now().Round(0).UTC().Add(catalog.ttl)
	handles := make(map[string]handleBinding, len(candidates))
	sessions := make([]Session, 0, len(candidates))
	for _, candidate := range candidates {
		handle, err := randomOpaque("diag-")
		if err != nil {
			return ListResult{}, err
		}
		candidate.generation = generation
		candidate.expiresAt = expiresAt
		handles[handle] = candidate
		sessions = append(sessions, sessionFromHeader(handle, candidate))
	}
	catalog.mu.Lock()
	catalog.currentGeneration = generation
	catalog.handles = handles
	catalog.mu.Unlock()
	return ListResult{Sessions: sessions, Truncated: truncated}, nil
}

func candidatePreferred(left, right handleBinding) bool {
	leftTime := left.header.StartedAtUTC
	if leftTime.IsZero() {
		leftTime = left.modified
	}
	rightTime := right.header.StartedAtUTC
	if rightTime.IsZero() {
		rightTime = right.modified
	}
	if !leftTime.Equal(rightTime) {
		return leftTime.After(rightTime)
	}
	return left.ref.SessionID < right.ref.SessionID
}

// Inspect is the only catalog operation allowed to open historical storage.
// It revalidates the current generation and stable filesystem identities
// before and after every backend operation.
func (catalog *Catalog) Inspect(ctx context.Context, handle string) (Session, error) {
	if err := ctx.Err(); err != nil {
		return Session{}, err
	}
	binding, ok := catalog.resolveBinding(handle)
	if !ok {
		return Session{}, ErrStaleCatalogHandle
	}
	base := sessionFromHeader(handle, binding)
	if binding.manifestErr != nil ||
		base.Compatibility == CompatibilityFuture {
		return base, nil
	}
	if !catalog.bindingStable(binding) {
		return Session{}, ErrStaleCatalogHandle
	}
	summary, err := catalog.store.Inspect(ctx, binding.ref)
	if err != nil {
		if ctx.Err() != nil {
			return Session{}, ctx.Err()
		}
		base.Availability = AvailabilityUnavailable
		base.UnavailableReason = "inspection_failed"
		return base, nil
	}
	if !catalog.bindingStable(binding) {
		return Session{}, ErrStaleCatalogHandle
	}
	session := sessionFromSummary(handle, summary)
	if session.Compatibility == CompatibilityCurrent && session.CountsKnown {
		if err := catalog.inspectFields(ctx, binding, &session); err != nil {
			return Session{}, err
		}
	}
	if !catalog.bindingStable(binding) {
		return Session{}, ErrStaleCatalogHandle
	}
	return session, nil
}

func (catalog *Catalog) Resolve(handle string) (recording.SessionRef, bool) {
	binding, ok := catalog.resolveBinding(handle)
	if !ok {
		return recording.SessionRef{}, false
	}
	return binding.ref, true
}

func (catalog *Catalog) resolveBinding(handle string) (handleBinding, bool) {
	now := catalog.now().Round(0).UTC()
	catalog.mu.Lock()
	binding, ok := catalog.handles[handle]
	current := catalog.currentGeneration
	if !ok || binding.generation != current || !now.Before(binding.expiresAt) {
		if ok {
			delete(catalog.handles, handle)
		}
		catalog.mu.Unlock()
		return handleBinding{}, false
	}
	catalog.mu.Unlock()
	if !catalog.bindingStable(binding) {
		catalog.mu.Lock()
		delete(catalog.handles, handle)
		catalog.mu.Unlock()
		return handleBinding{}, false
	}
	return binding, true
}

func (catalog *Catalog) readCandidate(entry os.DirEntry) (handleBinding, bool) {
	if entry.Type()&os.ModeSymlink != 0 {
		return handleBinding{}, false
	}
	directoryInfo, err := entry.Info()
	if err != nil || !directoryInfo.IsDir() {
		return handleBinding{}, false
	}
	directory := filepath.Join(catalog.root, entry.Name())
	if !isStableDirectChild(catalog.root, directory, directoryInfo) {
		return handleBinding{}, false
	}
	manifestPath := filepath.Join(directory, manifestFilename)
	manifestLstat, err := os.Lstat(manifestPath)
	if err != nil || !manifestLstat.Mode().IsRegular() ||
		manifestLstat.Mode()&os.ModeSymlink != 0 {
		return handleBinding{}, false
	}
	file, err := os.Open(manifestPath)
	if err != nil {
		return handleBinding{}, false
	}
	manifestInfo, statErr := file.Stat()
	if statErr != nil || !sameFileEvidence(manifestLstat, manifestInfo) ||
		!manifestInfo.Mode().IsRegular() ||
		manifestInfo.Size() < 1 || manifestInfo.Size() > maxCatalogMetadataBytes {
		file.Close()
		headerErr := recording.ErrInvalidManifest
		if statErr != nil {
			headerErr = statErr
		}
		return handleBinding{
			ref:       recording.SessionRef{Root: catalog.root, SessionID: entry.Name()},
			directory: directoryInfo, manifest: manifestInfo,
			manifestErr: headerErr, modified: directoryInfo.ModTime().Round(0).UTC(),
		}, manifestInfo != nil
	}
	header, manifestID, headerErr := decodeManifestHeader(
		file,
		manifestInfo,
	)
	closeErr := file.Close()
	if headerErr == nil && closeErr != nil {
		headerErr = closeErr
	}
	var databaseInfo os.FileInfo
	if headerErr == nil &&
		header.ManifestVersion <= recording.ManifestVersionV1 &&
		header.RecordingSchemaVersion <= uint16(recording.RecordingVersionV1) {
		if filepath.IsAbs(header.ActiveDatabase) ||
			filepath.Base(header.ActiveDatabase) != header.ActiveDatabase ||
			header.ActiveDatabase != recording.ActiveDatabaseV1 {
			headerErr = recording.ErrInvalidManifest
		} else {
			databasePath := filepath.Join(directory, header.ActiveDatabase)
			info, databaseErr := os.Lstat(databasePath)
			if databaseErr != nil || !info.Mode().IsRegular() ||
				info.Mode()&os.ModeSymlink != 0 {
				headerErr = recording.ErrInvalidManifest
			} else {
				databaseInfo = info
			}
		}
	}
	return handleBinding{
		ref:       recording.SessionRef{Root: catalog.root, SessionID: entry.Name()},
		directory: directoryInfo, manifest: manifestInfo, manifestID: manifestID,
		database: databaseInfo, header: header,
		manifestErr: headerErr, modified: directoryInfo.ModTime().Round(0).UTC(),
	}, true
}

func (catalog *Catalog) rootStable() bool {
	current, err := os.Lstat(catalog.root)
	return err == nil && current.IsDir() &&
		current.Mode()&os.ModeSymlink == 0 &&
		os.SameFile(catalog.rootInfo, current)
}

func (catalog *Catalog) bindingStable(binding handleBinding) bool {
	if !catalog.rootStable() {
		return false
	}
	directory := filepath.Join(catalog.root, binding.ref.SessionID)
	if !isStableDirectChild(catalog.root, directory, binding.directory) {
		return false
	}
	manifest, err := os.Lstat(filepath.Join(directory, manifestFilename))
	if err != nil || !manifest.Mode().IsRegular() ||
		manifest.Mode()&os.ModeSymlink != 0 ||
		binding.manifest == nil || !sameFileEvidence(binding.manifest, manifest) {
		return false
	}
	file, err := os.Open(filepath.Join(directory, manifestFilename))
	if err != nil {
		return false
	}
	_, manifestID, readErr := decodeManifestHeader(file, manifest)
	closeErr := file.Close()
	if readErr != nil || closeErr != nil || manifestID != binding.manifestID {
		return false
	}
	if binding.header.ManifestVersion > recording.ManifestVersionV1 ||
		binding.header.RecordingSchemaVersion > uint16(recording.RecordingVersionV1) ||
		binding.manifestErr != nil {
		return true
	}
	database, err := os.Lstat(filepath.Join(directory, binding.header.ActiveDatabase))
	// The handle binds the session and database file identity/path, not an
	// immutable SQLite revision. A live recording may legitimately mutate the
	// database; Store validates its contents and snapshot invariants.
	return err == nil && database.Mode().IsRegular() &&
		database.Mode()&os.ModeSymlink == 0 &&
		binding.database != nil && os.SameFile(binding.database, database)
}

func sameFileEvidence(expected, current os.FileInfo) bool {
	return os.SameFile(expected, current) &&
		expected.Size() == current.Size() &&
		expected.ModTime().Equal(current.ModTime())
}

func isStableDirectChild(root, candidate string, expected os.FileInfo) bool {
	current, err := os.Lstat(candidate)
	if err != nil || diagnosticPathComponentLinked(current) ||
		expected == nil || !os.SameFile(expected, current) {
		return false
	}
	resolved, err := filepath.EvalSymlinks(candidate)
	if err != nil {
		return false
	}
	return sameDiagnosticPath(resolved, candidate) &&
		filepath.Clean(filepath.Dir(candidate)) == filepath.Clean(root)
}

func (catalog *Catalog) inspectFields(
	ctx context.Context,
	binding handleBinding,
	session *Session,
) error {
	if !catalog.bindingStable(binding) {
		return ErrStaleCatalogHandle
	}
	reader, err := catalog.store.OpenHistoricalReplay(ctx, binding.ref)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		session.Availability = AvailabilityUnavailable
		session.UnavailableReason = "historical_unavailable"
		return nil
	}
	defer reader.Close()
	snapshot := reader.Snapshot()
	query := recording.HistoricalQuery{
		SnapshotID: snapshot.ID,
		Limit:      inspectionPageSize,
	}
	presence := map[string]bool{
		"speed": false, "throttle": false, "brake": false,
		"gear": false, "pit": false, "factValue": false,
	}
	quality := make(map[recording.Quality]uint64)
	vehicles := make(map[uint16]struct{})
	var pages int
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		page, err := reader.QueryPage(ctx, query)
		if err != nil {
			if ctx.Err() != nil {
				return ctx.Err()
			}
			session.Availability = AvailabilityUnavailable
			session.UnavailableReason = "historical_unavailable"
			return nil
		}
		for _, record := range page.Records {
			if record.Observed != nil {
				for _, vehicle := range record.Observed.Vehicles {
					vehicles[vehicle.SessionSlot] = struct{}{}
					markVehiclePresence(presence, vehicle.Presence)
					quality[vehicle.Quality]++
				}
			}
			if record.Fact != nil {
				if record.Fact.FactType == recording.FactLapCompleted {
					session.LapCount++
				}
				if record.Fact.Presence&recording.PresenceFactValue != 0 {
					presence["factValue"] = true
				}
				quality[record.Fact.Quality]++
			}
		}
		pages++
		if page.Next == nil {
			break
		}
		if pages >= maxInspectionPages {
			session.InspectionTruncated = true
			break
		}
		query.After = page.Next
	}
	session.VehicleCount = len(vehicles)
	session.Fields = sortedPresence(presence)
	session.Quality = sortedQuality(quality)
	return nil
}

type manifestHeader struct {
	ManifestVersion        uint16     `json:"manifestVersion"`
	RecordingSchemaVersion uint16     `json:"recordingSchemaVersion"`
	SimulatorID            string     `json:"simulatorID"`
	IntegrityState         string     `json:"integrityState"`
	StartedAtUTC           time.Time  `json:"startedAtUTC"`
	EndedAtUTC             *time.Time `json:"endedAtUTC,omitempty"`
	ActiveDatabase         string     `json:"activeDatabase"`
}

func decodeManifestHeader(
	file *os.File,
	expected os.FileInfo,
) (manifestHeader, [sha256.Size]byte, error) {
	var zero [sha256.Size]byte
	if expected == nil ||
		expected.Size() < 1 ||
		expected.Size() > maxCatalogMetadataBytes {
		return manifestHeader{}, zero, recording.ErrInvalidManifest
	}
	before, err := file.Stat()
	if err != nil || !sameFileEvidence(expected, before) {
		return manifestHeader{}, zero, recording.ErrInvalidManifest
	}
	data, err := io.ReadAll(io.LimitReader(file, maxCatalogMetadataBytes+1))
	if err != nil {
		return manifestHeader{}, zero, err
	}
	if len(data) < 1 || len(data) > maxCatalogMetadataBytes {
		return manifestHeader{}, zero, recording.ErrInvalidManifest
	}
	after, err := file.Stat()
	if err != nil || !sameFileEvidence(before, after) {
		return manifestHeader{}, zero, recording.ErrInvalidManifest
	}
	identity := sha256.Sum256(data)
	decoder := json.NewDecoder(bytes.NewReader(data))
	var header manifestHeader
	if err := decoder.Decode(&header); err != nil ||
		header.ManifestVersion == 0 ||
		header.RecordingSchemaVersion == 0 {
		return header, identity, recording.ErrInvalidManifest
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return header, identity, recording.ErrInvalidManifest
	}
	return header, identity, nil
}

func sessionFromHeader(handle string, binding handleBinding) Session {
	header := binding.header
	if binding.manifestErr != nil {
		return corruptSession(handle, header, binding.modified)
	}
	compatibility := CompatibilityCurrent
	availability := AvailabilityReady
	if header.ManifestVersion > recording.ManifestVersionV1 ||
		header.RecordingSchemaVersion > uint16(recording.RecordingVersionV1) {
		compatibility = CompatibilityFuture
		availability = AvailabilityMetadataOnly
	}
	return Session{
		Handle: handle, Compatibility: compatibility, Availability: availability,
		ManifestVersion: header.ManifestVersion,
		SchemaVersion:   header.RecordingSchemaVersion,
		Simulator:       closedSimulator(header.SimulatorID),
		StartedAtUTC:    header.StartedAtUTC.Round(0).UTC(),
		EndedAtUTC:      cloneTime(header.EndedAtUTC),
		Integrity:       closedIntegrity(header.IntegrityState),
		Fields:          []FieldPresence{}, Quality: []QualityCount{},
	}
}

func sessionFromSummary(handle string, summary recording.SessionSummary) Session {
	manifest := summary.Manifest
	compatibility := CompatibilityCurrent
	availability := AvailabilityReady
	if manifest.ManifestVersion > recording.ManifestVersionV1 ||
		manifest.RecordingSchemaVersion > recording.RecordingVersionV1 {
		compatibility = CompatibilityFuture
		availability = AvailabilityMetadataOnly
	}
	return Session{
		Handle: handle, Compatibility: compatibility, Availability: availability,
		ManifestVersion: manifest.ManifestVersion,
		SchemaVersion:   uint16(manifest.RecordingSchemaVersion),
		Simulator:       closedSimulator(manifest.SimulatorID),
		StartedAtUTC:    manifest.StartedAtUTC.Round(0).UTC(),
		EndedAtUTC:      cloneTime(manifest.EndedAtUTC),
		Integrity:       closedIntegrity(string(summary.EffectiveIntegrity)),
		ObservedCount:   summary.ObservedCount, FactCount: summary.FactCount,
		CountsKnown: summary.CountsKnown,
		Fields:      []FieldPresence{}, Quality: []QualityCount{},
	}
}

func corruptSession(handle string, header manifestHeader, modified time.Time) Session {
	started := header.StartedAtUTC
	if started.IsZero() {
		started = modified
	}
	return Session{
		Handle: handle, Compatibility: CompatibilityCorrupt,
		Availability: AvailabilityUnavailable, UnavailableReason: "invalid_manifest",
		ManifestVersion: header.ManifestVersion,
		SchemaVersion:   header.RecordingSchemaVersion,
		Simulator:       closedSimulator(header.SimulatorID),
		StartedAtUTC:    started.Round(0).UTC(),
		Integrity:       "unknown", Fields: []FieldPresence{}, Quality: []QualityCount{},
	}
}

func markVehiclePresence(fields map[string]bool, presence uint64) {
	for name, bit := range map[string]uint64{
		"speed": recording.PresenceSpeed, "throttle": recording.PresenceThrottle,
		"brake": recording.PresenceBrake, "gear": recording.PresenceGear,
		"pit": recording.PresencePit,
	} {
		if presence&bit != 0 {
			fields[name] = true
		}
	}
}

func sortedPresence(values map[string]bool) []FieldPresence {
	names := make([]string, 0, len(values))
	for name := range values {
		names = append(names, name)
	}
	sort.Strings(names)
	result := make([]FieldPresence, 0, len(names))
	for _, name := range names {
		result = append(result, FieldPresence{Name: name, Present: values[name]})
	}
	return result
}

func sortedQuality(values map[recording.Quality]uint64) []QualityCount {
	names := []recording.Quality{
		recording.QualityUnknown, recording.QualityCurrent, recording.QualityStale,
		recording.QualityMissing, recording.QualityInvalid,
	}
	result := make([]QualityCount, 0, len(names))
	for _, quality := range names {
		if values[quality] != 0 {
			result = append(result, QualityCount{
				Quality: qualityName(quality), Count: values[quality],
			})
		}
	}
	return result
}

func qualityName(value recording.Quality) string {
	switch value {
	case recording.QualityCurrent:
		return "current"
	case recording.QualityStale:
		return "stale"
	case recording.QualityMissing:
		return "missing"
	case recording.QualityInvalid:
		return "invalid"
	default:
		return "unknown"
	}
}

func closedSimulator(value string) string {
	switch value {
	case "lmu", "iracing", "assetto-corsa", "assetto-corsa-evo",
		"assetto-corsa-competizione", "automobilista-2":
		return value
	default:
		return "unknown"
	}
}

func closedIntegrity(value string) string {
	switch recording.IntegrityState(value) {
	case recording.IntegrityOpening, recording.IntegrityRecording,
		recording.IntegrityComplete, recording.IntegrityIncomplete,
		recording.IntegrityRecovering:
		return value
	default:
		return "unknown"
	}
}

func cloneTime(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	copy := value.Round(0).UTC()
	return &copy
}

func randomOpaque(prefix string) (string, error) {
	var entropy [16]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return "", fmt.Errorf("generate diagnostics catalog handle: %w", err)
	}
	return prefix + hex.EncodeToString(entropy[:]), nil
}
