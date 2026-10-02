// native-oracle compiles the frozen Go production pipeline, never the native code.
package main

import (
	"archive/tar"
	"bytes"
	"context"
	_ "embed"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const goCommit = "3ced668f22aa79819aefae059d28b15d52452274"

//go:embed bridge/oracle_test.go
var bridge []byte

func main() {
	output := flag.String("out", "native/runtime/testdata/oracle", "new output directory (never overwrites)")
	flag.Parse()
	if err := freeze(context.Background(), *output); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func freeze(ctx context.Context, output string) error {
	root, err := filepath.Abs(".")
	if err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(root, "go.mod")); err != nil {
		return fmt.Errorf("run from vantare-v2: %w", err)
	}
	output, err = filepath.Abs(output)
	if err != nil {
		return err
	}
	if _, err := os.Stat(output); !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("output must not exist: %s (stat: %v)", output, err)
	}
	// Only compile tracked production Go sources from this exact commit. Tests
	// from that branch are excluded; the bridge is the sole replay harness.
	scratch, err := os.MkdirTemp("", "vantare-native-oracle-")
	if err != nil {
		return err
	}
	defer func() {
		if err := os.RemoveAll(scratch); err != nil {
			fmt.Fprintln(os.Stderr, "remove oracle scratch:", err)
		}
	}()
	archive := exec.CommandContext(ctx, "git", "archive", "--format=tar", goCommit, "vantare-v2/go.mod", "vantare-v2/go.sum", "vantare-v2/internal")
	archive.Dir = filepath.Dir(root)
	var stderr bytes.Buffer
	archive.Stderr = &stderr
	pipe, err := archive.StdoutPipe()
	if err != nil {
		return err
	}
	if err := archive.Start(); err != nil {
		return err
	}
	extractErr := extractGo(tar.NewReader(pipe), scratch)
	// Drain even after failure so the child cannot block writing the archive.
	_, drainErr := io.Copy(io.Discard, pipe)
	waitErr := archive.Wait()
	if err := errors.Join(extractErr, drainErr, waitErr); err != nil {
		return fmt.Errorf("export frozen Go %s: %w; %s", goCommit, err, &stderr)
	}
	module := filepath.Join(scratch, "vantare-v2")
	if err := os.WriteFile(filepath.Join(module, "internal/telemetry/drivers/lmu/native_oracle_test.go"), bridge, 0o600); err != nil {
		return err
	}
	command := exec.CommandContext(ctx, "go", "test", "-p", "4", "-tags", "native_oracle", "./internal/telemetry/drivers/lmu", "-run", "^TestNativeOracleFreeze$", "-count=1", "-v", "-timeout", "5m")
	command.Dir = module
	command.Env = append(os.Environ(), "NATIVE_ORACLE_ROOT="+root, "NATIVE_ORACLE_OUT="+output, "NATIVE_ORACLE_GO_COMMIT="+goCommit, "GOWORK=off")
	command.Stdout, command.Stderr = os.Stdout, os.Stderr
	if err := command.Run(); err != nil {
		return fmt.Errorf("frozen production pipeline: %w", err)
	}
	return nil
}

func extractGo(reader *tar.Reader, scratch string) error {
	for {
		header, err := reader.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		if header.Typeflag != tar.TypeReg || strings.HasSuffix(header.Name, "_test.go") ||
			!(strings.HasSuffix(header.Name, ".go") || header.Name == "vantare-v2/go.mod" || header.Name == "vantare-v2/go.sum") {
			continue
		}
		name := filepath.Clean(filepath.FromSlash(header.Name))
		if filepath.IsAbs(name) || name == ".." || strings.HasPrefix(name, ".."+string(filepath.Separator)) {
			return fmt.Errorf("unsafe archive path: %s", header.Name)
		}
		path := filepath.Join(scratch, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
			return err
		}
		content, err := io.ReadAll(reader)
		if err != nil {
			return err
		}
		if err := os.WriteFile(path, content, 0o600); err != nil {
			return err
		}
	}
}
