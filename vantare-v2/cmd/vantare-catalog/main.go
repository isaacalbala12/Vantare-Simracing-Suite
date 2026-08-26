// vantare-catalog compone un Catalog v1 sin firmar y, en un segundo paso,
// firma el artefacto revisado. No publica ni usa red.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
)

func main() {
	if err := run(os.Args[1:], os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "vantare-catalog: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string, stderr io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("expected build or sign subcommand")
	}
	switch args[0] {
	case "build":
		return runBuild(args[1:], stderr)
	case "sign":
		return runSign(args[1:], stderr)
	default:
		return fmt.Errorf("unknown subcommand %q", args[0])
	}
}

func requireNoPositionals(flags *flag.FlagSet) error {
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments")
	}
	return nil
}
