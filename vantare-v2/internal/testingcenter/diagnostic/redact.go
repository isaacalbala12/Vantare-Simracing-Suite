package diagnostic

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

var redactionPatterns = []struct {
	expression  *regexp.Regexp
	replacement string
}{
	{regexp.MustCompile(`(?i)\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+`), "credential=[REDACTED]"},
	{regexp.MustCompile(`(?i)"?(?:name|user|username|user_name|display[-_]?name)"?\s*[:=]\s*[^\r\n]+`), "identity=[REDACTED]"},
	{regexp.MustCompile(`(?i)"?(?:password|passwd|secret|token|api[-_]?key|access[-_]?token|refresh[-_]?token|session(?:id|_id)?|user(?:name|_name)?|display[-_]?name)"?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}\]]+)`), "private=[REDACTED]"},
	{regexp.MustCompile(`(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+`), "Bearer [REDACTED]"},
	{regexp.MustCompile(`(?i)\b(?:https?|wss?)://[^\s\"'<>]+`), "[URL]"},
	{regexp.MustCompile(`(?i)(?:[a-z]:[\\/]|\\\\)[^\r\n]+`), "[PATH]"},
	{regexp.MustCompile(`(?i)/(?:home|users|var|tmp|etc|opt|root)/[^\r\n]*`), "[PATH]"},
	{regexp.MustCompile(`(?i)\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b`), "[EMAIL]"},
	{regexp.MustCompile(`\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b`), "[TOKEN]"},
	{regexp.MustCompile(`\b[A-Za-z0-9_-]{40,}\b`), "[TOKEN]"},
}

var whitespace = regexp.MustCompile(`\s+`)

func sanitizeMessage(value string) (string, int) {
	value = strings.ToValidUTF8(value, "�")
	value = strings.Map(func(character rune) rune {
		if unicode.IsControl(character) {
			return ' '
		}
		return character
	}, value)
	redacted := 0
	for _, pattern := range redactionPatterns {
		matches := pattern.expression.FindAllStringIndex(value, -1)
		redacted += len(matches)
		value = pattern.expression.ReplaceAllString(value, pattern.replacement)
	}
	return strings.TrimSpace(whitespace.ReplaceAllString(value, " ")), redacted
}

func truncateUTF8(value string, limit int) (string, bool) {
	if len(value) <= limit {
		return value, false
	}
	if limit <= len("…") {
		return "", true
	}
	end := limit - len("…")
	for end > 0 && !utf8.ValidString(value[:end]) {
		end--
	}
	return strings.TrimSpace(value[:end]) + "…", true
}
