package diagnostics

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	DefaultCaptureDuration  = 60 * time.Second
	MaxCaptureDuration      = 120 * time.Second
	DefaultCaptureBytes     = 64 << 20
	MaxCaptureBytes         = 128 << 20
	DefaultCaptureRateHz    = 5
	MaxCaptureRateHz        = 5
	DefaultCaptureRetention = 7 * 24 * time.Hour
	MaxRawFrameBytes        = 2 << 20
	defaultFrameQueue       = 8
	maxCaptureMetadataBytes = 16 << 10
)

var (
	ErrCaptureDisabled = errors.New("diagnostic raw capture is disabled")
	ErrCaptureActive   = errors.New("a diagnostic raw capture is already active")
	ErrInvalidCapture  = errors.New("invalid diagnostic raw capture configuration")
)

type CaptureState string

const (
	CaptureActive    CaptureState = "active"
	CaptureCompleted CaptureState = "completed"
	CaptureCanceled  CaptureState = "canceled"
	CaptureSizeLimit CaptureState = "size-limit"
	CaptureTimeLimit CaptureState = "time-limit"
	CaptureError     CaptureState = "error"
)

type CaptureConfig struct {
	Enabled    bool
	Duration   time.Duration
	MaxBytes   int64
	RateHz     int
	Provenance CaptureProvenance
}

type CaptureSimulator string
type CapturePayloadSchema string
type FrameIntegrity string

const (
	CaptureSimulatorLMU CaptureSimulator = "lmu"

	CapturePayloadLMUSharedMemory CapturePayloadSchema = "lmu-shared-memory-object-out"

	CapturePayloadVersionV1   uint16 = 1
	CaptureSanitizerVersionV1 uint16 = 1
	CaptureFramingVersionV1   uint16 = 1

	FrameIntegrityPending  FrameIntegrity = "pending"
	FrameIntegrityVerified FrameIntegrity = "verified"
	FrameIntegrityFailed   FrameIntegrity = "failed"
)

type CaptureProvenance struct {
	Simulator        CaptureSimulator     `json:"simulator"`
	SimulatorBuild   string               `json:"simulatorBuild"`
	Fingerprint      string               `json:"fingerprint"`
	PayloadSchema    CapturePayloadSchema `json:"payloadSchema"`
	PayloadVersion   uint16               `json:"payloadVersion"`
	SanitizerVersion uint16               `json:"sanitizerVersion"`
	FramingVersion   uint16               `json:"framingVersion"`
}

type CaptureMetadata struct {
	SchemaVersion   int               `json:"schemaVersion"`
	State           CaptureState      `json:"state"`
	StartedAtUTC    time.Time         `json:"startedAtUtc"`
	EndedAtUTC      *time.Time        `json:"endedAtUtc,omitempty"`
	FrameCount      uint64            `json:"frameCount"`
	DroppedFrames   uint64            `json:"droppedFrames"`
	Bytes           int64             `json:"bytes"`
	FramesSHA256    string            `json:"framesSha256,omitempty"`
	FramesIntegrity FrameIntegrity    `json:"framesIntegrity"`
	Provenance      CaptureProvenance `json:"provenance"`
	ErrorCode       string            `json:"errorCode,omitempty"`
}

type capturedFrame struct {
	at      time.Time
	payload []byte
}

type CaptureManager struct {
	root     string
	rootInfo os.FileInfo
	now      func() time.Time
	mu       sync.Mutex
	active   *Capture
}

func NewCaptureManager(root string) (*CaptureManager, error) {
	if root == "" || !filepath.IsAbs(root) {
		return nil, ErrInvalidCapture
	}
	root = filepath.Clean(root)
	if err := validateDiagnosticDirectoryChain(root, true); err != nil {
		return nil, ErrInvalidCapture
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return nil, fmt.Errorf("create diagnostic capture root: %w", err)
	}
	if err := validateDiagnosticDirectoryChain(root, false); err != nil {
		return nil, ErrInvalidCapture
	}
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil || !sameDiagnosticPath(root, resolved) {
		return nil, ErrInvalidCapture
	}
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || diagnosticPathComponentLinked(info) {
		return nil, ErrInvalidCapture
	}
	return &CaptureManager{root: root, rootInfo: info, now: time.Now}, nil
}

func (manager *CaptureManager) Start(
	ctx context.Context,
	config CaptureConfig,
) (*Capture, error) {
	normalized, err := normalizeCaptureConfig(config)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	manager.mu.Lock()
	defer manager.mu.Unlock()
	if manager.active != nil && !manager.active.done() {
		return nil, ErrCaptureActive
	}
	id, err := newCaptureID()
	if err != nil {
		return nil, err
	}
	if !manager.rootStable() {
		return nil, ErrInvalidCapture
	}
	directory := filepath.Join(manager.root, id)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return nil, fmt.Errorf("create diagnostic capture: %w", err)
	}
	createdInfo, err := os.Lstat(directory)
	if err != nil || !manager.rootStable() ||
		!isStableDirectChild(manager.root, directory, createdInfo) {
		_ = os.Remove(directory)
		return nil, ErrInvalidCapture
	}
	started := manager.now().Round(0).UTC()
	captureContext, cancel := context.WithCancel(ctx)
	capture := &Capture{
		config: normalized, directory: directory,
		now: manager.now, cancel: cancel,
		frames: make(chan capturedFrame, defaultFrameQueue),
		finish: make(chan CaptureState, 1), complete: make(chan struct{}),
		minInterval: time.Second / time.Duration(normalized.RateHz),
	}
	capture.metadata = CaptureMetadata{
		SchemaVersion: 1, State: CaptureActive, StartedAtUTC: started,
		FramesIntegrity: FrameIntegrityPending,
		Provenance:      normalized.Provenance,
	}
	if err := writeJSONAtomic(
		filepath.Join(directory, "metadata.json"),
		capture.metadata,
	); err != nil {
		cancel()
		_ = os.RemoveAll(directory)
		return nil, err
	}
	manager.active = capture
	go capture.run(captureContext)
	return capture, nil
}

func (manager *CaptureManager) CleanExpired(ctx context.Context, retention time.Duration) (int, error) {
	if retention == 0 {
		retention = DefaultCaptureRetention
	}
	if retention < time.Hour || retention > DefaultCaptureRetention {
		return 0, ErrInvalidCapture
	}
	entries, err := os.ReadDir(manager.root)
	if os.IsNotExist(err) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read diagnostic captures: %w", err)
	}
	cutoff := manager.now().Round(0).UTC().Add(-retention)
	removed := 0
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return removed, err
		}
		if entry.Type()&os.ModeSymlink != 0 ||
			(!strings.HasPrefix(entry.Name(), "capture-") &&
				!strings.HasPrefix(entry.Name(), ".deleting-capture-")) {
			continue
		}
		directory := filepath.Join(manager.root, entry.Name())
		info, infoErr := entry.Info()
		if infoErr != nil || !info.IsDir() ||
			!manager.rootStable() ||
			!isStableDirectChild(manager.root, directory, info) {
			continue
		}
		if strings.HasPrefix(entry.Name(), ".deleting-capture-") {
			if err := manager.removeStableDirectory(directory, info); err != nil {
				return removed, err
			}
			removed++
			continue
		}
		if manager.isActive(directory) {
			continue
		}
		metadata, metadataErr := readCaptureMetadata(filepath.Join(directory, "metadata.json"))
		expired := metadataErr == nil && metadata.StartedAtUTC.Before(cutoff)
		if metadataErr != nil {
			expired = info.ModTime().Round(0).UTC().Before(cutoff)
		}
		if !expired {
			continue
		}
		tombstoneID, err := randomOpaque("")
		if err != nil {
			return removed, err
		}
		tombstone := filepath.Join(manager.root, ".deleting-"+entry.Name()+"-"+tombstoneID)
		if !manager.rootStable() || !isStableDirectChild(manager.root, directory, info) {
			continue
		}
		if err := os.Rename(directory, tombstone); err != nil {
			return removed, fmt.Errorf("tombstone expired diagnostic capture: %w", err)
		}
		tombstoneInfo, err := os.Lstat(tombstone)
		if err != nil || !os.SameFile(info, tombstoneInfo) ||
			!isStableDirectChild(manager.root, tombstone, tombstoneInfo) {
			return removed, errors.New("diagnostic capture changed while tombstoning")
		}
		if err := manager.removeStableDirectory(tombstone, tombstoneInfo); err != nil {
			return removed, err
		}
		removed++
	}
	return removed, nil
}

func (manager *CaptureManager) rootStable() bool {
	current, err := os.Lstat(manager.root)
	return err == nil && current.IsDir() &&
		!diagnosticPathComponentLinked(current) &&
		validateDiagnosticDirectoryChain(manager.root, false) == nil &&
		diagnosticPathIsCanonical(manager.root) &&
		os.SameFile(manager.rootInfo, current)
}

func (manager *CaptureManager) isActive(directory string) bool {
	manager.mu.Lock()
	defer manager.mu.Unlock()
	return manager.active != nil && !manager.active.done() &&
		filepath.Clean(manager.active.directory) == filepath.Clean(directory)
}

func (manager *CaptureManager) removeStableDirectory(directory string, expected os.FileInfo) error {
	if !manager.rootStable() || !isStableDirectChild(manager.root, directory, expected) {
		return errors.New("diagnostic capture changed before removal")
	}
	if err := os.RemoveAll(directory); err != nil {
		return fmt.Errorf("remove expired diagnostic capture: %w", err)
	}
	return nil
}

type Capture struct {
	config      CaptureConfig
	directory   string
	now         func() time.Time
	cancel      context.CancelFunc
	frames      chan capturedFrame
	finish      chan CaptureState
	complete    chan struct{}
	finishOnce  sync.Once
	minInterval time.Duration

	offerMu     sync.Mutex
	lastOffered time.Time
	metadataMu  sync.RWMutex
	metadata    CaptureMetadata
	drops       atomic.Uint64
	stopping    atomic.Bool
}

// Offer accepts only already-sanitized bytes. It copies the input and never
// waits for disk or a slow consumer.
func (capture *Capture) Offer(at time.Time, sanitized []byte) bool {
	if len(sanitized) == 0 || len(sanitized) > MaxRawFrameBytes {
		capture.drops.Add(1)
		return false
	}
	at = at.Round(0).UTC()
	if at.IsZero() {
		capture.drops.Add(1)
		return false
	}
	capture.offerMu.Lock()
	defer capture.offerMu.Unlock()
	if capture.done() || capture.stopping.Load() {
		capture.drops.Add(1)
		return false
	}
	if !capture.lastOffered.IsZero() && at.Sub(capture.lastOffered) < capture.minInterval {
		capture.drops.Add(1)
		return false
	}
	capture.lastOffered = at
	frame := capturedFrame{at: at, payload: append([]byte(nil), sanitized...)}
	select {
	case capture.frames <- frame:
		return true
	default:
		capture.drops.Add(1)
		return false
	}
}

func (capture *Capture) Complete() { capture.finishWith(CaptureCompleted) }
func (capture *Capture) Cancel()   { capture.finishWith(CaptureCanceled) }

func (capture *Capture) finishWith(state CaptureState) {
	capture.finishOnce.Do(func() {
		capture.offerMu.Lock()
		capture.stopping.Store(true)
		capture.offerMu.Unlock()
		select {
		case capture.finish <- state:
		default:
		}
		capture.cancel()
	})
}

func (capture *Capture) Wait(ctx context.Context) (CaptureMetadata, error) {
	select {
	case <-ctx.Done():
		return CaptureMetadata{}, ctx.Err()
	case <-capture.complete:
		return capture.Metadata(), nil
	}
}

func (capture *Capture) Metadata() CaptureMetadata {
	capture.metadataMu.RLock()
	defer capture.metadataMu.RUnlock()
	result := capture.metadata
	if result.EndedAtUTC != nil {
		ended := *result.EndedAtUTC
		result.EndedAtUTC = &ended
	}
	return result
}

func (capture *Capture) done() bool {
	select {
	case <-capture.complete:
		return true
	default:
		return false
	}
}

func (capture *Capture) run(ctx context.Context) {
	state := CaptureCanceled
	var runErr error
	partPath := filepath.Join(capture.directory, "frames.part")
	finalPath := filepath.Join(capture.directory, "frames.bin")
	file, err := os.OpenFile(partPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		capture.finishRun(CaptureError, "create_frames", FrameIntegrityFailed, "")
		return
	}
	writer := bufio.NewWriterSize(file, 64*1024)
	frameHash := sha256.New()
	stream := io.MultiWriter(writer, frameHash)
	timer := time.NewTimer(capture.config.Duration)
	defer timer.Stop()
	writeFrame := func(frame capturedFrame) bool {
		frameBytes := int64(12 + len(frame.payload))
		metadata := capture.Metadata()
		if metadata.Bytes+frameBytes > capture.config.MaxBytes {
			capture.drops.Add(1)
			state = CaptureSizeLimit
			return false
		}
		header := make([]byte, 12)
		binary.LittleEndian.PutUint64(header[:8], uint64(frame.at.UnixNano()))
		binary.LittleEndian.PutUint32(header[8:], uint32(len(frame.payload)))
		if _, runErr = stream.Write(header); runErr != nil {
			state = CaptureError
			return false
		}
		if _, runErr = stream.Write(frame.payload); runErr != nil {
			state = CaptureError
			return false
		}
		capture.metadataMu.Lock()
		capture.metadata.Bytes += frameBytes
		capture.metadata.FrameCount++
		capture.metadataMu.Unlock()
		return true
	}
	drain := func() {
		for {
			select {
			case frame := <-capture.frames:
				if !writeFrame(frame) {
					return
				}
			default:
				return
			}
		}
	}
	defer func() {
		capture.offerMu.Lock()
		capture.stopping.Store(true)
		capture.offerMu.Unlock()
		for {
			select {
			case <-capture.frames:
				capture.drops.Add(1)
			default:
				goto drained
			}
		}
	drained:
		if flushErr := writer.Flush(); runErr == nil && flushErr != nil {
			runErr = flushErr
			state = CaptureError
		}
		if syncErr := file.Sync(); runErr == nil && syncErr != nil {
			runErr = syncErr
			state = CaptureError
		}
		if closeErr := file.Close(); runErr == nil && closeErr != nil {
			runErr = closeErr
			state = CaptureError
		}
		if runErr == nil {
			if renameErr := os.Rename(partPath, finalPath); renameErr != nil {
				runErr = renameErr
				state = CaptureError
			}
		}
		errorCode := ""
		integrity := FrameIntegrityVerified
		digest := hex.EncodeToString(frameHash.Sum(nil))
		if runErr != nil {
			errorCode = "storage"
			integrity = FrameIntegrityFailed
			digest = ""
		}
		capture.finishRun(state, errorCode, integrity, digest)
	}()
	for {
		select {
		case requested := <-capture.finish:
			state = requested
			drain()
			return
		case <-timer.C:
			state = CaptureTimeLimit
			return
		case <-ctx.Done():
			select {
			case requested := <-capture.finish:
				state = requested
			default:
				state = CaptureCanceled
			}
			drain()
			return
		case frame := <-capture.frames:
			if !writeFrame(frame) {
				return
			}
		}
	}
}

func (capture *Capture) finishRun(
	state CaptureState,
	errorCode string,
	integrity FrameIntegrity,
	digest string,
) {
	ended := capture.now().Round(0).UTC()
	capture.metadataMu.Lock()
	capture.metadata.State = state
	capture.metadata.EndedAtUTC = &ended
	capture.metadata.DroppedFrames = capture.drops.Load()
	capture.metadata.FramesIntegrity = integrity
	capture.metadata.FramesSHA256 = digest
	capture.metadata.ErrorCode = errorCode
	metadata := capture.metadata
	capture.metadataMu.Unlock()
	if err := writeJSONAtomic(filepath.Join(capture.directory, "metadata.json"), metadata); err != nil {
		capture.metadataMu.Lock()
		capture.metadata.State = CaptureError
		capture.metadata.ErrorCode = "metadata"
		capture.metadata.FramesIntegrity = FrameIntegrityFailed
		capture.metadata.FramesSHA256 = ""
		capture.metadataMu.Unlock()
	}
	close(capture.complete)
}

func normalizeCaptureConfig(config CaptureConfig) (CaptureConfig, error) {
	if !config.Enabled {
		return CaptureConfig{}, ErrCaptureDisabled
	}
	if config.Duration == 0 {
		config.Duration = DefaultCaptureDuration
	}
	if config.MaxBytes == 0 {
		config.MaxBytes = DefaultCaptureBytes
	}
	if config.RateHz == 0 {
		config.RateHz = DefaultCaptureRateHz
	}
	if config.Duration <= 0 || config.Duration > MaxCaptureDuration ||
		config.MaxBytes < 1 || config.MaxBytes > MaxCaptureBytes ||
		config.RateHz < 1 || config.RateHz > MaxCaptureRateHz ||
		!validCaptureProvenance(config.Provenance) {
		return CaptureConfig{}, ErrInvalidCapture
	}
	return config, nil
}

func newCaptureID() (string, error) {
	var entropy [16]byte
	if _, err := rand.Read(entropy[:]); err != nil {
		return "", fmt.Errorf("generate diagnostic capture id: %w", err)
	}
	return "capture-" + hex.EncodeToString(entropy[:]), nil
}

func writeJSONAtomic(path string, value any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal diagnostic metadata: %w", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create diagnostic metadata directory: %w", err)
	}
	file, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".tmp-*")
	if err != nil {
		return fmt.Errorf("create diagnostic metadata temp: %w", err)
	}
	temp := file.Name()
	defer os.Remove(temp)
	if err := file.Chmod(0o600); err != nil {
		file.Close()
		return fmt.Errorf("protect diagnostic metadata: %w", err)
	}
	if _, err := file.Write(encoded); err != nil {
		file.Close()
		return fmt.Errorf("write diagnostic metadata: %w", err)
	}
	if err := file.Sync(); err != nil {
		file.Close()
		return fmt.Errorf("sync diagnostic metadata: %w", err)
	}
	if err := file.Close(); err != nil {
		return fmt.Errorf("close diagnostic metadata: %w", err)
	}
	if err := diagnosticReplace(temp, path); err != nil {
		return fmt.Errorf("replace diagnostic metadata: %w", err)
	}
	if err := syncDiagnosticDirectory(filepath.Dir(path)); err != nil {
		return fmt.Errorf("sync diagnostic metadata directory: %w", err)
	}
	return nil
}

var diagnosticReplace = replaceDiagnosticAtomic

func readCaptureMetadata(path string) (CaptureMetadata, error) {
	file, err := os.Open(path)
	if err != nil {
		return CaptureMetadata{}, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() ||
		info.Size() < 1 || info.Size() > maxCaptureMetadataBytes {
		return CaptureMetadata{}, ErrInvalidCapture
	}
	data, err := io.ReadAll(io.LimitReader(file, maxCaptureMetadataBytes+1))
	if err != nil || len(data) > maxCaptureMetadataBytes {
		return CaptureMetadata{}, ErrInvalidCapture
	}
	var metadata CaptureMetadata
	if err := json.Unmarshal(data, &metadata); err != nil ||
		metadata.SchemaVersion != 1 ||
		metadata.StartedAtUTC.IsZero() ||
		metadata.StartedAtUTC.Location() != time.UTC ||
		!validCaptureState(metadata.State) ||
		!validFrameIntegrity(metadata.FramesIntegrity) ||
		!validCaptureProvenance(metadata.Provenance) ||
		(metadata.FramesSHA256 != "" && !validSHA256(metadata.FramesSHA256)) {
		return CaptureMetadata{}, ErrInvalidCapture
	}
	switch metadata.FramesIntegrity {
	case FrameIntegrityPending:
		if metadata.FramesSHA256 != "" || metadata.State != CaptureActive {
			return CaptureMetadata{}, ErrInvalidCapture
		}
	case FrameIntegrityVerified:
		if !validSHA256(metadata.FramesSHA256) || metadata.State == CaptureActive {
			return CaptureMetadata{}, ErrInvalidCapture
		}
	case FrameIntegrityFailed:
		if metadata.FramesSHA256 != "" || metadata.State != CaptureError {
			return CaptureMetadata{}, ErrInvalidCapture
		}
	}
	return metadata, nil
}

func validCaptureProvenance(value CaptureProvenance) bool {
	return value.Simulator == CaptureSimulatorLMU &&
		validSimulatorBuild(value.SimulatorBuild) &&
		validSHA256(value.Fingerprint) &&
		value.PayloadSchema == CapturePayloadLMUSharedMemory &&
		value.PayloadVersion == CapturePayloadVersionV1 &&
		value.SanitizerVersion == CaptureSanitizerVersionV1 &&
		value.FramingVersion == CaptureFramingVersionV1
}

var fourPartVersion = regexp.MustCompile(`^[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}\.[0-9]{1,5}$`)

func validSimulatorBuild(value string) bool {
	return fourPartVersion.MatchString(value)
}

func validSHA256(value string) bool {
	if len(value) != sha256.Size*2 {
		return false
	}
	decoded, err := hex.DecodeString(value)
	return err == nil && hex.EncodeToString(decoded) == value
}

func validCaptureState(value CaptureState) bool {
	switch value {
	case CaptureActive, CaptureCompleted, CaptureCanceled,
		CaptureSizeLimit, CaptureTimeLimit, CaptureError:
		return true
	default:
		return false
	}
}

func validFrameIntegrity(value FrameIntegrity) bool {
	switch value {
	case FrameIntegrityPending, FrameIntegrityVerified, FrameIntegrityFailed:
		return true
	default:
		return false
	}
}
