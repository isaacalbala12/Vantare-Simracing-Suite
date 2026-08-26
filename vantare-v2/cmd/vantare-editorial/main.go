// vantare-editorial proyecta el resumen determinista del curador a artefactos
// locales de revisión. No calcula rankings, firma, publica ni usa red.
package main

import (
	"flag"
	"fmt"
	"io"
	"os"
)

func main() {
	if err := run(os.Args[1:], os.Stderr); err != nil {
		fmt.Fprintf(os.Stderr, "vantare-editorial: %v\n", err)
		os.Exit(1)
	}
}

func run(args []string, stderr io.Writer) error {
	if len(args) == 0 {
		return fmt.Errorf("expected report, decision-template or approve subcommand")
	}
	switch args[0] {
	case "report":
		return runReport(args[1:], stderr)
	case "decision-template":
		return runDecisionTemplate(args[1:], stderr)
	case "approve":
		return runApprove(args[1:], stderr)
	default:
		return fmt.Errorf("unknown subcommand %q", args[0])
	}
}

func runReport(args []string, stderr io.Writer) error {
	return transformFile(args, stderr, "report", "informe Markdown", buildReport)
}

func runDecisionTemplate(args []string, stderr io.Writer) error {
	return transformFile(args, stderr, "decision-template", "plantilla de decisión", buildDecisionTemplate)
}

func transformFile(args []string, stderr io.Writer, name, outputDescription string, transform func([]byte) ([]byte, error)) error {
	flags := flag.NewFlagSet("vantare-editorial "+name, flag.ContinueOnError)
	flags.SetOutput(stderr)
	summaryPath := flags.String("summary", "", "resumen determinista de vantare-curator")
	outputPath := flags.String("out", "", outputDescription)
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse %s flags: %w", name, err)
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments")
	}
	if *summaryPath == "" || *outputPath == "" {
		return fmt.Errorf("--summary and --out are required")
	}
	summaryBytes, err := os.ReadFile(*summaryPath)
	if err != nil {
		return fmt.Errorf("read curator summary: %w", err)
	}
	output, err := transform(summaryBytes)
	if err != nil {
		return err
	}
	if err := os.WriteFile(*outputPath, output, 0o644); err != nil {
		return fmt.Errorf("write %s: %w", outputDescription, err)
	}
	return nil
}

func runApprove(args []string, stderr io.Writer) error {
	flags := flag.NewFlagSet("vantare-editorial approve", flag.ContinueOnError)
	flags.SetOutput(stderr)
	summaryPath := flags.String("summary", "", "resumen determinista de vantare-curator")
	decisionPath := flags.String("decision", "", "decisión editada y aprobada por Isaac")
	outputPath := flags.String("out", "", "selección validada para vantare-catalog")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse approve flags: %w", err)
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected positional arguments")
	}
	if *summaryPath == "" || *decisionPath == "" || *outputPath == "" {
		return fmt.Errorf("--summary, --decision and --out are required")
	}
	summaryBytes, err := os.ReadFile(*summaryPath)
	if err != nil {
		return fmt.Errorf("read curator summary: %w", err)
	}
	decisionBytes, err := os.ReadFile(*decisionPath)
	if err != nil {
		return fmt.Errorf("read approved decision: %w", err)
	}
	selection, err := buildApprovedSelection(summaryBytes, decisionBytes)
	if err != nil {
		return err
	}
	if err := os.WriteFile(*outputPath, selection, 0o644); err != nil {
		return fmt.Errorf("write approved selection: %w", err)
	}
	return nil
}
