export interface StrategyCanonicalLimitsV1 {
  readonly maxJsonBytes: number;
  readonly maxOutputBytes: number;
  readonly maxDepth: number;
  readonly maxContainerItems: number;
}

export class StrategyCanonicalInputError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(message);
    this.name = "StrategyCanonicalInputError";
    this.field = field;
  }
}

const CANONICAL_TAG = {
  null: 0,
  false: 1,
  true: 2,
  number: 3,
  string: 4,
  array: 5,
  object: 6,
} as const;

export async function canonicalizeAndHashStrategyJSONV1Internal(
  document: string,
  limits: StrategyCanonicalLimitsV1,
): Promise<{ canonicalHex: string; sha256: string }> {
  const value = strictParseStrategyJSONV1Internal(document, limits);
  const canonical = canonicalizeStrategyValueV1Internal(value, limits);
  return {
    canonicalHex: bytesToHex(canonical, limits.maxOutputBytes),
    sha256: await hashCanonicalStrategyValueV1Internal(canonical),
  };
}

// The frontend's production path verifies a Go-created revision with this
// digest only. Full canonical hex is retained above solely for the shared
// diagnostic corpus, where it is part of the observable contract.
export async function hashStrategyValueV1Internal(
  value: unknown,
  limits: StrategyCanonicalLimitsV1,
): Promise<string> {
  return hashCanonicalStrategyValueV1Internal(
    canonicalizeStrategyValueV1Internal(value, limits),
  );
}

export function canonicalizeStrategyValueV1Internal(
  value: unknown,
  limits: StrategyCanonicalLimitsV1,
): Uint8Array {
  const encoder = new StrategyCanonicalEncoderV1(limits);
  encoder.writeValue(value);
  return encoder.finish();
}

class StrategyCanonicalEncoderV1 {
  private buffer = new Uint8Array(1024);
  private size = 0;
  private readonly limits: StrategyCanonicalLimitsV1;

  constructor(limits: StrategyCanonicalLimitsV1) {
    this.limits = limits;
  }

  writeValue(value: unknown, depth = 0): void {
    if (depth > this.limits.maxDepth) {
      throw invalidDocument("", "canonical value exceeds strategy contract depth limit");
    }
    if (value === null) {
      this.write(Uint8Array.of(CANONICAL_TAG.null));
      return;
    }
    if (typeof value === "boolean") {
      this.write(
        Uint8Array.of(value ? CANONICAL_TAG.true : CANONICAL_TAG.false),
      );
      return;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        throw invalidDocument("number", "must be finite");
      }
      if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
        throw invalidDocument("number", "integer exceeds the shared safe range");
      }
      const data = new Uint8Array(9);
      data[0] = CANONICAL_TAG.number;
      new DataView(data.buffer).setFloat64(1, value === 0 ? 0 : value, false);
      this.write(data);
      return;
    }
    if (typeof value === "string") {
      this.writeString(value);
      return;
    }
    if (Array.isArray(value)) {
      this.writeCount(CANONICAL_TAG.array, value.length);
      for (const item of value) {
        this.writeValue(item, depth + 1);
      }
      return;
    }
    if (typeof value === "object") {
      const object = value as Record<string, unknown>;
      const objectKeys = Object.keys(object);
      this.writeCount(CANONICAL_TAG.object, objectKeys.length);
      const textEncoder = new TextEncoder();
      const keys = objectKeys
        .map((key) => ({ key, bytes: textEncoder.encode(key) }))
        .sort((left, right) => compareBytes(left.bytes, right.bytes));
      for (const { key } of keys) {
        this.writeString(key);
        this.writeValue(object[key], depth + 1);
      }
      return;
    }
    throw invalidDocument("", "unsupported canonical JSON value");
  }

  finish(): Uint8Array {
    return this.buffer.slice(0, this.size);
  }

  private writeString(value: string): void {
    requireCanonicalUnicode(value);
    const data = new TextEncoder().encode(value);
    if (!Number.isSafeInteger(data.length) || data.length > 0xffffffff) {
      throw invalidDocument("", "string exceeds canonical uint32 length");
    }
    const header = new Uint8Array(5);
    header[0] = CANONICAL_TAG.string;
    new DataView(header.buffer).setUint32(1, data.length, false);
    this.write(header);
    this.write(data);
  }

  private writeCount(tag: number, count: number): void {
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      count > 0xffffffff ||
      count > this.limits.maxContainerItems
    ) {
      throw invalidDocument("", "container exceeds canonical limits");
    }
    const header = new Uint8Array(5);
    header[0] = tag;
    new DataView(header.buffer).setUint32(1, count, false);
    this.write(header);
  }

  private write(data: Uint8Array): void {
    const required = this.size + data.length;
    if (required > this.limits.maxOutputBytes) {
      throw invalidDocument(
        "",
        "canonical output exceeds strategy contract limit",
      );
    }
    if (required > this.buffer.length) {
      let capacity = this.buffer.length;
      while (capacity < required) {
        capacity = Math.min(this.limits.maxOutputBytes, capacity * 2);
      }
      const grown = new Uint8Array(capacity);
      grown.set(this.buffer.subarray(0, this.size));
      this.buffer = grown;
    }
    this.buffer.set(data, this.size);
    this.size = required;
  }
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return left.length - right.length;
}

async function hashCanonicalStrategyValueV1Internal(
  canonical: Uint8Array,
): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    ownedArrayBuffer(canonical),
  );
  return bytesToHex(new Uint8Array(digest), 32);
}

function bytesToHex(value: Uint8Array, maxInputBytes: number): string {
  if (
    !Number.isSafeInteger(maxInputBytes) ||
    maxInputBytes < 0 ||
    value.byteLength > maxInputBytes
  ) {
    throw invalidDocument("", "canonical output exceeds strategy contract limit");
  }

  // A full hex string is inherently twice the canonical payload. Build exactly
  // that bounded byte buffer, then decode it, instead of retaining an array and
  // one temporary string per byte (which explodes near the 16 MiB contract cap).
  const hex = new Uint8Array(value.byteLength * 2);
  const digits = "0123456789abcdef";
  for (let index = 0; index < value.byteLength; index += 1) {
    const byte = value[index];
    hex[index * 2] = digits.charCodeAt(byte >>> 4);
    hex[index * 2 + 1] = digits.charCodeAt(byte & 0x0f);
  }
  return new TextDecoder().decode(hex);
}

function ownedArrayBuffer(value: Uint8Array): ArrayBuffer {
  const owned = new Uint8Array(value.byteLength);
  owned.set(value);
  return owned.buffer;
}

export function strictParseStrategyJSONV1Internal(
  document: string,
  limits: StrategyCanonicalLimitsV1,
): unknown {
  if (new TextEncoder().encode(document).length > limits.maxJsonBytes) {
    throw invalidDocument("", "JSON exceeds strategy contract size limit");
  }
  return new StrictStrategyJSONParserV1(document, limits).parse();
}

class StrictStrategyJSONParserV1 {
  private index = 0;
  private readonly document: string;
  private readonly limits: StrategyCanonicalLimitsV1;

  constructor(document: string, limits: StrategyCanonicalLimitsV1) {
    this.document = document;
    this.limits = limits;
  }

  parse(): unknown {
    const value = this.parseValue(0);
    this.skipWhitespace();
    if (this.index !== this.document.length) {
      throw invalidDocument("", "JSON contains trailing data");
    }
    return value;
  }

  private parseValue(depth: number): unknown {
    if (depth > this.limits.maxDepth) {
      throw invalidDocument("", "JSON exceeds strategy contract depth limit");
    }
    this.skipWhitespace();
    const current = this.document[this.index];
    if (current === "{") return this.parseObject(depth);
    if (current === "[") return this.parseArray(depth);
    if (current === '"') return this.parseString();
    if (current === "t") return this.parseLiteral("true", true);
    if (current === "f") return this.parseLiteral("false", false);
    if (current === "n") return this.parseLiteral("null", null);
    return this.parseNumber();
  }

  private parseObject(depth: number): Record<string, unknown> {
    this.index += 1;
    const result: Record<string, unknown> = Object.create(null) as Record<
      string,
      unknown
    >;
    let count = 0;
    this.skipWhitespace();
    if (this.document[this.index] === "}") {
      this.index += 1;
      return result;
    }
    while (true) {
      this.skipWhitespace();
      if (this.document[this.index] !== '"') {
        throw invalidDocument("", "JSON object key must be a string");
      }
      const key = this.parseString();
      if (Object.hasOwn(result, key)) {
        throw invalidDocument(key, "duplicate JSON object key");
      }
      this.skipWhitespace();
      if (this.document[this.index] !== ":") {
        throw invalidDocument("", "JSON object is missing a colon");
      }
      this.index += 1;
      result[key] = this.parseValue(depth + 1);
      count += 1;
      if (count > this.limits.maxContainerItems) {
        throw invalidDocument("", "object exceeds strategy contract item limit");
      }
      this.skipWhitespace();
      const separator = this.document[this.index];
      if (separator === "}") {
        this.index += 1;
        return result;
      }
      if (separator !== ",") {
        throw invalidDocument("", "JSON object is missing a separator");
      }
      this.index += 1;
    }
  }

  private parseArray(depth: number): unknown[] {
    this.index += 1;
    const result: unknown[] = [];
    this.skipWhitespace();
    if (this.document[this.index] === "]") {
      this.index += 1;
      return result;
    }
    while (true) {
      result.push(this.parseValue(depth + 1));
      if (result.length > this.limits.maxContainerItems) {
        throw invalidDocument("", "array exceeds strategy contract item limit");
      }
      this.skipWhitespace();
      const separator = this.document[this.index];
      if (separator === "]") {
        this.index += 1;
        return result;
      }
      if (separator !== ",") {
        throw invalidDocument("", "JSON array is missing a separator");
      }
      this.index += 1;
    }
  }

  private parseString(): string {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.document.length) {
      const character = this.document[this.index];
      if (!escaped && character === '"') {
        this.index += 1;
        const literal = this.document.slice(start, this.index);
        try {
          const value = JSON.parse(literal) as string;
          requireCanonicalUnicode(value);
          return value;
        } catch {
          throw invalidDocument("", "invalid JSON string");
        }
      }
      if (!escaped && character === "\\") {
        escaped = true;
      } else {
        escaped = false;
      }
      this.index += 1;
    }
    throw invalidDocument("", "unterminated JSON string");
  }

  private parseLiteral<T>(literal: string, value: T): T {
    if (this.document.slice(this.index, this.index + literal.length) !== literal) {
      throw invalidDocument("", "invalid JSON literal");
    }
    this.index += literal.length;
    return value;
  }

  private parseNumber(): number {
    const match = this.document
      .slice(this.index)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (!match) {
      throw invalidDocument("number", "invalid JSON number");
    }
    this.index += match[0].length;
    const value = Number(match[0]);
    if (!Number.isFinite(value)) {
      throw invalidDocument("number", "number is not finite float64");
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw invalidDocument("number", "integer exceeds the shared safe range");
    }
    return value === 0 ? 0 : value;
  }

  private skipWhitespace(): void {
    while (
      this.document[this.index] === " " ||
      this.document[this.index] === "\n" ||
      this.document[this.index] === "\r" ||
      this.document[this.index] === "\t"
    ) {
      this.index += 1;
    }
  }
}

function requireCanonicalUnicode(value: string): void {
  if (value.includes("\ufffd")) {
    throw invalidDocument("", "string contains an unsupported Unicode replacement value");
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!Number.isFinite(next) || next < 0xdc00 || next > 0xdfff) {
        throw invalidDocument("", "string contains an unpaired Unicode surrogate");
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw invalidDocument("", "string contains an unpaired Unicode surrogate");
    }
  }
}

function invalidDocument(
  field: string,
  message: string,
): StrategyCanonicalInputError {
  return new StrategyCanonicalInputError(field, message);
}
