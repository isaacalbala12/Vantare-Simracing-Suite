package sensor

import (
	"bufio"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

type commandRunner interface {
	Output(context.Context, string, ...string) ([]byte, error)
	Start(context.Context, string, []string) (processHandle, io.ReadCloser, error)
}

type processHandle interface {
	PID() int
	Wait() error
	Kill() error
}

type execRunner struct{}
type execHandle struct {
	command  *exec.Cmd
	closeJob func() error
}

func (execRunner) Output(ctx context.Context, name string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, name, args...).CombinedOutput()
}
func (execRunner) Start(ctx context.Context, name string, args []string) (processHandle, io.ReadCloser, error) {
	command := exec.CommandContext(ctx, name, args...)
	stdout, err := command.StdoutPipe()
	if err != nil {
		return nil, nil, err
	}
	command.Stderr = io.Discard
	closeJob, err := startCommandInKillOnCloseJob(command)
	if err != nil {
		stdout.Close()
		return nil, nil, err
	}
	return &execHandle{command: command, closeJob: closeJob}, stdout, nil
}
func (handle *execHandle) Wait() error {
	return errors.Join(handle.command.Wait(), handle.closeJob())
}
func (handle *execHandle) PID() int {
	if handle.command.Process == nil {
		return 0
	}
	return handle.command.Process.Pid
}
func (handle *execHandle) Kill() error {
	if handle.command.Process == nil {
		return nil
	}
	return handle.command.Process.Kill()
}

type PresentMonSource struct {
	mu           sync.RWMutex
	runner       commandRunner
	executable   string
	gameName     string
	sessionName  string
	foreground   func() bool
	processAlive func(int) bool
	now          func() time.Time
	maxFrameAge  time.Duration
	cancel       context.CancelFunc
	process      processHandle
	processPID   int
	latest       GameSample
	latestAt     time.Time
	done         chan struct{}
	closeOnce    sync.Once
}

func NewPresentMonSource(executable string) *PresentMonSource {
	return &PresentMonSource{
		runner:       execRunner{},
		executable:   executable,
		gameName:     "Le Mans Ultimate.exe",
		sessionName:  fmt.Sprintf("VantareSensor-%d", os.Getpid()),
		foreground:   isLMUForeground,
		processAlive: processIsAlive,
		now:          time.Now,
		maxFrameAge:  2 * time.Second,
	}
}

func (source *PresentMonSource) Start(parent context.Context) error {
	source.invalidateFrame()
	if err := source.cleanOrphans(parent); err != nil {
		return err
	}
	if source.executable == "" {
		return fmt.Errorf("presentmon path: %w", ErrUnavailable)
	}
	ctx, cancel := context.WithCancel(parent)
	process, reader, err := source.runner.Start(ctx, source.executable, []string{
		"--process_name", source.gameName,
		"--v2_metrics",
		"--session_name", source.sessionName,
		"--no_console_stats",
		"--output_stdout",
	})
	if err != nil {
		cancel()
		return fmt.Errorf("start PresentMon: %w", err)
	}
	source.mu.Lock()
	source.cancel, source.process, source.processPID, source.done = cancel, process, process.PID(), make(chan struct{})
	source.mu.Unlock()
	go source.consume(reader, process)
	return nil
}

func (source *PresentMonSource) consume(reader io.ReadCloser, process processHandle) {
	defer close(source.done)
	defer process.Wait()
	defer source.invalidateFrame()
	defer reader.Close()
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
		source.publishFrame(value)
	}
}

func (source *PresentMonSource) Sample() GameSample {
	source.mu.RLock()
	defer source.mu.RUnlock()
	result := source.latest
	if !result.Available || source.latestAt.IsZero() || source.now().Sub(source.latestAt) > source.maxFrameAge {
		return GameSample{Foreground: source.foreground()}
	}
	result.Foreground = source.foreground()
	return result
}

func (source *PresentMonSource) publishFrame(frametimeMS float64) {
	source.mu.Lock()
	source.latest = GameSample{FrametimeMS: frametimeMS, Available: true, Foreground: source.foreground()}
	source.latestAt = source.now()
	source.mu.Unlock()
}

func (source *PresentMonSource) invalidateFrame() {
	source.mu.Lock()
	source.latest = GameSample{}
	source.latestAt = time.Time{}
	source.mu.Unlock()
}

func (source *PresentMonSource) Close() error {
	var closeErr error
	source.closeOnce.Do(func() {
		source.mu.RLock()
		cancel, process, done := source.cancel, source.process, source.done
		source.mu.RUnlock()
		if process != nil {
			if err := process.Kill(); err != nil && !errors.Is(err, os.ErrProcessDone) {
				closeErr = errors.Join(closeErr, fmt.Errorf("kill owned PresentMon PID %d: %w", process.PID(), err))
			}
		}
		if cancel != nil {
			cancel()
		}
		closeErr = source.stopOwnSession()
		if done != nil {
			select {
			case <-done:
			case <-time.After(2 * time.Second):
				closeErr = errors.Join(closeErr, errors.New("PresentMon did not exit within two seconds"))
			}
		}
		// PresentMon puede volver a registrar la sesión durante sus últimos
		// milisegundos. Tras Wait ya no queda ningún productor que pueda recrearla.
		closeErr = errors.Join(closeErr, source.stopOwnSession())
	})
	return closeErr
}

func (source *PresentMonSource) stopOwnSession() error {
	output, err := source.runner.Output(context.Background(), "logman", "stop", source.sessionName, "-ets")
	if err != nil && !isMissingSession(output) {
		return fmt.Errorf("stop ETW session %s: %w", source.sessionName, err)
	}
	return nil
}

func (source *PresentMonSource) cleanOrphans(ctx context.Context) error {
	output, err := source.runner.Output(ctx, "logman", "query", "-ets")
	if err != nil {
		return fmt.Errorf("query ETW sessions: %w", err)
	}
	for _, field := range strings.Fields(string(output)) {
		name := strings.TrimSpace(field)
		pid, ok := vantareSensorPID(name)
		if !ok || source.processAlive(pid) {
			continue
		}
		stopped, stopErr := source.runner.Output(ctx, "logman", "stop", name, "-ets")
		if stopErr != nil && !isMissingSession(stopped) {
			return fmt.Errorf("stop orphan ETW session %s: %w", name, stopErr)
		}
	}
	return nil
}

func vantareSensorPID(sessionName string) (int, bool) {
	const prefix = "VantareSensor-"
	if !strings.HasPrefix(sessionName, prefix) {
		return 0, false
	}
	pid, err := strconv.Atoi(strings.TrimPrefix(sessionName, prefix))
	return pid, err == nil && pid > 0
}

func isMissingSession(output []byte) bool {
	text := strings.ToLower(string(output))
	return strings.Contains(text, "not found") ||
		strings.Contains(text, "no se encuentra") ||
		strings.Contains(text, "data collector set") ||
		strings.Contains(text, "conjunto de recopiladores de datos")
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
