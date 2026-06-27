package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

func main() {
	printFlag := flag.Bool("print", false, "only print the version and exit")
	flag.Parse()

	// Read VERSION file
	versionBytes, err := os.ReadFile("VERSION")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading VERSION file: %v\n", err)
		os.Exit(1)
	}
	version := strings.TrimSpace(string(versionBytes))
	if version == "" {
		fmt.Fprintf(os.Stderr, "VERSION file is empty\n")
		os.Exit(1)
	}

	// Validate version format X.X.X.X (e.g. 0.3.10.0). Anything else is rejected.
	matched, err := regexp.MatchString(`^\d+\.\d+\.\d+\.\d+$`, version)
	if err != nil || !matched {
		fmt.Fprintf(os.Stderr, "Error: VERSION %q does not match required format X.X.X.X (e.g. 0.3.10.0, no leading 'v')\n", version)
		os.Exit(1)
	}

	if *printFlag {
		fmt.Println(version)
		return
	}

	fmt.Printf("Synchronizing version %s across files...\n", version)

	// 1. Synchronize cmd/vantare/main.go
	mainGoPath := filepath.Join("cmd", "vantare", "main.go")
	if err := updateMainGo(mainGoPath, version); err != nil {
		fmt.Fprintf(os.Stderr, "Error updating main.go: %v\n", err)
		os.Exit(1)
	}

	// 2. Synchronize build/config.yml
	configYmlPath := filepath.Join("build", "config.yml")
	if err := updateConfigYml(configYmlPath, version); err != nil {
		fmt.Fprintf(os.Stderr, "Error updating config.yml: %v\n", err)
		os.Exit(1)
	}

	// 3. Synchronize build/windows/info.json
	infoJsonPath := filepath.Join("build", "windows", "info.json")
	if err := updateInfoJson(infoJsonPath, version); err != nil {
		fmt.Fprintf(os.Stderr, "Error updating info.json: %v\n", err)
		os.Exit(1)
	}

	// 4. Synchronize build/windows/nsis/project.nsi
	projectNsiPath := filepath.Join("build", "windows", "nsis", "project.nsi")
	if err := updateProjectNsi(projectNsiPath, version); err != nil {
		fmt.Fprintf(os.Stderr, "Error updating project.nsi: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Version sync completed successfully.")
}

func updateMainGo(path string, version string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	re := regexp.MustCompile(`(?m)^(var version = )("[^"]+")`)
	if !re.Match(content) {
		return fmt.Errorf("could not find 'var version = ...' declaration in main.go")
	}

	newContent := re.ReplaceAll(content, []byte(fmt.Sprintf(`var version = "v%s"`, version)))
	return os.WriteFile(path, newContent, 0644)
}

func updateConfigYml(path string, version string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	re := regexp.MustCompile(`(?m)^(\s{2}version:\s*)("[^"]+")`)
	if !re.Match(content) {
		return fmt.Errorf("could not find '  version: ...' declaration in config.yml")
	}

	newContent := re.ReplaceAll(content, []byte(fmt.Sprintf(`  version: "%s"`, version)))
	return os.WriteFile(path, newContent, 0644)
}

func updateInfoJson(path string, version string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	var data map[string]interface{}
	if err := json.Unmarshal(content, &data); err != nil {
		return err
	}

	if fixed, ok := data["fixed"].(map[string]interface{}); ok {
		fixed["file_version"] = version
	} else {
		return fmt.Errorf("fixed block not found in info.json")
	}

	if info, ok := data["info"].(map[string]interface{}); ok {
		found := false
		for _, langData := range info {
			if langMap, ok := langData.(map[string]interface{}); ok {
				langMap["ProductVersion"] = version
				langMap["Comments"] = "v" + version
				found = true
			}
		}
		if !found {
			return fmt.Errorf("no language block found under info in info.json")
		}
	} else {
		return fmt.Errorf("info block not found in info.json")
	}

	newContent, err := json.MarshalIndent(data, "", "\t")
	if err != nil {
		return err
	}
	newContent = append(newContent, '\n')

	return os.WriteFile(path, newContent, 0644)
}

func updateProjectNsi(path string, version string) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}

	re := regexp.MustCompile(`(?m)^(!define INFO_PRODUCTVERSION\s*)("[^"]+")`)
	if !re.Match(content) {
		return fmt.Errorf("could not find '!define INFO_PRODUCTVERSION ...' declaration in project.nsi")
	}

	newContent := re.ReplaceAll(content, []byte(fmt.Sprintf(`!define INFO_PRODUCTVERSION "%s"`, version)))
	return os.WriteFile(path, newContent, 0644)
}
