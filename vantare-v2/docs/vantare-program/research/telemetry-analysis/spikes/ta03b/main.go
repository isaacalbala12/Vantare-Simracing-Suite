package main

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"database/sql/driver"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	duckdb "github.com/duckdb/duckdb-go/v2"
)

const syntheticRows = 720_000

type result struct {
	GoVersion          string   `json:"goVersion"`
	DuckDBVersion      string   `json:"duckdbVersion"`
	OperatingSystem    string   `json:"operatingSystem"`
	Architecture       string   `json:"architecture"`
	StaticExtensions   []string `json:"staticExtensions"`
	Rows               int      `json:"rows"`
	CreateMilliseconds int64    `json:"createMilliseconds"`
	OpenMilliseconds   int64    `json:"openMilliseconds"`
	PageMilliseconds   float64  `json:"meanPageMilliseconds"`
	Pages              int      `json:"pages"`
	HashStable         bool     `json:"hashStable"`
	ReadOnlyEnforced   bool     `json:"readOnlyEnforced"`
	Cancellation       bool     `json:"cancellationObserved"`
	CancelMilliseconds float64  `json:"cancellationMilliseconds"`
	TypesAndNulls      bool     `json:"typesAndNullsPreserved"`
	QuotedIdentifier   bool     `json:"quotedIdentifierAccepted"`
}

func main() {
	workDir := flag.String("work-dir", "", "directory for the disposable synthetic database")
	pages := flag.Int("pages", 50, "number of 16,384-row pages to read")
	flag.Parse()

	if *workDir == "" {
		fatal(errors.New("-work-dir is required"))
	}
	if *pages < 1 || *pages > 500 {
		fatal(fmt.Errorf("-pages must be between 1 and 500, got %d", *pages))
	}
	if err := os.MkdirAll(*workDir, 0o755); err != nil {
		fatal(fmt.Errorf("create work directory: %w", err))
	}

	dbPath := filepath.Join(*workDir, "ta03b-synthetic.duckdb")
	_ = os.Remove(dbPath)
	_ = os.Remove(dbPath + ".wal")

	started := time.Now()
	if err := createSyntheticDatabase(dbPath); err != nil {
		fatal(err)
	}
	createDuration := time.Since(started)

	before, err := fileHash(dbPath)
	if err != nil {
		fatal(err)
	}

	openStarted := time.Now()
	db, err := sql.Open("duckdb", dbPath+"?access_mode=read_only")
	if err != nil {
		fatal(fmt.Errorf("open read-only database: %w", err))
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	extensionDir := filepath.Join(*workDir, "extensions")
	if err := os.MkdirAll(extensionDir, 0o700); err != nil {
		fatal(fmt.Errorf("create private extension directory: %w", err))
	}
	tempDir := filepath.Join(*workDir, "duckdb-temp")
	if err := os.MkdirAll(tempDir, 0o700); err != nil {
		fatal(fmt.Errorf("create private DuckDB temp directory: %w", err))
	}
	if err := db.PingContext(ctx); err != nil {
		fatal(fmt.Errorf("ping read-only database: %w", err))
	}
	if err := prepareConnection(ctx, db, extensionDir, tempDir); err != nil {
		fatal(err)
	}
	duckDBVersion, staticExtensions, err := runtimeInventory(ctx, db)
	if err != nil {
		fatal(err)
	}
	if err := lockDownConnection(ctx, db); err != nil {
		fatal(err)
	}
	openDuration := time.Since(openStarted)

	typesAndNulls, err := verifyTypesAndNulls(ctx, db)
	if err != nil {
		fatal(err)
	}
	quotedIdentifier, err := verifyQuotedIdentifier(ctx, db)
	if err != nil {
		fatal(err)
	}
	readOnlyEnforced := verifyReadOnly(ctx, db)
	cancellationObserved, cancellationDuration, err := verifyCancellation(db)
	if err != nil {
		fatal(err)
	}
	pageDuration, err := benchmarkPages(ctx, db, *pages)
	if err != nil {
		fatal(err)
	}

	after, err := fileHash(dbPath)
	if err != nil {
		fatal(err)
	}

	answer := result{
		GoVersion:          runtime.Version(),
		DuckDBVersion:      duckDBVersion,
		OperatingSystem:    runtime.GOOS,
		Architecture:       runtime.GOARCH,
		StaticExtensions:   staticExtensions,
		Rows:               syntheticRows,
		CreateMilliseconds: createDuration.Milliseconds(),
		OpenMilliseconds:   openDuration.Milliseconds(),
		PageMilliseconds:   float64(pageDuration.Microseconds()) / 1000 / float64(*pages),
		Pages:              *pages,
		HashStable:         before == after,
		ReadOnlyEnforced:   readOnlyEnforced,
		Cancellation:       cancellationObserved,
		CancelMilliseconds: float64(cancellationDuration.Microseconds()) / 1000,
		TypesAndNulls:      typesAndNulls,
		QuotedIdentifier:   quotedIdentifier,
	}

	encoded, err := json.MarshalIndent(answer, "", "  ")
	if err != nil {
		fatal(fmt.Errorf("encode result: %w", err))
	}
	fmt.Println(string(encoded))

	if !answer.HashStable || !answer.ReadOnlyEnforced || !answer.Cancellation || !answer.TypesAndNulls || !answer.QuotedIdentifier {
		os.Exit(2)
	}
}

func createSyntheticDatabase(path string) error {
	db, err := sql.Open("duckdb", path)
	if err != nil {
		return fmt.Errorf("open synthetic database: %w", err)
	}
	defer db.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	statements := []string{
		`CREATE TABLE "channelsList" (channelName VARCHAR, sourceTable VARCHAR, columnName VARCHAR, dataType VARCHAR)`,
		`CREATE TABLE "eventsList" (eventName VARCHAR, sourceTable VARCHAR, columnName VARCHAR, dataType VARCHAR)`,
		`CREATE TABLE "metadata" (key VARCHAR, value VARCHAR)`,
		`CREATE TABLE "Telemetry main" (row_id BIGINT, speed DOUBLE, gear INTEGER, active BOOLEAN, note VARCHAR, nullable DOUBLE)`,
		`CREATE TABLE "quote""table" (value INTEGER)`,
		`INSERT INTO "channelsList" VALUES ('speed', 'Telemetry main', 'speed', 'DOUBLE')`,
		`INSERT INTO "eventsList" VALUES ('pit_entry', 'Telemetry main', 'active', 'BOOLEAN')`,
		`INSERT INTO "metadata" VALUES ('fixture', 'synthetic-only')`,
		`INSERT INTO "quote""table" VALUES (42)`,
		fmt.Sprintf(`INSERT INTO "Telemetry main"
			SELECT i,
			       CASE WHEN i %% 1000 = 0 THEN 0.0 ELSE CAST(i %% 350 AS DOUBLE) + 0.125 END,
			       CAST(i %% 8 AS INTEGER),
			       i %% 2 = 0,
			       CASE WHEN i %% 11 = 0 THEN 'pit' ELSE '' END,
			       CASE WHEN i %% 17 = 0 THEN NULL ELSE CAST(i AS DOUBLE) / 10 END
			FROM range(%d) AS rows(i)`, syntheticRows),
		`CHECKPOINT`,
	}
	for _, statement := range statements {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			return fmt.Errorf("execute synthetic statement: %w", err)
		}
	}
	return nil
}

func prepareConnection(ctx context.Context, db *sql.DB, extensionDir, tempDir string) error {
	if _, err := db.ExecContext(ctx, `SET extension_directory = ?`, extensionDir); err != nil {
		return fmt.Errorf("set private DuckDB extension directory: %w", err)
	}
	if _, err := db.ExecContext(ctx, `SET temp_directory = ?`, tempDir); err != nil {
		return fmt.Errorf("set private DuckDB temp directory: %w", err)
	}
	settings := []string{
		`SET threads = 2`,
		`SET memory_limit = '256MB'`,
		`SET max_temp_directory_size = '64MB'`,
		`SET autoinstall_known_extensions = false`,
		`SET autoload_known_extensions = false`,
		`SET allow_community_extensions = false`,
	}
	for _, setting := range settings {
		if _, err := db.ExecContext(ctx, setting); err != nil {
			return fmt.Errorf("apply DuckDB hardening %q: %w", setting, err)
		}
	}
	return nil
}

func lockDownConnection(ctx context.Context, db *sql.DB) error {
	settings := []string{
		`SET enable_external_access = false`,
		`SET lock_configuration = true`,
	}
	for _, setting := range settings {
		if _, err := db.ExecContext(ctx, setting); err != nil {
			return fmt.Errorf("apply DuckDB lockdown %q: %w", setting, err)
		}
	}
	return nil
}

func verifyTypesAndNulls(ctx context.Context, db *sql.DB) (bool, error) {
	row := db.QueryRowContext(ctx, `SELECT speed, gear, active, note, nullable FROM "Telemetry main" WHERE row_id = 17`)
	var speed float64
	var gear int32
	var active bool
	var note string
	var nullable sql.NullFloat64
	if err := row.Scan(&speed, &gear, &active, &note, &nullable); err != nil {
		return false, fmt.Errorf("scan typed values: %w", err)
	}
	return speed == 17.125 && gear == 1 && !active && note == "" && !nullable.Valid, nil
}

func verifyQuotedIdentifier(ctx context.Context, db *sql.DB) (bool, error) {
	identifier := `quote"table`
	query := `SELECT value FROM ` + quoteIdentifier(identifier)
	var value int
	if err := db.QueryRowContext(ctx, query).Scan(&value); err != nil {
		return false, fmt.Errorf("query quoted identifier: %w", err)
	}
	return value == 42, nil
}

func verifyReadOnly(ctx context.Context, db *sql.DB) bool {
	_, err := db.ExecContext(ctx, `CREATE TABLE forbidden_write(value INTEGER)`)
	return err != nil
}

type cancellationProbe struct {
	entered    chan struct{}
	resultType duckdb.TypeInfo
	once       sync.Once
}

func newCancellationProbe() (*cancellationProbe, error) {
	resultType, err := duckdb.NewTypeInfo(duckdb.TYPE_INTEGER)
	if err != nil {
		return nil, fmt.Errorf("create cancellation probe result type: %w", err)
	}
	return &cancellationProbe{
		entered:    make(chan struct{}),
		resultType: resultType,
	}, nil
}

func (p *cancellationProbe) Config() duckdb.ScalarFuncConfig {
	return duckdb.ScalarFuncConfig{ResultTypeInfo: p.resultType, Volatile: true}
}

func (p *cancellationProbe) Executor() duckdb.ScalarFuncExecutor {
	return duckdb.ScalarFuncExecutor{
		RowContextExecutor: func(ctx context.Context, _ []driver.Value) (any, error) {
			p.once.Do(func() { close(p.entered) })
			<-ctx.Done()
			return nil, ctx.Err()
		},
	}
}

func verifyCancellation(db *sql.DB) (bool, time.Duration, error) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	conn, err := db.Conn(context.Background())
	if err != nil {
		return false, 0, fmt.Errorf("open cancellation connection: %w", err)
	}
	defer conn.Close()
	probe, err := newCancellationProbe()
	if err != nil {
		return false, 0, err
	}
	if err := duckdb.RegisterScalarUDF(conn, "ta03b_cancellation_probe", probe); err != nil {
		return false, 0, fmt.Errorf("register cancellation probe: %w", err)
	}

	done := make(chan error, 1)
	go func() {
		var value int32
		done <- conn.QueryRowContext(ctx, `SELECT ta03b_cancellation_probe()`).Scan(&value)
	}()

	startupTimer := time.NewTimer(2 * time.Second)
	defer startupTimer.Stop()
	select {
	case <-probe.entered:
	case err := <-done:
		return false, 0, fmt.Errorf("cancellation query finished before cancellation: %w", err)
	case <-startupTimer.C:
		return false, 0, errors.New("cancellation query did not begin within 2s")
	}

	cancelledAt := time.Now()
	cancel()
	completionTimer := time.NewTimer(2 * time.Second)
	defer completionTimer.Stop()
	select {
	case err := <-done:
		duration := time.Since(cancelledAt)
		if !errors.Is(err, context.Canceled) && !errors.Is(err, context.DeadlineExceeded) {
			return false, duration, fmt.Errorf("cancellation query returned incompatible error: %w", err)
		}
		return true, duration, nil
	case <-completionTimer.C:
		return false, time.Since(cancelledAt), errors.New("cancellation query did not stop within 2s")
	}
}

func runtimeInventory(ctx context.Context, db *sql.DB) (string, []string, error) {
	var version string
	if err := db.QueryRowContext(ctx, `SELECT version()`).Scan(&version); err != nil {
		return "", nil, fmt.Errorf("read DuckDB version: %w", err)
	}
	rows, err := db.QueryContext(ctx, `SELECT extension_name FROM duckdb_extensions() WHERE install_mode = 'STATICALLY_LINKED' ORDER BY extension_name`)
	if err != nil {
		return "", nil, fmt.Errorf("inventory static DuckDB extensions: %w", err)
	}
	defer rows.Close()
	var extensions []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return "", nil, fmt.Errorf("scan static DuckDB extension: %w", err)
		}
		extensions = append(extensions, name)
	}
	if err := rows.Err(); err != nil {
		return "", nil, fmt.Errorf("iterate static DuckDB extensions: %w", err)
	}
	return version, extensions, nil
}

func benchmarkPages(ctx context.Context, db *sql.DB, pages int) (time.Duration, error) {
	started := time.Now()
	for page := 0; page < pages; page++ {
		offset := (page * 16_384) % syntheticRows
		rows, err := db.QueryContext(ctx, `SELECT row_id, speed, gear, active, note, nullable FROM "Telemetry main" ORDER BY row_id LIMIT ? OFFSET ?`, 16_384, offset)
		if err != nil {
			return 0, fmt.Errorf("read page %d: %w", page, err)
		}
		for rows.Next() {
			var rowID int64
			var speed float64
			var gear int32
			var active bool
			var note string
			var nullable sql.NullFloat64
			if err := rows.Scan(&rowID, &speed, &gear, &active, &note, &nullable); err != nil {
				rows.Close()
				return 0, fmt.Errorf("scan page %d: %w", page, err)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return 0, fmt.Errorf("iterate page %d: %w", page, err)
		}
		if err := rows.Close(); err != nil {
			return 0, fmt.Errorf("close page %d: %w", page, err)
		}
	}
	return time.Since(started), nil
}

func quoteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func fileHash(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read hash input: %w", err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
