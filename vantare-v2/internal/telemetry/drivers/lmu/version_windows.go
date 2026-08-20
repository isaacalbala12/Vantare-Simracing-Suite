//go:build windows

package lmu

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"
)

const (
	th32csSnapProcess              = 0x00000002
	processQueryLimitedInformation = 0x1000
	maxPathUTF16                   = 32768
	fixedFileInfoSignature         = 0xFEEF04BD
)

const (
	defaultSteamLibraryRoot   = `C:\Program Files (x86)\Steam`
	steamLibraryFoldersFile   = `steamapps\libraryfolders.vdf`
	lmuRelativeExecutablePath = `steamapps\common\Le Mans Ultimate\Le Mans Ultimate.exe`
)

var (
	createToolhelp32Snapshot = kernel32.NewProc("CreateToolhelp32Snapshot")
	process32FirstW          = kernel32.NewProc("Process32FirstW")
	process32NextW           = kernel32.NewProc("Process32NextW")
	openProcess              = kernel32.NewProc("OpenProcess")
	queryFullProcessImageW   = kernel32.NewProc("QueryFullProcessImageNameW")
	versionDLL               = syscall.NewLazyDLL("version.dll")
	getFileVersionInfoSizeW  = versionDLL.NewProc("GetFileVersionInfoSizeW")
	getFileVersionInfoW      = versionDLL.NewProc("GetFileVersionInfoW")
	verQueryValueW           = versionDLL.NewProc("VerQueryValueW")
)

type processEntry32 struct {
	Size            uint32
	CntUsage        uint32
	ProcessID       uint32
	DefaultHeapID   uintptr
	ModuleID        uint32
	Threads         uint32
	ParentProcessID uint32
	PriClassBase    int32
	Flags           uint32
	ExeFile         [260]uint16
}

type fixedFileInfo struct {
	Signature        uint32
	StructVersion    uint32
	FileVersionMS    uint32
	FileVersionLS    uint32
	ProductVersionMS uint32
	ProductVersionLS uint32
	FileFlagsMask    uint32
	FileFlags        uint32
	FileOS           uint32
	FileType         uint32
	FileSubtype      uint32
	FileDateMS       uint32
	FileDateLS       uint32
}

type buildWindowsAPI struct {
	snapshot    func() (uintptr, error)
	first       func(uintptr, *processEntry32) (bool, error)
	next        func(uintptr, *processEntry32) (bool, error)
	openProcess func(uint32) (uintptr, error)
	queryPath   func(uintptr) (string, error)
	versionInfo func(string) (BuildEvidence, error)
	close       func(uintptr) (uintptr, error)
}

// readLMUBuildEvidence prefers the running process, whose path proves the
// mapping and the executable belong to the same installation. Since LMU 1.4.1.3
// the process is protected: OpenProcess succeeds but QueryFullProcessImageNameW
// yields no path, so the process route returns empty evidence. Only then do we
// fall back to the installed executable on disk, which carries the same
// FileVersion/ProductVersion pair.
func readLMUBuildEvidence() (BuildEvidence, error) {
	return resolveLMUBuildEvidence(systemBuildWindowsAPI(), systemDiskBuildAPI())
}

func resolveLMUBuildEvidence(process buildWindowsAPI, disk diskBuildAPI) (BuildEvidence, error) {
	evidence, err := findLMUBuildEvidence(process)
	if err == nil && evidence.complete() {
		return evidence, nil
	}
	diskEvidence, diskErr := findLMUDiskBuildEvidence(disk)
	if diskErr != nil {
		return BuildEvidence{}, errors.Join(err, diskErr)
	}
	return diskEvidence, nil
}

// complete reports whether both version fields are populated. Partial evidence
// is treated as a failed read so the disk fallback can supply the full pair.
func (evidence BuildEvidence) complete() bool {
	return strings.TrimSpace(evidence.FileVersion) != "" &&
		strings.TrimSpace(evidence.ProductVersion) != ""
}

// diskBuildAPI isolates the filesystem so the fallback stays testable and never
// logs or returns installation paths.
type diskBuildAPI struct {
	exists      func(string) bool
	readFile    func(string) ([]byte, error)
	versionInfo func(string) (BuildEvidence, error)
}

func systemDiskBuildAPI() diskBuildAPI {
	return diskBuildAPI{
		exists: func(path string) bool {
			info, err := os.Stat(path)
			return err == nil && !info.IsDir()
		},
		readFile:    os.ReadFile,
		versionInfo: readWindowsFileVersion,
	}
}

func findLMUDiskBuildEvidence(api diskBuildAPI) (BuildEvidence, error) {
	if api.exists == nil || api.readFile == nil || api.versionInfo == nil {
		return BuildEvidence{}, ErrBuildUnavailable
	}
	for _, root := range steamLibraryRoots(api) {
		executable := filepath.Join(root, lmuRelativeExecutablePath)
		if !api.exists(executable) {
			continue
		}
		evidence, err := api.versionInfo(executable)
		if err != nil || !evidence.complete() {
			continue
		}
		return evidence, nil
	}
	return BuildEvidence{}, ErrBuildUnavailable
}

// steamLibraryRoots lists the default Steam root first and then every library
// declared in libraryfolders.vdf, de-duplicated and in a stable order.
func steamLibraryRoots(api diskBuildAPI) []string {
	roots := []string{defaultSteamLibraryRoot}
	seen := map[string]struct{}{strings.ToLower(defaultSteamLibraryRoot): {}}
	data, err := api.readFile(filepath.Join(defaultSteamLibraryRoot, steamLibraryFoldersFile))
	if err != nil {
		return roots
	}
	for _, path := range parseSteamLibraryPaths(string(data)) {
		key := strings.ToLower(path)
		if _, duplicate := seen[key]; duplicate {
			continue
		}
		seen[key] = struct{}{}
		roots = append(roots, path)
	}
	return roots
}

// parseSteamLibraryPaths extracts the `"path" "<value>"` entries of a Steam
// libraryfolders.vdf without pulling in a VDF dependency.
func parseSteamLibraryPaths(document string) []string {
	var paths []string
	for _, line := range strings.Split(document, "\n") {
		fields := strings.TrimSpace(line)
		if !strings.HasPrefix(fields, `"path"`) {
			continue
		}
		rest := strings.TrimSpace(strings.TrimPrefix(fields, `"path"`))
		if len(rest) < 2 || !strings.HasPrefix(rest, `"`) {
			continue
		}
		rest = rest[1:]
		end := strings.Index(rest, `"`)
		if end <= 0 {
			continue
		}
		value := strings.ReplaceAll(rest[:end], `\\`, `\`)
		if value = strings.TrimSpace(value); value != "" {
			paths = append(paths, filepath.Clean(value))
		}
	}
	return paths
}

func findLMUBuildEvidence(api buildWindowsAPI) (evidence BuildEvidence, resultErr error) {
	snapshot, err := api.snapshot()
	if err != nil {
		return BuildEvidence{}, fmt.Errorf("snapshot processes: %w", err)
	}
	defer func() {
		if result, closeErr := api.close(snapshot); result == 0 {
			resultErr = errors.Join(resultErr, fmt.Errorf("close process snapshot: %w", closeErr))
		}
	}()
	entry := processEntry32{Size: uint32(unsafe.Sizeof(processEntry32{}))}
	ok, err := api.first(snapshot, &entry)
	if err != nil {
		return BuildEvidence{}, fmt.Errorf("enumerate processes: %w", err)
	}
	for ok {
		if strings.EqualFold(syscall.UTF16ToString(entry.ExeFile[:]), "Le Mans Ultimate.exe") {
			handle, err := api.openProcess(entry.ProcessID)
			if err != nil {
				return BuildEvidence{}, fmt.Errorf("open LMU process: %w", err)
			}
			path, pathErr := api.queryPath(handle)
			if pathErr != nil {
				pathErr = fmt.Errorf("query LMU executable path: %w", pathErr)
			}
			var version BuildEvidence
			var versionErr error
			if pathErr == nil {
				version, versionErr = api.versionInfo(path)
				if versionErr != nil {
					versionErr = fmt.Errorf("read LMU version: %w", versionErr)
				}
			}
			if closed, closeErr := api.close(handle); closed == 0 {
				versionErr = errors.Join(versionErr, fmt.Errorf("close LMU process: %w", closeErr))
			}
			return version, errors.Join(pathErr, versionErr)
		}
		entry = processEntry32{Size: uint32(unsafe.Sizeof(processEntry32{}))}
		ok, err = api.next(snapshot, &entry)
		if err != nil {
			return BuildEvidence{}, fmt.Errorf("enumerate processes: %w", err)
		}
	}
	return BuildEvidence{}, ErrBuildUnavailable
}

func systemBuildWindowsAPI() buildWindowsAPI {
	return buildWindowsAPI{
		snapshot: func() (uintptr, error) {
			result, _, err := createToolhelp32Snapshot.Call(th32csSnapProcess, 0)
			if result == ^uintptr(0) {
				return 0, err
			}
			return result, nil
		},
		first: func(snapshot uintptr, entry *processEntry32) (bool, error) {
			result, _, err := process32FirstW.Call(snapshot, uintptr(unsafe.Pointer(entry)))
			if result == 0 {
				return false, err
			}
			return true, nil
		},
		next: func(snapshot uintptr, entry *processEntry32) (bool, error) {
			result, _, err := process32NextW.Call(snapshot, uintptr(unsafe.Pointer(entry)))
			if result == 0 {
				if errors.Is(err, syscall.Errno(18)) {
					return false, nil
				}
				return false, err
			}
			return true, nil
		},
		openProcess: func(processID uint32) (uintptr, error) {
			result, _, err := openProcess.Call(processQueryLimitedInformation, 0, uintptr(processID))
			if result == 0 {
				return 0, err
			}
			return result, nil
		},
		queryPath: func(handle uintptr) (string, error) {
			buffer := make([]uint16, maxPathUTF16)
			size := uint32(len(buffer))
			result, _, err := queryFullProcessImageW.Call(handle, 0, uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(&size)))
			if result == 0 {
				return "", err
			}
			return syscall.UTF16ToString(buffer[:size]), nil
		},
		versionInfo: readWindowsFileVersion,
		close: func(handle uintptr) (uintptr, error) {
			result, _, err := closeWindowsHandle.Call(handle)
			return result, err
		},
	}
}

func readWindowsFileVersion(path string) (BuildEvidence, error) {
	pathUTF16, err := syscall.UTF16PtrFromString(path)
	if err != nil {
		return BuildEvidence{}, errors.New("encode executable path")
	}
	var ignored uint32
	size, _, callErr := getFileVersionInfoSizeW.Call(uintptr(unsafe.Pointer(pathUTF16)), uintptr(unsafe.Pointer(&ignored)))
	if size == 0 {
		return BuildEvidence{}, fmt.Errorf("get version size: %w", callErr)
	}
	buffer := make([]byte, size)
	result, _, callErr := getFileVersionInfoW.Call(uintptr(unsafe.Pointer(pathUTF16)), 0, size, uintptr(unsafe.Pointer(&buffer[0])))
	if result == 0 {
		return BuildEvidence{}, fmt.Errorf("read version data: %w", callErr)
	}
	root, err := syscall.UTF16PtrFromString(`\`)
	if err != nil {
		return BuildEvidence{}, errors.New("encode version query")
	}
	var fixedAddress uintptr
	var fixedLength uint32
	result, _, callErr = verQueryValueW.Call(uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(root)), uintptr(unsafe.Pointer(&fixedAddress)), uintptr(unsafe.Pointer(&fixedLength)))
	if result == 0 || fixedAddress == 0 || fixedLength < uint32(unsafe.Sizeof(fixedFileInfo{})) {
		return BuildEvidence{}, fmt.Errorf("query fixed version: %w", callErr)
	}
	fixed := *(*fixedFileInfo)(unsafe.Pointer(fixedAddress))
	return buildEvidenceFromFixed(fixed)
}

func buildEvidenceFromFixed(fixed fixedFileInfo) (BuildEvidence, error) {
	if fixed.Signature != fixedFileInfoSignature {
		return BuildEvidence{}, errors.New("invalid fixed version signature")
	}
	return BuildEvidence{
		FileVersion:    formatFixedVersion(fixed.FileVersionMS, fixed.FileVersionLS),
		ProductVersion: formatFixedVersion(fixed.ProductVersionMS, fixed.ProductVersionLS),
	}, nil
}

func formatFixedVersion(ms, ls uint32) string {
	return fmt.Sprintf("%d.%d.%d.%d", ms>>16, ms&0xffff, ls>>16, ls&0xffff)
}
