//go:build windows

// This test-only producer replays audited LMU bytes through a private Windows
// mapping and loopback REST endpoint. It is never used by the product runtime.
package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"github.com/vantare/overlays/v2/internal/telemetry/drivers/lmu"
)

const corpusSchema = "vantare.lmu-temporal-high-rate.v1"
const restSchema = "vantare.lmu-rest-bodies.v1"
const mappingPrefix = "vantare-telemetry-bench-"
const pageReadWrite = 0x04
const fileMapWrite = 0x0002

var kernel32 = syscall.NewLazyDLL("kernel32.dll")
var createFileMappingW = kernel32.NewProc("CreateFileMappingW")
var mapViewOfFile = kernel32.NewProc("MapViewOfFile")
var unmapViewOfFile = kernel32.NewProc("UnmapViewOfFile")
var closeHandle = kernel32.NewProc("CloseHandle")

type event struct {
	Kind      string        `json:"kind"`
	Index     int           `json:"index"`
	AtUTC     string        `json:"atUtc"`
	File      string        `json:"file"`
	SHA256    string        `json:"sha256"`
	Bytes     []byte        `json:"-"`
	Due       time.Duration `json:"-"`
	Standings []byte        `json:"-"`
	Session   []byte        `json:"-"`
}

type manifest struct {
	Schema      string  `json:"schema"`
	Build       string  `json:"build"`
	Vehicles    int     `json:"vehicles"`
	SHMTicks    int     `json:"shmTicks"`
	RESTReports int     `json:"restReports"`
	Events      []event `json:"events"`
}

type restBodies struct {
	Schema      string          `json:"schema"`
	Standings   json.RawMessage `json:"standings"`
	SessionInfo json.RawMessage `json:"sessionInfo"`
}

func loadCorpus(dir string) (manifest, error) {
	data, err := os.ReadFile(filepath.Join(dir, "manifest.json"))
	if err != nil {
		return manifest{}, err
	}
	var capture manifest
	if err := json.Unmarshal(data, &capture); err != nil {
		return manifest{}, err
	}
	if capture.Schema != corpusSchema || capture.Build != "1.4.2.0" || capture.Vehicles < 46 ||
		capture.Vehicles > 104 || capture.SHMTicks != 3600 || capture.RESTReports != 239 ||
		len(capture.Events) != capture.SHMTicks+capture.RESTReports {
		return manifest{}, errors.New("unexpected audited LMU47 manifest")
	}
	first, err := time.Parse(time.RFC3339Nano, capture.Events[0].AtUTC)
	if err != nil {
		return manifest{}, err
	}
	var shm, rest int
	var previous time.Duration
	for index := range capture.Events {
		item := &capture.Events[index]
		at, err := time.Parse(time.RFC3339Nano, item.AtUTC)
		if err != nil {
			return manifest{}, fmt.Errorf("event %d timestamp: %w", index, err)
		}
		item.Due = at.Sub(first)
		if item.Due < previous || item.Due > 61*time.Second {
			return manifest{}, fmt.Errorf("event %d clock invalid", index)
		}
		previous = item.Due
		switch item.Kind {
		case "shm":
			if item.Index != shm || item.File != fmt.Sprintf("shm-%05d.bin", shm) {
				return manifest{}, fmt.Errorf("event %d SHM order invalid", index)
			}
			shm++
		case "rest":
			if item.Index != rest || item.File != fmt.Sprintf("rest-%05d.json", rest) {
				return manifest{}, fmt.Errorf("event %d REST order invalid", index)
			}
			rest++
		default:
			return manifest{}, fmt.Errorf("event %d kind invalid", index)
		}
		item.Bytes, err = os.ReadFile(filepath.Join(dir, item.File))
		if err != nil {
			return manifest{}, fmt.Errorf("event %d file: %w", index, err)
		}
		hash := sha256.Sum256(item.Bytes)
		if hex.EncodeToString(hash[:]) != item.SHA256 {
			return manifest{}, fmt.Errorf("event %d hash mismatch", index)
		}
		if item.Kind == "shm" && len(item.Bytes) != lmu.ObjectOutSize {
			return manifest{}, fmt.Errorf("event %d SHM size invalid", index)
		}
		if item.Kind == "rest" {
			var bodies restBodies
			if err := json.Unmarshal(item.Bytes, &bodies); err != nil || bodies.Schema != restSchema ||
				len(bodies.Standings) == 0 || len(bodies.SessionInfo) == 0 {
				return manifest{}, fmt.Errorf("event %d REST bodies invalid: %v", index, err)
			}
			item.Standings, item.Session = bodies.Standings, bodies.SessionInfo
		}
	}
	if capture.Events[0].Kind != "shm" || shm != capture.SHMTicks || rest != capture.RESTReports || previous < 59*time.Second {
		return manifest{}, errors.New("incomplete audited LMU47 sequence")
	}
	return capture, nil
}

type mapping struct {
	handle uintptr
	view   uintptr
	bytes  []byte
}

func createMapping(name string) (*mapping, error) {
	wide, err := syscall.UTF16PtrFromString(name)
	if err != nil {
		return nil, err
	}
	handle, _, callErr := createFileMappingW.Call(^uintptr(0), 0, pageReadWrite, 0, lmu.ObjectOutSize, uintptr(unsafe.Pointer(wide)))
	if handle == 0 {
		return nil, fmt.Errorf("create private mapping: %w", callErr)
	}
	view, _, callErr := mapViewOfFile.Call(handle, fileMapWrite, 0, 0, lmu.ObjectOutSize)
	if view == 0 {
		closeHandle.Call(handle)
		return nil, fmt.Errorf("map private view: %w", callErr)
	}
	return &mapping{handle: handle, view: view, bytes: unsafe.Slice((*byte)(unsafe.Add(unsafe.Pointer(nil), view)), lmu.ObjectOutSize)}, nil
}

func (m *mapping) close() error {
	var errs []error
	if result, _, err := unmapViewOfFile.Call(m.view); result == 0 {
		errs = append(errs, fmt.Errorf("unmap private view: %w", err))
	}
	if result, _, err := closeHandle.Call(m.handle); result == 0 {
		errs = append(errs, fmt.Errorf("close private mapping: %w", err))
	}
	return errors.Join(errs...)
}

func newMappingName() (string, error) {
	var token [8]byte
	if _, err := rand.Read(token[:]); err != nil {
		return "", err
	}
	return mappingPrefix + hex.EncodeToString(token[:]), nil
}

type restServer struct {
	mu        sync.RWMutex
	standings []byte
	session   []byte
}

func (server *restServer) update(standings, session []byte) {
	server.mu.Lock()
	server.standings, server.session = standings, session
	server.mu.Unlock()
}

func (server *restServer) serve(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet || r.URL.RawQuery != "" {
		http.Error(w, "invalid request", http.StatusBadRequest)
		return
	}
	var body []byte
	server.mu.RLock()
	switch r.URL.Path {
	case "/rest/watch/standings":
		body = server.standings
	case "/rest/watch/sessionInfo":
		body = server.session
	default:
		server.mu.RUnlock()
		http.NotFound(w, r)
		return
	}
	server.mu.RUnlock()
	w.Header().Set("Content-Type", "application/json")
	if _, err := w.Write(body); err != nil {
		fmt.Fprintln(os.Stderr, "REST test response failed:", err)
	}
}

func run(dir string) (runErr error) {
	capture, err := loadCorpus(dir)
	if err != nil {
		return err
	}
	name, err := newMappingName()
	if err != nil {
		return err
	}
	m, err := createMapping(name)
	if err != nil {
		return err
	}
	defer func() { runErr = errors.Join(runErr, m.close()) }()
	copy(m.bytes, capture.Events[0].Bytes)
	server := new(restServer)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	defer func() {
		if err := listener.Close(); err != nil && !errors.Is(err, net.ErrClosed) {
			runErr = errors.Join(runErr, err)
		}
	}()
	httpServer := &http.Server{Handler: http.HandlerFunc(server.serve), ReadHeaderTimeout: time.Second}
	serverDone := make(chan error, 1)
	go func() { serverDone <- httpServer.Serve(listener) }()
	ready := struct {
		Mapping string `json:"mapping"`
		Port    int    `json:"port"`
		Events  int    `json:"events"`
	}{name, listener.Addr().(*net.TCPAddr).Port, len(capture.Events)}
	if err := json.NewEncoder(os.Stdout).Encode(ready); err != nil {
		return err
	}
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil || strings.TrimSpace(line) != "start" {
		return errors.New("benchmark start handshake missing")
	}
	started := time.Now()
	var shm, rest int
	for _, item := range capture.Events {
		if wait := time.Until(started.Add(item.Due)); wait > 0 {
			time.Sleep(wait)
		}
		if item.Kind == "shm" {
			copy(m.bytes, item.Bytes)
			shm++
		} else {
			server.update(item.Standings, item.Session)
			rest++
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := httpServer.Shutdown(ctx); err != nil {
		return err
	}
	if err := <-serverDone; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(struct {
		SHM  int   `json:"shm"`
		REST int   `json:"rest"`
		Wall int64 `json:"wallMs"`
	}{shm, rest, time.Since(started).Milliseconds()})
}

func main() {
	dir := flag.String("corpus", "", "audited extracted LMU47 corpus directory")
	flag.Parse()
	if *dir == "" {
		fmt.Fprintln(os.Stderr, "-corpus is required")
		os.Exit(2)
	}
	if err := run(*dir); err != nil {
		fmt.Fprintln(os.Stderr, "benchmark source failed:", err)
		os.Exit(1)
	}
}
