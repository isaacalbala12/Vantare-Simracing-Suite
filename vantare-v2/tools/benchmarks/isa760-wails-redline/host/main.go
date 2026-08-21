package main

import (
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const traceContractVersion = "isa760-wails-redline-trace-v1"

//go:embed all:bundle
var benchmarkAssets embed.FS

type config struct {
	scenario string
	runID    string
	trace    string
}

type scenarioContract struct {
	sceneID string
	sha256  string
	frames  int
}

var scenarioContracts = map[string]scenarioContract{
	"overtake":   {sceneID: "standings-overtake", sha256: "9e7f791ab831762909ac832f4f7d0c19e5d012558cd0d2bc0a5505cd6f637059", frames: 115},
	"full":       {sceneID: "standings-full", sha256: "9e7f791ab831762909ac832f4f7d0c19e5d012558cd0d2bc0a5505cd6f637059", frames: 250},
	"enter":      {sceneID: "standings-car-enters", sha256: "9e7f791ab831762909ac832f4f7d0c19e5d012558cd0d2bc0a5505cd6f637059", frames: 109},
	"retirement": {sceneID: "standings-retirement", sha256: "9e7f791ab831762909ac832f4f7d0c19e5d012558cd0d2bc0a5505cd6f637059", frames: 109},
	"stress104":  {sceneID: "standings-full", sha256: "4b084cfb72078d837e1f2bb489a8d82d597d412c78c40180cd75c61b0ccbb60a", frames: 250},
}

type traceFrame struct {
	ExpectedRows int     `json:"expectedRows"`
	ObservedRows int     `json:"observedRows"`
	CommitMS     float64 `json:"commitMs"`
	LayoutMS     float64 `json:"layoutMs"`
	RAFSubmitMS  float64 `json:"rafSubmitMs"`
}

type benchmarkTrace struct {
	ContractVersion string `json:"contractVersion"`
	Complete        bool   `json:"complete"`
	RunID           string `json:"runId"`
	Scenario        string `json:"scenario"`
	SceneID         string `json:"sceneId"`
	ReplaySHA256    string `json:"replaySha256"`
	ExpectedFrames  int    `json:"expectedFrames"`
	Viewport        struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"viewport"`
	Runtime struct {
		WailsBridge bool `json:"wailsBridge"`
		FontsReady  bool `json:"fontsReady"`
	} `json:"runtime"`
	Frames []traceFrame `json:"frames"`
}

func parseConfig(arguments []string) (config, error) {
	flags := flag.NewFlagSet("wails-redline-host", flag.ContinueOnError)
	var result config
	flags.StringVar(&result.scenario, "scenario", "", "custodied benchmark scenario")
	flags.StringVar(&result.runID, "run-id", "", "unique run identifier")
	flags.StringVar(&result.trace, "trace", "", "absolute output trace path")
	if err := flags.Parse(arguments); err != nil {
		return config{}, err
	}
	if _, ok := scenarioContracts[result.scenario]; !ok {
		return config{}, fmt.Errorf("unsupported scenario %q", result.scenario)
	}
	if result.runID == "" {
		return config{}, errors.New("run-id is required")
	}
	for _, character := range result.runID {
		if (character < 'a' || character > 'z') && (character < '0' || character > '9') && character != '-' {
			return config{}, errors.New("run-id must contain only lowercase letters, digits, and hyphens")
		}
	}
	if len(result.runID) > 64 {
		return config{}, errors.New("run-id must not exceed 64 characters")
	}
	if !filepath.IsAbs(result.trace) {
		return config{}, errors.New("trace must be an absolute path")
	}
	return result, nil
}

func decodeAndValidateTrace(data any, expected config) ([]byte, error) {
	document, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("marshal trace payload: %w", err)
	}
	var trace benchmarkTrace
	if err := json.Unmarshal(document, &trace); err != nil {
		return nil, fmt.Errorf("decode trace payload: %w", err)
	}
	contract := scenarioContracts[expected.scenario]
	if trace.ContractVersion != traceContractVersion || !trace.Complete || trace.RunID != expected.runID || trace.Scenario != expected.scenario || trace.SceneID != contract.sceneID || trace.ReplaySHA256 != contract.sha256 || trace.ExpectedFrames != contract.frames || len(trace.Frames) != contract.frames || trace.Viewport.Width != 1920 || trace.Viewport.Height != 1080 || !trace.Runtime.WailsBridge || !trace.Runtime.FontsReady {
		return nil, errors.New("trace header or custody contract mismatch")
	}
	for index, frame := range trace.Frames {
		if frame.ExpectedRows <= 0 || frame.ExpectedRows != frame.ObservedRows || frame.CommitMS < 0 || frame.LayoutMS < frame.CommitMS || frame.RAFSubmitMS < frame.LayoutMS {
			return nil, fmt.Errorf("invalid frame %d", index)
		}
	}
	formatted, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("format trace payload: %w", err)
	}
	return append(formatted, '\n'), nil
}

func writeAtomic(path string, document []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create trace directory: %w", err)
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".isa760-trace-*.tmp")
	if err != nil {
		return fmt.Errorf("create temporary trace: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err := temporary.Write(document); err != nil {
		temporary.Close()
		return fmt.Errorf("write trace: %w", err)
	}
	if err := temporary.Close(); err != nil {
		return fmt.Errorf("close trace: %w", err)
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return fmt.Errorf("publish trace: %w", err)
	}
	return nil
}

func run(config config) error {
	dist, err := fs.Sub(benchmarkAssets, "bundle")
	if err != nil {
		return fmt.Errorf("open benchmark assets: %w", err)
	}
	app := application.New(application.Options{
		Name: "Vantare Wails Redline benchmark",
		Assets: application.AssetOptions{
			Handler: application.BundledAssetFileServer(dist),
		},
	})

	var resultMu sync.Mutex
	var resultErr error
	completed := false
	finish := func(err error) {
		resultMu.Lock()
		if !completed {
			completed = true
			resultErr = err
			go app.Quit()
		}
		resultMu.Unlock()
	}
	app.Event.On("benchmark:complete", func(event *application.CustomEvent) {
		document, validateErr := decodeAndValidateTrace(event.Data, config)
		if validateErr == nil {
			validateErr = writeAtomic(config.trace, document)
		}
		finish(validateErr)
	})
	app.Event.On("benchmark:failed", func(event *application.CustomEvent) {
		document, _ := json.Marshal(event.Data)
		finish(fmt.Errorf("frontend benchmark failed: %s", document))
	})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:             "Vantare Wails Redline benchmark",
		Width:             1920,
		Height:            1080,
		Frameless:         true,
		DisableResize:     true,
		AlwaysOnTop:       true,
		IgnoreMouseEvents: true,
		BackgroundType:    application.BackgroundTypeTransparent,
		BackgroundColour:  application.NewRGBA(0, 0, 0, 0),
		URL:               fmt.Sprintf("/?scenario=%s&runId=%s", config.scenario, config.runID),
	})
	window.Show()
	if err := app.Run(); err != nil {
		return fmt.Errorf("run Wails benchmark: %w", err)
	}
	resultMu.Lock()
	defer resultMu.Unlock()
	if !completed {
		return errors.New("Wails benchmark exited without a completion trace")
	}
	return resultErr
}

func main() {
	config, err := parseConfig(os.Args[1:])
	if err == nil {
		err = run(config)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
