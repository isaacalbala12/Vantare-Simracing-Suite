package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	reportVersion  = "lmu-session-schema-probe.v1"
	expectedName   = "coherent_local_storage.json"
	maxFileSize    = 4 << 20
	maxDepth       = 32
	maxNodes       = 100_000
	maxSchemaPaths = 2_048
)

var (
	jwtLikePattern   = regexp.MustCompile(`^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$`)
	steamIDPattern   = regexp.MustCompile(`^7656119[0-9]{10}$`)
	uuidPattern      = regexp.MustCompile(`(?i)^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	opaquePattern    = regexp.MustCompile(`^[A-Za-z0-9_+./=-]{32,}$`)
	staticMarkers    = []string{"authorization", "bearer", "nakama", "raceos", "refresh", "session", "steam", "ticket", "token"}
	safeSchemaFields = canonicalFields(
		"access_token", "accesstoken", "account", "auth", "authorization", "bearer",
		"created_at", "createdat", "data", "expires", "expires_at", "expires_in",
		"expiry", "expiration", "id", "key", "local_storage", "localstorage", "nakama",
		"origin", "profile", "raceos", "refresh_token", "refreshtoken", "session",
		"session_token", "sessiontoken", "steam", "steam_id", "steamid", "ticket", "token",
		"type", "updated_at", "updatedat", "user", "user_id", "userid", "value", "version",
	)
	safeJWTClaims = canonicalFields(
		"aud", "exp", "iat", "iss", "jti", "nbf", "permissions", "role", "roles", "scope",
		"scopes", "session_id", "sid", "steam_id", "sub", "uid", "user_id", "usn", "vrs",
	)
)

type report struct {
	Version             string         `json:"version"`
	Outcome             string         `json:"outcome"`
	Bytes               int            `json:"bytes"`
	RootType            string         `json:"root_type"`
	Nodes               int            `json:"nodes"`
	MaximumDepth        int            `json:"maximum_depth"`
	Schema              []string       `json:"schema,omitempty"`
	RedactedFieldNames  int            `json:"redacted_field_names"`
	StringMarkers       map[string]int `json:"string_markers,omitempty"`
	SensitiveCandidates candidateCount `json:"sensitive_candidates"`
	JWTPayloadSchemas   []jwtSchema    `json:"jwt_payload_schemas,omitempty"`
	JWTExpiry           jwtExpiry      `json:"jwt_expiry"`
}

type candidateCount struct {
	BearerLike  int `json:"bearer_like"`
	JWTLike     int `json:"jwt_like"`
	OpaqueLike  int `json:"opaque_like"`
	SteamIDLike int `json:"steam_id_like"`
	UUIDLike    int `json:"uuid_like"`
}

type jwtSchema struct {
	Count  int      `json:"count"`
	Schema []string `json:"schema"`
}

type jwtExpiry struct {
	Expired          int `json:"expired"`
	Unexpired        int `json:"unexpired"`
	MissingOrInvalid int `json:"missing_or_invalid"`
}

type options struct {
	filePath string
	confirm  bool
}

type collector struct {
	nodes              int
	maximumDepth       int
	redactedFieldNames int
	paths              map[string]struct{}
	markers            map[string]int
	candidates         candidateCount
	jwtSchemas         map[string]int
	jwtExpiry          jwtExpiry
}

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(args []string, stdout io.Writer) error {
	var opts options
	flags := flag.NewFlagSet("lmu-session-schema-probe", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&opts.filePath, "file", "", "explicit coherent_local_storage.json path")
	flags.BoolVar(&opts.confirm, "confirm-sensitive-file", false, "confirm inspection of the local sensitive file")
	if err := flags.Parse(args); err != nil {
		return errors.New("parse flags")
	}
	if flags.NArg() != 0 {
		return errors.New("positional arguments are not supported")
	}
	if opts.filePath == "" {
		return errors.New("-file is required; the probe never discovers personal paths automatically")
	}
	if !opts.confirm {
		return errors.New("-confirm-sensitive-file is required")
	}

	result, err := inspectFile(opts.filePath)
	if err != nil {
		return err
	}
	encoder := json.NewEncoder(stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		return errors.New("encode sanitized report")
	}
	return nil
}

func inspectFile(path string) (report, error) {
	if !strings.EqualFold(filepath.Base(path), expectedName) {
		return report{}, errors.New("explicit file must be named coherent_local_storage.json")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return report{}, errors.New("resolve explicit file")
	}
	resolved, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return report{}, genericFileError(err)
	}
	if !strings.EqualFold(filepath.Clean(abs), filepath.Clean(resolved)) {
		return report{}, errors.New("explicit file must not traverse a symlink or junction")
	}
	linkInfo, err := os.Lstat(resolved)
	if err != nil {
		return report{}, genericFileError(err)
	}
	if linkInfo.Mode()&os.ModeSymlink != 0 || !linkInfo.Mode().IsRegular() {
		return report{}, errors.New("explicit file is not a regular file")
	}
	if linkInfo.Size() <= 0 || linkInfo.Size() > maxFileSize {
		return report{}, errors.New("explicit file size is outside the accepted range")
	}

	file, err := os.Open(resolved)
	if err != nil {
		return report{}, genericFileError(err)
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || !os.SameFile(linkInfo, openedInfo) {
		return report{}, errors.New("explicit file changed before inspection")
	}
	body, err := io.ReadAll(io.LimitReader(file, maxFileSize+1))
	if err != nil {
		return report{}, errors.New("read explicit file")
	}
	if len(body) == 0 || len(body) > maxFileSize || int64(len(body)) != openedInfo.Size() {
		return report{}, errors.New("explicit file size is outside the accepted range")
	}
	afterInfo, err := file.Stat()
	if err != nil || !os.SameFile(openedInfo, afterInfo) || openedInfo.Size() != afterInfo.Size() || !openedInfo.ModTime().Equal(afterInfo.ModTime()) {
		return report{}, errors.New("explicit file changed during inspection")
	}

	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	var root any
	if err := decoder.Decode(&root); err != nil {
		return report{}, errors.New("explicit file is not valid JSON")
	}
	if err := requireEOF(decoder); err != nil {
		return report{}, err
	}

	c := collector{paths: make(map[string]struct{}), markers: make(map[string]int), jwtSchemas: make(map[string]int)}
	if err := c.collect("", root, 0, 0); err != nil {
		return report{}, err
	}
	schema := make([]string, 0, len(c.paths))
	for path := range c.paths {
		schema = append(schema, path)
	}
	sort.Strings(schema)
	jwtSchemas := make([]jwtSchema, 0, len(c.jwtSchemas))
	jwtKeys := make([]string, 0, len(c.jwtSchemas))
	for schema := range c.jwtSchemas {
		jwtKeys = append(jwtKeys, schema)
	}
	sort.Strings(jwtKeys)
	for _, schema := range jwtKeys {
		paths := strings.Split(schema, "\n")
		jwtSchemas = append(jwtSchemas, jwtSchema{Count: c.jwtSchemas[schema], Schema: paths})
	}
	return report{
		Version:             reportVersion,
		Outcome:             "schema_only",
		Bytes:               len(body),
		RootType:            jsonKind(root),
		Nodes:               c.nodes,
		MaximumDepth:        c.maximumDepth,
		Schema:              schema,
		RedactedFieldNames:  c.redactedFieldNames,
		StringMarkers:       c.markers,
		SensitiveCandidates: c.candidates,
		JWTPayloadSchemas:   jwtSchemas,
		JWTExpiry:           c.jwtExpiry,
	}, nil
}

func requireEOF(decoder *json.Decoder) error {
	var extra any
	err := decoder.Decode(&extra)
	if errors.Is(err, io.EOF) {
		return nil
	}
	return errors.New("explicit file contains more than one JSON document")
}

func (c *collector) collect(prefix string, value any, depth, encodedDepth int) error {
	c.nodes++
	if c.nodes > maxNodes {
		return errors.New("JSON node limit exceeded")
	}
	if depth > maxDepth {
		return errors.New("JSON depth limit exceeded")
	}
	if depth > c.maximumDepth {
		c.maximumDepth = depth
	}

	switch typed := value.(type) {
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			segment, redacted := sanitizedField(key)
			if redacted {
				c.redactedFieldNames++
			}
			path := segment
			if prefix != "" {
				path = prefix + "." + segment
			}
			if err := c.addPath(path + ":" + jsonKind(typed[key])); err != nil {
				return err
			}
			if err := c.collect(path, typed[key], depth+1, encodedDepth); err != nil {
				return err
			}
		}
	case []any:
		for _, item := range typed {
			if err := c.collect(prefix+"[]", item, depth+1, encodedDepth); err != nil {
				return err
			}
		}
	case string:
		c.inspectString(typed)
		if encodedDepth < 2 {
			var nested any
			decoder := json.NewDecoder(strings.NewReader(typed))
			decoder.UseNumber()
			if decoder.Decode(&nested) == nil && requireEOF(decoder) == nil {
				switch nested.(type) {
				case map[string]any, []any:
					if err := c.addPath(prefix + ".<encoded-json>:" + jsonKind(nested)); err != nil {
						return err
					}
					if err := c.collect(prefix+".<encoded-json>", nested, depth+1, encodedDepth+1); err != nil {
						return err
					}
				}
			}
		}
	}
	return nil
}

func (c *collector) addPath(path string) error {
	c.paths[path] = struct{}{}
	if len(c.paths) > maxSchemaPaths {
		return errors.New("schema path limit exceeded")
	}
	return nil
}

func (c *collector) inspectString(value string) {
	lower := strings.ToLower(value)
	for _, marker := range staticMarkers {
		c.markers[marker] += strings.Count(lower, marker)
	}
	trimmed := strings.TrimSpace(value)
	switch {
	case strings.HasPrefix(strings.ToLower(trimmed), "bearer "):
		c.candidates.BearerLike++
	case jwtLikePattern.MatchString(trimmed):
		c.candidates.JWTLike++
		c.inspectJWTPayload(trimmed)
	case steamIDPattern.MatchString(trimmed):
		c.candidates.SteamIDLike++
	case uuidPattern.MatchString(trimmed):
		c.candidates.UUIDLike++
	case opaquePattern.MatchString(trimmed):
		c.candidates.OpaqueLike++
	}
}

func (c *collector) inspectJWTPayload(value string) {
	parts := strings.Split(value, ".")
	if len(parts) != 3 || len(parts[1]) > maxFileSize {
		return
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(payload) == 0 || len(payload) > maxFileSize {
		return
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var claims map[string]any
	if decoder.Decode(&claims) != nil || requireEOF(decoder) != nil {
		return
	}
	exp, ok := claims["exp"].(json.Number)
	if !ok {
		c.jwtExpiry.MissingOrInvalid++
	} else if unix, parseErr := strconv.ParseInt(exp.String(), 10, 64); parseErr != nil {
		c.jwtExpiry.MissingOrInvalid++
	} else if unix <= time.Now().Unix() {
		c.jwtExpiry.Expired++
	} else {
		c.jwtExpiry.Unexpired++
	}
	paths := make([]string, 0, len(claims))
	for key, value := range claims {
		canonical, ok := safeJWTClaims[strings.ToLower(key)]
		if !ok {
			canonical = "<claim>"
		}
		paths = append(paths, canonical+":"+jsonKind(value))
	}
	sort.Strings(paths)
	c.jwtSchemas[strings.Join(paths, "\n")]++
}

func sanitizedField(key string) (string, bool) {
	canonical, ok := safeSchemaFields[strings.ToLower(key)]
	if !ok {
		return "<field>", true
	}
	return canonical, false
}

func canonicalFields(values ...string) map[string]string {
	result := make(map[string]string, len(values))
	for _, value := range values {
		result[strings.ToLower(value)] = strings.ToLower(value)
	}
	return result
}

func jsonKind(value any) string {
	switch value.(type) {
	case nil:
		return "null"
	case bool:
		return "bool"
	case json.Number:
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

func genericFileError(err error) error {
	switch {
	case os.IsNotExist(err):
		return errors.New("explicit file not found")
	case os.IsPermission(err):
		return errors.New("explicit file permission denied")
	default:
		return errors.New("access explicit file")
	}
}
