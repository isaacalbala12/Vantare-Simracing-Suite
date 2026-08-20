package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
)

const (
	reportVersion = "lmu-online-surface-probe.v1"
	maxTraceSize  = 16 << 20
	maxRESTBody   = 256 << 10
)

var (
	raceOSPattern        = regexp.MustCompile(`(?i)raceos`)
	nakamaPattern        = regexp.MustCompile(`(?i)nakama`)
	eventPattern         = regexp.MustCompile(`(?i)Joining race server for online event\s+[0-9a-f-]{36}`)
	bearerPattern        = regexp.MustCompile(`(?i)authorization\s*:\s*bearer`)
	jwtPattern           = regexp.MustCompile(`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`)
	steamPattern         = regexp.MustCompile(`(?:^|[^0-9])7656119[0-9]{10}(?:$|[^0-9])`)
	onlineURLPattern     = regexp.MustCompile(`https://[A-Za-z0-9.-]*(?:raceos\.gg|nakamacloud\.io)(?:/[^\s"'<>]*)?`)
	uuidSegmentPattern   = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f-]{27}$`)
	digitsSegmentPattern = regexp.MustCompile(`^[0-9]{6,}$`)
	safeRouteSegments    = stringSet(
		"api", "v1", "v2", "v3", "notifications", "global", "events", "event",
		"users", "user", "profiles", "profile", "standings", "results", "result",
		"history", "ratings", "rating", "leaderboards", "leaderboard", "sessions",
		"session", "drivers", "driver", "competitions", "competition", "championships",
		"championship", "series", "races", "race",
	)
	safeSchemaKeys = stringSet(
		"loadingStatus", "loading", "loadingData", "percentage", "track", "displayProperties",
		"dlcappID", "length", "owned", "premId", "sceneDesc", "sig", "type", "venue",
		"state", "appBuild", "gamePhase", "gameSession", "gameState", "internalStateCode",
		"navigationState", "settingMode", "steamBetaBranchName", "admin", "userState", "user",
		"profile", "profiles", "steamId", "rows", "driver", "drivers", "driverRank", "rating", "ratings", "rank", "position",
		"class", "car", "team", "teams", "result", "results", "standings", "history",
		"session", "sessions", "event", "events", "page", "pages", "total", "items",
	)
)

func stringSet(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

type report struct {
	Version string         `json:"version"`
	Trace   traceReport    `json:"trace"`
	REST    []endpointScan `json:"rest"`
}

type traceReport struct {
	Files []traceFileScan `json:"files"`
}

type onlineRoute struct {
	Origin   string `json:"origin"`
	Path     string `json:"path"`
	Mentions int    `json:"mentions"`
}

type traceFileScan struct {
	File                string        `json:"file"`
	Bytes               int64         `json:"bytes"`
	Truncated           bool          `json:"truncated"`
	RaceOSMentions      int           `json:"raceos_mentions"`
	NakamaMentions      int           `json:"nakama_mentions"`
	OnlineEventJoins    int           `json:"online_event_joins"`
	BearerHeaderMarkers int           `json:"bearer_header_markers"`
	JWTLikeValues       int           `json:"jwt_like_values"`
	SteamIDLikeValues   int           `json:"steam_id_like_values"`
	OnlineRoutes        []onlineRoute `json:"online_routes,omitempty"`
}

type endpointScan struct {
	Path          string   `json:"path"`
	Status        int      `json:"status,omitempty"`
	Bytes         int      `json:"bytes"`
	JSONDocuments int      `json:"json_documents"`
	Schema        []string `json:"schema,omitempty"`
	Outcome       string   `json:"outcome"`
}

type options struct {
	logDir   string
	restBase string
	maxFiles int
	timeout  time.Duration
	skipREST bool
}

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string, stdout io.Writer) error {
	var opts options
	flags := flag.NewFlagSet("lmu-online-surface-probe", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&opts.logDir, "log-dir", "", "explicit LMU UserData/Log directory")
	flags.StringVar(&opts.restBase, "rest-base", "http://127.0.0.1:6397", "LMU loopback REST base URL")
	flags.IntVar(&opts.maxFiles, "max-files", 8, "maximum recent trace files to inspect")
	flags.DurationVar(&opts.timeout, "timeout", 3*time.Second, "timeout per local REST endpoint")
	flags.BoolVar(&opts.skipREST, "skip-rest", false, "skip the local REST schema probe")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("parse flags: %w", err)
	}
	if flags.NArg() != 0 {
		return errors.New("positional arguments are not supported")
	}
	if opts.logDir == "" {
		return errors.New("-log-dir is required; the probe never discovers personal paths automatically")
	}
	if opts.maxFiles < 1 || opts.maxFiles > 100 {
		return errors.New("-max-files must be between 1 and 100")
	}
	if opts.timeout <= 0 || opts.timeout > 30*time.Second {
		return errors.New("-timeout must be greater than zero and at most 30s")
	}
	if !opts.skipREST {
		validatedBase, err := validateLoopbackBase(opts.restBase)
		if err != nil {
			return err
		}
		opts.restBase = validatedBase
	}

	trace, err := scanTraceDirectory(opts.logDir, opts.maxFiles)
	if err != nil {
		return err
	}

	result := report{Version: reportVersion, Trace: trace}
	if !opts.skipREST {
		client := &http.Client{
			Timeout: opts.timeout,
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return errors.New("redirects disabled")
			},
		}
		for _, path := range []string{
			"/navigation/state",
			"/rest/multiplayer/teams",
			"/rest/watch/sessionInfo",
			"/rest/watch/standings",
		} {
			result.REST = append(result.REST, probeEndpoint(context.Background(), client, opts.restBase, path))
		}
	}

	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return fmt.Errorf("encode report: %w", err)
	}
	return nil
}

func scanTraceDirectory(logDir string, maxFiles int) (traceReport, error) {
	resolvedDir, err := validateExplicitDirectory(logDir)
	if err != nil {
		return traceReport{}, err
	}
	entries, err := os.ReadDir(resolvedDir)
	if err != nil {
		return traceReport{}, errors.New("read explicit log directory")
	}

	type candidate struct {
		name    string
		modTime time.Time
	}
	var candidates []candidate
	for _, entry := range entries {
		if entry.IsDir() || entry.Type()&os.ModeSymlink != 0 || !strings.HasPrefix(strings.ToLower(entry.Name()), "trace") || !strings.HasSuffix(strings.ToLower(entry.Name()), ".txt") {
			continue
		}
		info, err := entry.Info()
		if err != nil || info.Size() == 0 {
			continue
		}
		candidates = append(candidates, candidate{name: entry.Name(), modTime: info.ModTime()})
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].modTime.Equal(candidates[j].modTime) {
			return candidates[i].name < candidates[j].name
		}
		return candidates[i].modTime.After(candidates[j].modTime)
	})
	if len(candidates) > maxFiles {
		candidates = candidates[:maxFiles]
	}

	result := traceReport{Files: make([]traceFileScan, 0, len(candidates))}
	for index, candidate := range candidates {
		scan, err := scanTraceFile(filepath.Join(resolvedDir, candidate.name), fmt.Sprintf("trace-%d", index+1))
		if err != nil {
			return traceReport{}, err
		}
		result.Files = append(result.Files, scan)
	}
	return result, nil
}

func validateExplicitDirectory(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", errors.New("resolve explicit log directory")
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		switch {
		case os.IsNotExist(err):
			return "", errors.New("explicit log directory not found")
		case os.IsPermission(err):
			return "", errors.New("explicit log directory permission denied")
		default:
			return "", errors.New("resolve explicit log directory")
		}
	}
	if !strings.EqualFold(filepath.Clean(abs), filepath.Clean(resolved)) {
		return "", errors.New("explicit log directory must not traverse a symlink or junction")
	}
	info, err := os.Stat(resolved)
	if err != nil || !info.IsDir() {
		return "", errors.New("explicit log directory is not a directory")
	}
	return resolved, nil
}

func validateLoopbackBase(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.Host == "" || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("-rest-base must be an HTTP loopback origin without path, query, fragment, or credentials")
	}
	host := parsed.Hostname()
	ip := net.ParseIP(host)
	if ip == nil || !ip.IsLoopback() {
		return "", errors.New("-rest-base must use a numeric loopback address")
	}
	return strings.TrimRight(parsed.String(), "/"), nil
}

func scanTraceFile(path, reportName string) (traceFileScan, error) {
	linkInfo, err := os.Lstat(path)
	if err != nil || linkInfo.Mode()&os.ModeSymlink != 0 || !linkInfo.Mode().IsRegular() {
		return traceFileScan{}, errors.New("trace entry is not a regular file")
	}
	file, err := os.Open(path)
	if err != nil {
		return traceFileScan{}, errors.New("open trace file")
	}
	defer file.Close()

	info, err := file.Stat()
	if err != nil {
		return traceFileScan{}, errors.New("stat trace file")
	}
	start := max(info.Size()-maxTraceSize, 0)
	window := io.NewSectionReader(file, start, info.Size()-start)
	reader := bufio.NewReader(window)
	if start > 0 {
		_, _ = reader.ReadBytes('\n')
	}
	scanner := bufio.NewScanner(reader)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)

	result := traceFileScan{
		File:      reportName,
		Bytes:     info.Size(),
		Truncated: info.Size() > maxTraceSize,
	}
	routeCounts := make(map[string]int)
	for scanner.Scan() {
		line := scanner.Bytes()
		result.RaceOSMentions += len(raceOSPattern.FindAll(line, -1))
		result.NakamaMentions += len(nakamaPattern.FindAll(line, -1))
		result.OnlineEventJoins += len(eventPattern.FindAll(line, -1))
		result.BearerHeaderMarkers += len(bearerPattern.FindAll(line, -1))
		result.JWTLikeValues += len(jwtPattern.FindAll(line, -1))
		result.SteamIDLikeValues += len(steamPattern.FindAll(line, -1))
		for _, rawURL := range onlineURLPattern.FindAllString(string(line), -1) {
			origin, path, ok := safeOnlineRoute(rawURL)
			if ok {
				routeCounts[origin+"\x00"+path]++
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return traceFileScan{}, errors.New("scan trace file")
	}
	keys := make([]string, 0, len(routeCounts))
	for key := range routeCounts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		parts := strings.SplitN(key, "\x00", 2)
		result.OnlineRoutes = append(result.OnlineRoutes, onlineRoute{
			Origin: parts[0], Path: parts[1], Mentions: routeCounts[key],
		})
	}
	return result, nil
}

func safeOnlineRoute(raw string) (string, string, bool) {
	parsed, err := url.Parse(strings.TrimRight(raw, ".,);]"))
	if err != nil || parsed.Scheme != "https" {
		return "", "", false
	}
	host := strings.ToLower(parsed.Hostname())
	origin := ""
	switch {
	case host == "raceos.gg" || strings.HasSuffix(host, ".raceos.gg"):
		origin = "https://raceos.gg"
	case host == "nakamacloud.io" || strings.HasSuffix(host, ".nakamacloud.io"):
		origin = "https://nakamacloud.io"
	default:
		return "", "", false
	}
	segments := strings.Split(parsed.EscapedPath(), "/")
	for i, segment := range segments {
		decoded, decodeErr := url.PathUnescape(segment)
		if decoded == "" {
			continue
		}
		_, explicitlySafe := safeRouteSegments[strings.ToLower(decoded)]
		if decodeErr != nil || !explicitlySafe || uuidSegmentPattern.MatchString(decoded) || digitsSegmentPattern.MatchString(decoded) {
			segments[i] = "<id>"
		}
	}
	path := strings.Join(segments, "/")
	if path == "" {
		path = "/"
	}
	return origin, path, true
}

func probeEndpoint(ctx context.Context, client *http.Client, baseURL, path string) endpointScan {
	result := endpointScan{Path: path, Outcome: "unavailable"}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, strings.TrimRight(baseURL, "/")+path, nil)
	if err != nil {
		result.Outcome = "invalid_request"
		return result
	}
	resp, err := client.Do(req)
	if err != nil {
		var netErr net.Error
		if errors.Is(err, context.DeadlineExceeded) || errors.As(err, &netErr) && netErr.Timeout() {
			result.Outcome = "timeout"
		}
		return result
	}
	defer resp.Body.Close()
	result.Status = resp.StatusCode

	body, readErr := io.ReadAll(io.LimitReader(resp.Body, maxRESTBody))
	result.Bytes = len(body)
	documents, schema := schemaFromBody(body)
	result.JSONDocuments = documents
	result.Schema = schema
	switch {
	case readErr != nil:
		result.Outcome = "read_incomplete"
	case documents > 0:
		result.Outcome = "json_schema_only"
	case len(body) == 0:
		result.Outcome = "empty"
	default:
		result.Outcome = "non_json_omitted"
	}
	return result
}

func schemaFromBody(body []byte) (int, []string) {
	var documents []any
	var value any
	if json.Unmarshal(body, &value) == nil {
		documents = append(documents, value)
	} else {
		scanner := bufio.NewScanner(strings.NewReader(string(body)))
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			line = strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			var eventValue any
			if json.Unmarshal([]byte(line), &eventValue) == nil {
				documents = append(documents, eventValue)
			}
		}
	}

	paths := make(map[string]struct{})
	for _, document := range documents {
		collectSchema(paths, "", document, 0)
	}
	result := make([]string, 0, len(paths))
	for path := range paths {
		result = append(result, path)
	}
	sort.Strings(result)
	return len(documents), result
}

func collectSchema(paths map[string]struct{}, prefix string, value any, depth int) {
	if depth > 6 || value == nil {
		return
	}
	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			safeKey := sanitizedSchemaKey(key)
			path := safeKey
			if prefix != "" {
				path = prefix + "." + safeKey
			}
			paths[path+":"+jsonKind(typed[key])] = struct{}{}
			collectSchema(paths, path, typed[key], depth+1)
		}
	case []any:
		for _, item := range typed {
			collectSchema(paths, prefix+"[]", item, depth+1)
		}
	}
}

func sanitizedSchemaKey(key string) string {
	if _, ok := safeSchemaKeys[key]; ok {
		return key
	}
	return "<field>"
}

func jsonKind(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case bool:
		return "bool"
	case float64:
		return "number"
	case string:
		return "string"
	case []any:
		return "array"
	case map[string]any:
		return "object"
	default:
		return "unknown"
	}
}
