package main

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

func runCLI(args []string, stdout, stderr io.Writer) int {
	return runCLIWithDeps(args, stdout, stderr, func(projectDir string) existingBackendV1 {
		return newProductionExistingBackendV1(projectDir)
	}, writeAtomicExclusiveV1, os.Getwd)
}

func runCLIWithDeps(args []string, stdout, stderr io.Writer, backendFactory func(string) existingBackendV1, writeOutput func(string, []byte) error, getwd func() (string, error)) int {
	fs := flag.NewFlagSet("ta04f6-cohort-selector", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	mode := fs.String("mode", "synthetic", "")
	protocol := fs.String("protocol-sha", "", "")
	runner := fs.String("runner-sha", "", "")
	output := fs.String("output", "", "")
	if err := fs.Parse(args); err != nil {
		fmt.Fprintln(stderr, CodeDataInvalid)
		return 2
	}
	if *mode == "synthetic" {
		if *protocol != "" || *runner != "" || *output != "" || fs.NArg() != 0 {
			fmt.Fprintln(stderr, CodeDataInvalid)
			return 2
		}
		b, err := RunSyntheticV1()
		if err != nil {
			fmt.Fprintln(stderr, CodeDataInvalid)
			return 1
		}
		if _, err := stdout.Write(append(b, '\n')); err != nil {
			fmt.Fprintln(stderr, CodePipelineFault)
			return 1
		}
		return 0
	}
	if *mode == "existing-authorized" {
		if fs.NArg() != 0 || *protocol == "" || *runner == "" || *output == "" || backendFactory == nil || writeOutput == nil || getwd == nil {
			fmt.Fprintln(stderr, CodeDataInvalid)
			return 2
		}
		projectDir, err := getwd()
		if err != nil {
			fmt.Fprintln(stderr, CodePipelineFault)
			return 1
		}
		projectDir, err = filepath.Abs(projectDir)
		if err != nil {
			fmt.Fprintln(stderr, CodePipelineFault)
			return 1
		}
		projectDir = filepath.Clean(projectDir)
		rawOutput := *output
		if filepath.Clean(rawOutput) != rawOutput || rawOutput != expectedOutputPath {
			fmt.Fprintln(stderr, CodeDataInvalid)
			return 2
		}
		outputPath := rawOutput
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Minute)
		defer cancel()
		cfg := ExistingConfigV1{ProtocolSHA: *protocol, RunnerSHA: *runner, OutputPath: outputPath}
		manifest, err := runExistingWithBackend(ctx, cfg, backendFactory(projectDir), rand.Reader)
		if err != nil {
			fmt.Fprintln(stderr, CodePipelineFault)
			return 1
		}
		encoded, err := json.MarshalIndent(manifest, "", "  ")
		if err != nil || writeOutput(outputPath, append(encoded, '\n')) != nil {
			fmt.Fprintln(stderr, CodePipelineFault)
			return 1
		}
		status, _ := json.Marshal(struct {
			Outcome string `json:"outcome"`
		}{manifest.Outcome})
		_, _ = stdout.Write(append(status, '\n'))
		return 0
	}
	fmt.Fprintln(stderr, CodeDataInvalid)
	return 2
}
func main() { os.Exit(runCLI(os.Args[1:], os.Stdout, os.Stderr)) }
