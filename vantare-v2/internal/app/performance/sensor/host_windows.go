//go:build windows

package sensor

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"
	"unsafe"

	"github.com/shirou/gopsutil/v4/process"
	"golang.org/x/sys/windows"
)

var (
	kernel32                 = windows.NewLazySystemDLL("kernel32.dll")
	psapi                    = windows.NewLazySystemDLL("psapi.dll")
	procGetSystemTimes       = kernel32.NewProc("GetSystemTimes")
	procGetProcessMemoryInfo = psapi.NewProc("GetProcessMemoryInfo")
)

type filetime struct{ Low, High uint32 }

func (value filetime) ticks() uint64 { return uint64(value.High)<<32 | uint64(value.Low) }

type processMemoryCountersEx struct {
	CB                         uint32
	PageFaultCount             uint32
	PeakWorkingSetSize         uintptr
	WorkingSetSize             uintptr
	QuotaPeakPagedPoolUsage    uintptr
	QuotaPagedPoolUsage        uintptr
	QuotaPeakNonPagedPoolUsage uintptr
	QuotaNonPagedPoolUsage     uintptr
	PagefileUsage              uintptr
	PeakPagefileUsage          uintptr
	PrivateUsage               uintptr
}

type cpuSnapshot struct {
	at           time.Time
	systemTotal  uint64
	systemIdle   uint64
	process100ns uint64
}

type WindowsHostSampler struct {
	mu       sync.Mutex
	profile  string
	previous cpuSnapshot
	now      func() time.Time
}

func NewHostSampler(userDataDir string) *WindowsHostSampler {
	return &WindowsHostSampler{profile: filepath.Clean(userDataDir), now: time.Now}
}

func (sampler *WindowsHostSampler) Sample(ctx context.Context) (HostSample, error) {
	if err := ctx.Err(); err != nil {
		return HostSample{}, err
	}
	idle, kernel, user, err := systemTimes()
	if err != nil {
		return HostSample{}, err
	}
	pids, err := sampler.ownProcessIDs(ctx)
	if err != nil {
		return HostSample{}, err
	}
	var processTicks, privateBytes uint64
	for _, pid := range pids {
		ticks, memory, sampleErr := processUsage(pid)
		if sampleErr != nil {
			continue
		}
		processTicks += ticks
		privateBytes += memory
	}
	now := sampler.now()
	current := cpuSnapshot{at: now, systemTotal: kernel + user, systemIdle: idle, process100ns: processTicks}
	sampler.mu.Lock()
	previous := sampler.previous
	sampler.previous = current
	sampler.mu.Unlock()

	result := HostSample{VantareRAMMB: float64(privateBytes) / (1024 * 1024)}
	if !previous.at.IsZero() {
		totalDelta := current.systemTotal - previous.systemTotal
		idleDelta := current.systemIdle - previous.systemIdle
		if totalDelta > 0 && idleDelta <= totalDelta {
			result.CPUPct = clampPercent(100 * float64(totalDelta-idleDelta) / float64(totalDelta))
		}
		elapsed := current.at.Sub(previous.at)
		if elapsed > 0 && current.process100ns >= previous.process100ns {
			seconds := float64(current.process100ns-previous.process100ns) / 10_000_000
			result.VantareCPUPct = clampPercent(100 * seconds / elapsed.Seconds() / float64(runtime.NumCPU()))
		}
	}
	return result, nil
}

func (sampler *WindowsHostSampler) ownProcessIDs(ctx context.Context) ([]uint32, error) {
	all, err := process.ProcessesWithContext(ctx)
	if err != nil {
		return nil, fmt.Errorf("enumerate processes: %w", err)
	}
	result := []uint32{uint32(os.Getpid())}
	for _, candidate := range all {
		name, nameErr := candidate.NameWithContext(ctx)
		if nameErr != nil || !strings.EqualFold(name, "msedgewebview2.exe") {
			continue
		}
		commandLine, commandErr := candidate.CmdlineWithContext(ctx)
		if commandErr == nil && ownsWebViewCommandLine(commandLine, sampler.profile) {
			result = append(result, uint32(candidate.Pid))
		}
	}
	return result, nil
}

func ownsWebViewCommandLine(commandLine, expectedProfile string) bool {
	actual := commandLineSwitch(commandLine, "user-data-dir")
	return actual != "" && expectedProfile != "" && strings.EqualFold(filepath.Clean(actual), filepath.Clean(expectedProfile))
}

func commandLineSwitch(commandLine, name string) string {
	prefix := "--" + strings.ToLower(name) + "="
	for index := 0; index < len(commandLine); index++ {
		if index > 0 && commandLine[index-1] != ' ' && commandLine[index-1] != '\t' {
			continue
		}
		remaining := commandLine[index:]
		if len(remaining) < len(prefix) || !strings.EqualFold(remaining[:len(prefix)], prefix) {
			continue
		}
		value := remaining[len(prefix):]
		if strings.HasPrefix(value, "\"") {
			value = value[1:]
			if end := strings.IndexByte(value, '"'); end >= 0 {
				return value[:end]
			}
		}
		if end := strings.IndexAny(value, " \t"); end >= 0 {
			value = value[:end]
		}
		return value
	}
	return ""
}

func systemTimes() (idle, kernel, user uint64, err error) {
	var idleTime, kernelTime, userTime filetime
	ok, _, callErr := procGetSystemTimes.Call(uintptr(unsafe.Pointer(&idleTime)), uintptr(unsafe.Pointer(&kernelTime)), uintptr(unsafe.Pointer(&userTime)))
	if ok == 0 {
		return 0, 0, 0, fmt.Errorf("GetSystemTimes: %w", callErr)
	}
	return idleTime.ticks(), kernelTime.ticks(), userTime.ticks(), nil
}

func processUsage(pid uint32) (ticks, privateBytes uint64, err error) {
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.PROCESS_VM_READ, false, pid)
	if err != nil {
		return 0, 0, err
	}
	defer windows.CloseHandle(handle)
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &created, &exited, &kernel, &user); err != nil {
		return 0, 0, err
	}
	counters := processMemoryCountersEx{CB: uint32(unsafe.Sizeof(processMemoryCountersEx{}))}
	ok, _, callErr := procGetProcessMemoryInfo.Call(uintptr(handle), uintptr(unsafe.Pointer(&counters)), uintptr(counters.CB))
	if ok == 0 {
		return 0, 0, callErr
	}
	return uint64(kernel.Nanoseconds()+user.Nanoseconds()) / 100, uint64(counters.PrivateUsage), nil
}

func clampPercent(value float64) float64 {
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}
