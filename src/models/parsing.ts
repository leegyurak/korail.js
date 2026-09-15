/**
 * 응답 객체 → JS 값으로 옮길 때 쓰는 관용 파서.
 *
 * 코레일 응답은 필드를 통째로 빼먹거나 빈 문자열로 채워 보내는 경우가 있습니다.
 * 모델 생성이 그런 이유로 죽으면 안 되므로, 여기서 전부 흡수합니다.
 *
 * JS 에서는 이게 특히 중요합니다 — `Number("")` 은 `0`, `Number(null)` 도 `0`,
 * `Number("12abc")` 는 `NaN` 입니다. 잘못된 값이 예외가 아니라 **그럴듯한 숫자**가
 * 되어 그대로 흘러가므로, 응답을 날로 인덱싱하지 말고 반드시 여기를 거치세요.
 */

/** 파싱 전의 코레일 응답 객체. `any` 가 아니라 `unknown` 으로 받아 좁힙니다. */
export type ResponseData = Readonly<Record<string, unknown>>;

/** 임의의 값이 응답 객체인지. 배열과 `null` 은 객체가 아닙니다. */
export function isResponseData(value: unknown): value is ResponseData {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 응답에서 키 하나를 꺼냅니다. 객체가 아니면 `undefined`. */
export function field(data: unknown, key: string): unknown {
  return isResponseData(data) ? data[key] : undefined;
}

/** 문자열 필드를 읽습니다. 없거나 `null`·`undefined` 면 `defaultValue`. */
export function text(data: unknown, key: string, defaultValue = ""): string {
  const value = field(data, key);
  return value === null || value === undefined ? defaultValue : String(value);
}

/** 정수 필드를 읽습니다. 없거나 숫자로 못 읽으면 `defaultValue`. */
export function integer(data: unknown, key: string, defaultValue = 0): number {
  const value = field(data, key);
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : defaultValue;
  }
  // `Number("12abc")` 는 NaN 이지만 `Number(" 12 ")` 는 12 입니다 — 정수 모양만 받습니다.
  const trimmed = String(value).trim();
  return /^[+-]?\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : defaultValue;
}

/** 실수 필드를 읽습니다. 없거나 숫자로 못 읽으면 `defaultValue`. */
export function floating(data: unknown, key: string): number | undefined;
export function floating(data: unknown, key: string, defaultValue: number): number;
export function floating(data: unknown, key: string, defaultValue?: number): number | undefined {
  const value = field(data, key);
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/** 응답 안의 배열을 꺼냅니다. 배열이 아니면 빈 배열. */
export function list(data: unknown, key: string): readonly unknown[] {
  const value = field(data, key);
  return Array.isArray(value) ? value : [];
}

/** `HHMMSS` → `HH:MM`. 형식이 안 맞으면 원본을 그대로 돌려줍니다. */
export function hhmm(value: string): string {
  if (value.length < 4 || !/^\d{4}/.test(value)) {
    return value;
  }
  return `${value.slice(0, 2)}:${value.slice(2, 4)}`;
}

/** `YYYYMMDD` → `MM/DD`. 형식이 안 맞으면 원본을 그대로 돌려줍니다. */
export function mmdd(value: string, separator = "/"): string {
  if (value.length < 8 || !/^\d+$/.test(value)) {
    return value;
  }
  const month = String(Number(value.slice(4, 6))).padStart(2, "0");
  const day = String(Number(value.slice(6, 8))).padStart(2, "0");
  return `${month}${separator}${day}`;
}
