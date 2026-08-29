package sensor

import (
	"bufio"
	"context"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

type commandRunner interface {
	Output(context.Context, string, ...string) ([]byte, error)
	Start(context.Context, string, []string, io.Writer, io.Writer) (processHandle, error)
}

type processHandle interface {
	Wait() error
	Kill() error
}

type execRunner struct{}
type execHandle struct{ command *exec.Cmd }

func (execRunner) Output(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).CombinedOutput()
}
func (execRunner) Start(ctx context.Context, name string, args []string, stdout, stderr io.Writer) (processHandle, error) {
	command := exec.CommandContext(ctx, name, args...)
	command.Stdout, command.Stderr = stdout, stderr
	if err := command.Start(); err != nil {
		return nil, err
	}
	return execHandle{command}, nil
}
func (handle execHandle) Wait() error { return handle.command.Wait() }
func (handle execHandle) Kill() error {
	if handle.command.Process == nil {
		return nil
	}
	return handle.command.Process.Kill()
}

type PresentMonSource struct {
	mu          sync.RWMutex
	runner      commandRunner
	executable  string
	gameName    string
	sessionName string
	foreground  func() bool
	cancel      context.CancelFunc
	process     processHandle
	latest      GameSample
	done        chan struct{}
	closeOnce   sync.Once
}

func NewPresentMonSource(executable string) *PresentMonSource {
	return &PresentMonSource{
		runner:      execRunner{},
		executable:  executable,
		gameName:    "Le Mans Ultimate.exe",
		sessionName: fmt.Sprintf("VantareSensor-%d", os.Getpid()),
		foreground:  isLMUForeground,
	}
}

func (source *PresentMonSource) Start(parent context.Context) error {
	if err := source.cleanOrphans(parent); err != nil {
		return err
	}
	if source.executable == "" {
		return fmt.Errorf("presentmon path: %w", ErrUnavailable)
	}
	ctx, cancel := context.WithCancel(parent)
	reader, writer := io.Pipe()
	process, err := source.runner.Start(ctx, source.executable, []string{
		"--process_name", source.gameName,
		"--v2_metrics",
		"--session_name", source.sessionName,
		"--no_console_stats",
		"--output_stdout",
	}, writer, writer)
	if err != nil {
		cancel()
		reader.Close()
		writer.Close()
		return fmt.Errorf("start PresentMon: %w", err)
	}
	source.mu.Lock()
	source.cancel, source.process, source.done = cancel, process, make(chan struct{})
	source.mu.Unlock()
	go source.consume(reader, writer, process)
	return nil
}

func (source *PresentMonSource) consume(reader *io.PipeReader, writer *io.PipeWriter, process processHandle) {
	defer close(source.done)
	defer process.Wait()
	defer reader.Close()
	defer writer.Close()
	csvReader := csv.NewReader(bufio.NewReader(reader))
	csvReader.FieldsPerRecord = -1
	frametimeColumn := -1
	for {
		record, err := csvReader.Read()
		if err != nil {
			return
		}
		if frametimeColumn < 0 {
			for index, name := range record {
				if strings.EqualFold(strings.TrimSpace(name), "FrameTime") {
					frametimeColumn = index
					break
				}
			}
			continue
		}
		if frametimeColumn >= len(record) {
			continue
		}
		value, err := strconv.ParseFloat(strings.TrimSpace(record[frametimeColumn]), 64)
		if err != nil || value <= 0 {
			continue
		}
		source.mu.Lock()
		source.latest = GameSample{FrametimeMS: value, Available: true, Foreground: source.foreground()}
		source.mu.Unlock()
	}
}

func (source *PresentMonSource) Sample() GameSample {
	source.mu.RLock()
	defer source.mu.RUnlock()
	result := source.latest
	result.Foreground = source.foreground()
	return result
}

func (source *PresentMonSource) Close() error {
	var closeErr error
	source.closeOnce.Do(func() {
		source.mu.RLock()
		cancel, process, done := source.cancel, source.process, source.done
		source.mu.RUnlock()
		if cancel != nil {
			cancel()
		}
		if process != nil {
			_ = process.Kill()
		}
		if done != nil {
			<-done
		}
		output, err := source.runner.Output(context.Background(), "logman", "stop", source.sessionName, "-ets")
		if err != nil && !isMissingSession(output) {
			closeErr = fmt.Errorf("stop ETW session %s: %w", source.sessionName, err)
		}
	})
	return closeErr
}

func (source *PresentMonSource) cleanOrphans(ctx context.Context) error {
	output, err := source.runner.Output(ctx, "logman", "query", "-ets")
	if err != nil {
		return fmt.Errorf("query ETW sessions: %w", err)
	}
	for _, field := range strings.Fields(string(output)) {
		name := strings.TrimSpace(field)
		if !strings.HasPrefix(name, "VantareSensor-") {
			continue
		}
		stopped, stopErr := source.runner.Output(ctx, "logman", "stop", name, "-ets")
		if stopErr != nil && !isMissingSession(stopped) {
			return fmt.Errorf("stop orphan ETW session %s: %w", name, stopErr)
		}
	}
	return nil
}

func isMissingSession(output []byte) bool {
	text := strings.ToLower(string(output))
	return strings.Contains(text, "not found") || strings.Contains(text, "no se encuentra")
}

func DefaultPresentMonPath() string {
	if path, err := exec.LookPath("PresentMon.exe"); err == nil {
		return path
	}
	if root := os.Getenv("LOCALAPPDATA"); root != "" {
		path := filepath.Join(root, "Programs", "PresentMon", "PresentMon.exe")
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}
