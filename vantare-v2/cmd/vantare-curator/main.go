// vantare-curator predigiere CurationBundle v1 en un resumen editorial
// determinista. No publica, firma ni entrega datos crudos a un LLM.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

func main() {
	if err := run(os.Args[1:], os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "vantare-curator: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string, stderr io.Writer) error {
	flags := flag.NewFlagSet("vantare-curator", flag.ContinueOnError)
	flags.SetOutput(stderr)
	input := flags.String("in", "", "directorio con test/controlled-capture/production-community")
	output := flags.String("out", "", "ruta del resumen JSON compacto")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse flags: %w", err)
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments")
	}
	if *input == "" || *output == "" {
		return fmt.Errorf("both --in and --out are required")
	}
	inside, err := pathInside(*input, *output)
	if err != nil {
		return err
	}
	if inside {
		return fmt.Errorf("--out must be outside --in so repeated runs cannot ingest their own output")
	}
	encoded, err := buildSummary(*input)
	if err != nil {
		return err
	}
	if err := os.WriteFile(*output, encoded, 0o644); err != nil {
		return fmt.Errorf("write output summary: %w", err)
	}
	return nil
}

func pathInside(parent, candidate string) (bool, error) {
	parentAbsolute, err := filepath.Abs(parent)
	if err != nil {
		return false, fmt.Errorf("resolve --in: %w", err)
	}
	candidateAbsolute, err := filepath.Abs(candidate)
	if err != nil {
		return false, fmt.Errorf("resolve --out: %w", err)
	}
	relative, err := filepath.Rel(parentAbsolute, candidateAbsolute)
	if err != nil {
		return false, fmt.Errorf("compare --in and --out: %w", err)
	}
	return relative != ".." && !filepath.IsAbs(relative) && !stringsHasParentPrefix(relative), nil
}

func stringsHasParentPrefix(path string) bool {
	return len(path) >= 3 && path[:3] == ".."+string(filepath.Separator)
}
