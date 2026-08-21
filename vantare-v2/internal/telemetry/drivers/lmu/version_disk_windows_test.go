//go:build windows

package lmu

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestDiskBuildFallbackReadsDefaultSteamInstall(t *testing.T) {
	want := filepath.Join(defaultSteamLibraryRoot, lmuRelativeExecutablePath)
	api := diskBuildAPI{
		exists:   func(path string) bool { return path == want },
		readFile: func(string) ([]byte, error) { return nil, errors.New("no libraryfolders.vdf") },
		versionInfo: func(path string) (BuildEvidence, error) {
			if path != want {
				t.Fatalf("path = %q", path)
			}
			return BuildEvidence{FileVersion: diagnosticLMUVersion1, ProductVersion: diagnosticLMUVersion1}, nil
		},
	}
	evidence, err := findLMUDiskBuildEvidence(api)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.FileVersion != diagnosticLMUVersion1 || evidence.ProductVersion != diagnosticLMUVersion1 {
		t.Fatalf("evidence = %#v", evidence)
	}
}

func TestDiskBuildFallbackResolvesSecondarySteamLibrary(t *testing.T) {
	const library = `D:\SteamLibrary`
	want := filepath.Join(library, lmuRelativeExecutablePath)
	document := `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
	}
	"1"
	{
		"path"		"D:\\SteamLibrary"
	}
}`
	api := diskBuildAPI{
		exists:   func(path string) bool { return path == want },
		readFile: func(string) ([]byte, error) { return []byte(document), nil },
		versionInfo: func(path string) (BuildEvidence, error) {
			if path != want {
				t.Fatalf("path = %q", path)
			}
			return BuildEvidence{FileVersion: diagnosticLMUVersion1, ProductVersion: diagnosticLMUVersion1}, nil
		},
	}
	evidence, err := findLMUDiskBuildEvidence(api)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.FileVersion != diagnosticLMUVersion1 {
		t.Fatalf("evidence = %#v", evidence)
	}
}

func TestDiskBuildFallbackWithoutInstallIsUnavailable(t *testing.T) {
	api := diskBuildAPI{
		exists:   func(string) bool { return false },
		readFile: func(string) ([]byte, error) { return nil, errors.New("absent") },
		versionInfo: func(string) (BuildEvidence, error) {
			t.Fatal("version info read for a missing executable")
			return BuildEvidence{}, nil
		},
	}
	if _, err := findLMUDiskBuildEvidence(api); !errors.Is(err, ErrBuildUnavailable) {
		t.Fatalf("error = %v", err)
	}
}

func TestDiskBuildFallbackRejectsPartialEvidence(t *testing.T) {
	api := diskBuildAPI{
		exists:   func(string) bool { return true },
		readFile: func(string) ([]byte, error) { return nil, errors.New("absent") },
		versionInfo: func(string) (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion1}, nil
		},
	}
	if _, err := findLMUDiskBuildEvidence(api); !errors.Is(err, ErrBuildUnavailable) {
		t.Fatalf("error = %v", err)
	}
}

// Precedencia del fallback (ISA-680): Steam, registro y variable de entorno,
// en ese orden y sin consultar la siguiente cuando una aporta evidencia.
func TestDiskBuildFallbackAppliesSourcePrecedence(t *testing.T) {
	const registryLocation = `D:\Games\LMU`
	const envLocation = `E:\Manual\LMU`
	steamExecutable := filepath.Join(defaultSteamLibraryRoot, lmuRelativeExecutablePath)
	registryExecutable := filepath.Join(registryLocation, lmuExecutableName)
	envExecutable := filepath.Join(envLocation, lmuExecutableName)

	for _, testCase := range []struct {
		name    string
		present string
		env     string
		want    string
	}{
		{name: "steam gana al registro y al entorno", present: steamExecutable, env: envLocation, want: steamExecutable},
		{name: "registro cuando steam falla", present: registryExecutable, env: envLocation, want: registryExecutable},
		{name: "entorno como ultimo recurso", present: envExecutable, env: envLocation, want: envExecutable},
		{name: "entorno con ruta de ejecutable", present: envExecutable, env: envExecutable, want: envExecutable},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			var read string
			api := diskBuildAPI{
				exists:           func(path string) bool { return path == testCase.present },
				readFile:         func(string) ([]byte, error) { return nil, errors.New("absent") },
				installLocations: func() []string { return []string{registryLocation} },
				lookupEnv: func(name string) (string, bool) {
					if name != lmuPathEnvVar {
						t.Fatalf("variable consultada = %q", name)
					}
					return testCase.env, true
				},
				versionInfo: func(path string) (BuildEvidence, error) {
					read = path
					return BuildEvidence{FileVersion: diagnosticLMUVersion1, ProductVersion: diagnosticLMUVersion1}, nil
				},
			}
			evidence, err := findLMUDiskBuildEvidence(api)
			if err != nil {
				t.Fatal(err)
			}
			if read != testCase.want {
				t.Fatalf("ejecutable leido = %q want %q", read, testCase.want)
			}
			if evidence.FileVersion != diagnosticLMUVersion1 {
				t.Fatalf("evidence = %#v", evidence)
			}
		})
	}
}

func TestDiskBuildFallbackWithoutRegistryNorEnvIsUnavailable(t *testing.T) {
	api := diskBuildAPI{
		exists:           func(string) bool { return false },
		readFile:         func(string) ([]byte, error) { return nil, errors.New("absent") },
		installLocations: func() []string { return nil },
		lookupEnv:        func(string) (string, bool) { return "", false },
		versionInfo: func(string) (BuildEvidence, error) {
			t.Fatal("version info read for a missing executable")
			return BuildEvidence{}, nil
		},
	}
	if _, err := findLMUDiskBuildEvidence(api); !errors.Is(err, ErrBuildUnavailable) {
		t.Fatalf("error = %v", err)
	}
}

func TestExecutablePathFromAcceptsFolderOrExecutable(t *testing.T) {
	for _, testCase := range []struct {
		name  string
		value string
		want  string
	}{
		{name: "carpeta", value: `D:\Games\LMU`, want: filepath.Join(`D:\Games\LMU`, lmuExecutableName)},
		{name: "carpeta con barra final", value: `D:\Games\LMU\`, want: filepath.Join(`D:\Games\LMU`, lmuExecutableName)},
		{name: "ejecutable", value: `D:\Games\LMU\Le Mans Ultimate.exe`, want: `D:\Games\LMU\Le Mans Ultimate.exe`},
		{name: "entrecomillado", value: `"D:\Games\LMU"`, want: filepath.Join(`D:\Games\LMU`, lmuExecutableName)},
		{name: "vacio", value: "   ", want: ""},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			if got := executablePathFrom(testCase.value); got != testCase.want {
				t.Fatalf("executablePathFrom(%q) = %q want %q", testCase.value, got, testCase.want)
			}
		})
	}
}

func TestParseSteamLibraryPathsUnescapesAndSkipsOtherKeys(t *testing.T) {
	document := `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
		"label"		"D:\\NotALibrary"
		"contentid"		"12345"
	}
	"1"
	{
		"path"		"E:\\Games\\Steam"
	}
}`
	paths := parseSteamLibraryPaths(document)
	if len(paths) != 2 {
		t.Fatalf("paths = %#v", paths)
	}
	if paths[0] != `C:\Program Files (x86)\Steam` || paths[1] != `E:\Games\Steam` {
		t.Fatalf("paths = %#v", paths)
	}
}

func TestSteamLibraryRootsDeduplicatesDefaultRoot(t *testing.T) {
	document := `"libraryfolders"
{
	"0"
	{
		"path"		"C:\\Program Files (x86)\\Steam"
	}
}`
	api := diskBuildAPI{
		exists:      func(string) bool { return false },
		readFile:    func(string) ([]byte, error) { return []byte(document), nil },
		versionInfo: func(string) (BuildEvidence, error) { return BuildEvidence{}, nil },
	}
	roots := steamLibraryRoots(api)
	if len(roots) != 1 || !strings.EqualFold(roots[0], defaultSteamLibraryRoot) {
		t.Fatalf("roots = %#v", roots)
	}
}

func TestBuildEvidenceCompleteRequiresBothFields(t *testing.T) {
	cases := []struct {
		name     string
		evidence BuildEvidence
		want     bool
	}{
		{"both", BuildEvidence{FileVersion: "1.4.1.3", ProductVersion: "1.4.1.3"}, true},
		{"file only", BuildEvidence{FileVersion: "1.4.1.3"}, false},
		{"product only", BuildEvidence{ProductVersion: "1.4.1.3"}, false},
		{"blank", BuildEvidence{FileVersion: "  ", ProductVersion: "  "}, false},
		{"empty", BuildEvidence{}, false},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := testCase.evidence.complete(); got != testCase.want {
				t.Fatalf("complete() = %v", got)
			}
		})
	}
}

func TestResolveBuildEvidencePrefersProcessAndSkipsDisk(t *testing.T) {
	process := buildWindowsAPI{
		snapshot: func() (uintptr, error) { return 10, nil },
		first: func(_ uintptr, entry *processEntry32) (bool, error) {
			setProcessName(entry, "Le Mans Ultimate.exe")
			return true, nil
		},
		next:        func(uintptr, *processEntry32) (bool, error) { return false, nil },
		openProcess: func(uint32) (uintptr, error) { return 20, nil },
		queryPath:   func(uintptr) (string, error) { return `C:\private\Le Mans Ultimate.exe`, nil },
		versionInfo: func(string) (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion, ProductVersion: diagnosticLMUVersion}, nil
		},
		close: func(uintptr) (uintptr, error) { return 1, nil },
	}
	disk := diskBuildAPI{
		exists:           func(string) bool { t.Fatal("disk fallback used while the process supplied evidence"); return false },
		readFile:         func(string) ([]byte, error) { t.Fatal("disk fallback read libraryfolders.vdf"); return nil, nil },
		installLocations: func() []string { t.Fatal("registry read while the process supplied evidence"); return nil },
		lookupEnv: func(string) (string, bool) {
			t.Fatal("environment read while the process supplied evidence")
			return "", false
		},
		versionInfo: func(string) (BuildEvidence, error) {
			t.Fatal("disk fallback read a file version")
			return BuildEvidence{}, nil
		},
	}
	evidence, err := resolveLMUBuildEvidence(process, disk)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.FileVersion != diagnosticLMUVersion {
		t.Fatalf("evidence = %#v", evidence)
	}
}

func TestResolveBuildEvidenceFallsBackWhenProcessPathIsProtected(t *testing.T) {
	want := filepath.Join(defaultSteamLibraryRoot, lmuRelativeExecutablePath)
	process := buildWindowsAPI{
		snapshot: func() (uintptr, error) { return 10, nil },
		first: func(_ uintptr, entry *processEntry32) (bool, error) {
			setProcessName(entry, "Le Mans Ultimate.exe")
			return true, nil
		},
		next:        func(uintptr, *processEntry32) (bool, error) { return false, nil },
		openProcess: func(uint32) (uintptr, error) { return 20, nil },
		queryPath:   func(uintptr) (string, error) { return "", errors.New("access is denied") },
		versionInfo: func(string) (BuildEvidence, error) { return BuildEvidence{}, nil },
		close:       func(uintptr) (uintptr, error) { return 1, nil },
	}
	disk := diskBuildAPI{
		exists:   func(path string) bool { return path == want },
		readFile: func(string) ([]byte, error) { return nil, errors.New("absent") },
		versionInfo: func(string) (BuildEvidence, error) {
			return BuildEvidence{FileVersion: diagnosticLMUVersion1, ProductVersion: diagnosticLMUVersion1}, nil
		},
	}
	evidence, err := resolveLMUBuildEvidence(process, disk)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.FileVersion != diagnosticLMUVersion1 || evidence.ProductVersion != diagnosticLMUVersion1 {
		t.Fatalf("evidence = %#v", evidence)
	}
}

func TestResolveBuildEvidenceFailsWhenProcessAndDiskFail(t *testing.T) {
	process := buildWindowsAPI{
		snapshot: func() (uintptr, error) { return 10, nil },
		first:    func(uintptr, *processEntry32) (bool, error) { return false, nil },
		close:    func(uintptr) (uintptr, error) { return 1, nil },
	}
	disk := diskBuildAPI{
		exists:      func(string) bool { return false },
		readFile:    func(string) ([]byte, error) { return nil, errors.New("absent") },
		versionInfo: func(string) (BuildEvidence, error) { return BuildEvidence{}, nil },
	}
	if _, err := resolveLMUBuildEvidence(process, disk); !errors.Is(err, ErrBuildUnavailable) {
		t.Fatalf("error = %v", err)
	}
}
