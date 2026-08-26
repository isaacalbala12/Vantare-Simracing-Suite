// Command synthetic-fixture creates test-only DuckDB data for TA-03C.
// It never reads user telemetry and is not included in the product runtime.
package main

import (
	"context"
	"database/sql"
	"flag"
	"fmt"
	"os"

	_ "github.com/duckdb/duckdb-go/v2"
)

const longEventRows = 16_385

func main() {
	var output string
	var rows int64
	var slow bool
	flag.StringVar(&output, "output", "", "absolute output .duckdb path")
	flag.Int64Var(&rows, "rows", 1_000, "continuous samples")
	flag.BoolVar(&slow, "slow", false, "include a deliberately expensive event view")
	flag.Parse()
	if output == "" || rows <= 0 {
		fmt.Fprintln(os.Stderr, "invalid synthetic fixture options")
		os.Exit(2)
	}
	if err := create(output, rows, slow); err != nil {
		fmt.Fprintln(os.Stderr, "synthetic fixture failed")
		os.Exit(1)
	}
}

func create(path string, rowCount int64, slow bool) error {
	db, err := sql.Open("duckdb", path)
	if err != nil {
		return err
	}
	defer db.Close()
	statements := []string{
		`CREATE TABLE "channelsList" (channelName VARCHAR, frequency INTEGER, unit VARCHAR)`,
		`CREATE TABLE "eventsList" (eventName VARCHAR, unit VARCHAR)`,
		`CREATE TABLE "metadata" (key VARCHAR, value VARCHAR)`,
		`CREATE TABLE "speed" AS SELECT i::DOUBLE AS value FROM range(?) values(i)`,
		`CREATE TABLE "long_event" AS SELECT i::DOUBLE AS ts, i::BIGINT AS value FROM range(?) values(i)`,
		`CREATE TABLE "quote""table" (value BIGINT, active BOOLEAN, note VARCHAR, nullable DOUBLE)`,
		`CREATE TABLE "pit" (ts DOUBLE, value BOOLEAN)`,
		`INSERT INTO "channelsList" VALUES ('quote"table', 50, ''), ('speed', 100, 'km/h')`,
		`INSERT INTO "eventsList" VALUES ('long_event', ''), ('pit', '')`,
		`INSERT INTO "metadata" VALUES ('DriverName', 'Synthetic Private Driver'), ('TrackName', 'Synthetic Track')`,
		`INSERT INTO "quote""table" VALUES (0, false, '', NULL), (2, true, 'ok', 1.5)`,
		`INSERT INTO "pit" VALUES (1.0, false), (2.0, true)`,
	}
	for index, statement := range statements {
		var execErr error
		if index == 3 {
			_, execErr = db.ExecContext(context.Background(), statement, rowCount)
		} else if index == 4 {
			_, execErr = db.ExecContext(context.Background(), statement, longEventRows)
		} else {
			_, execErr = db.ExecContext(context.Background(), statement)
		}
		if execErr != nil {
			return execErr
		}
	}
	if slow {
		if _, err := db.ExecContext(context.Background(), `CREATE VIEW "slow_event" AS SELECT i::DOUBLE AS ts, i::BIGINT AS value FROM range(1000000000000) values(i)`); err != nil {
			return err
		}
		if _, err := db.ExecContext(context.Background(), `INSERT INTO "eventsList" VALUES ('slow_event', '')`); err != nil {
			return err
		}
	}
	_, err = db.ExecContext(context.Background(), `CHECKPOINT`)
	return err
}
