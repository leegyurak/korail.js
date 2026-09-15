/** 파싱 헬퍼가 JS 고유의 숫자 함정을 흡수하는지. */

import { describe, expect, it } from "vitest";
import {
  field,
  floating,
  hhmm,
  integer,
  isResponseData,
  list,
  mmdd,
  text,
} from "../src/models/parsing";

describe("text", () => {
  it.each([
    ["값이 있으면 그대로", { a: "서울" }, "a", "서울"],
    ["숫자는 문자열로", { a: 12 }, "a", "12"],
    ["null 이면 기본값", { a: null }, "a", ""],
    ["키가 없으면 기본값", {}, "a", ""],
    ["빈 문자열은 그대로", { a: "" }, "a", ""],
  ])("%s", (_label, data, key, expected) => {
    // when & then
    expect(text(data, key)).toBe(expected);
  });

  it("기본값을 지정할 수 있다", () => {
    // when & then
    expect(text({}, "a", "001")).toBe("001");
  });

  it("객체가 아니면 기본값이다", () => {
    // when & then
    expect(text("문자열", "a", "fallback")).toBe("fallback");
  });
});

describe("integer", () => {
  it.each([
    ["정수 문자열", { a: "59800" }, 59800],
    ["앞뒤 공백", { a: " 12 " }, 12],
    ["음수", { a: "-1" }, -1],
    ["빈 문자열은 0 이 아니라 기본값", { a: "" }, 0],
    ["null 은 0 이 아니라 기본값", { a: null }, 0],
    ["숫자가 아니면 기본값", { a: "12abc" }, 0],
    ["숫자 타입은 잘라서", { a: 12.9 }, 12],
    ["소수 문자열은 기본값", { a: "12.9" }, 0],
    ["NaN 은 기본값", { a: Number.NaN }, 0],
  ])("%s", (_label, data, expected) => {
    // when & then
    expect(integer(data, "a")).toBe(expected);
  });

  it("기본값을 지정할 수 있다", () => {
    // when & then
    expect(integer({ a: "" }, "a", -1)).toBe(-1);
  });
});

describe("floating", () => {
  it.each([
    ["실수 문자열", { a: "37.55" }, 37.55],
    ["숫자 타입", { a: 126.97 }, 126.97],
  ])("%s", (_label, data, expected) => {
    // when & then
    expect(floating(data, "a")).toBe(expected);
  });

  it.each([
    ["빈 문자열", { a: "" }],
    ["null", { a: null }],
    ["키 없음", {}],
    ["숫자가 아닌 문자열", { a: "abc" }],
    ["무한대", { a: "Infinity" }],
  ])("%s 이면 undefined 다", (_label, data) => {
    // when & then
    expect(floating(data, "a")).toBeUndefined();
  });

  it("기본값을 지정할 수 있다", () => {
    // when & then
    expect(floating({ a: "" }, "a", 0)).toBe(0);
  });
});

describe("hhmm", () => {
  it.each([
    ["090000", "09:00"],
    ["123000", "12:30"],
    ["0900", "09:00"],
    ["", ""],
    ["abc", "abc"],
    ["12", "12"],
  ])("%s → %s", (value, expected) => {
    // when & then
    expect(hhmm(value)).toBe(expected);
  });
});

describe("mmdd", () => {
  it.each([
    ["20260401", "/", "04/01"],
    ["20261231", "/", "12/31"],
    ["20260401", "-", "04-01"],
    ["", "/", ""],
    ["2026040", "/", "2026040"],
    ["2026april", "/", "2026april"],
  ])("%s → %s", (value, separator, expected) => {
    // when & then
    expect(mmdd(value, separator)).toBe(expected);
  });
});

describe("구조 헬퍼", () => {
  it.each([
    ["객체", { a: 1 }, true],
    ["배열", [1], false],
    ["null", null, false],
    ["문자열", "x", false],
  ])("isResponseData(%s)", (_label, value, expected) => {
    // when & then
    expect(isResponseData(value)).toBe(expected);
  });

  it("field 는 객체가 아니면 undefined 다", () => {
    // when & then
    expect(field([1, 2], "a")).toBeUndefined();
  });

  it("list 는 배열이 아니면 빈 배열이다", () => {
    // when & then
    expect(list({ a: "배열 아님" }, "a")).toEqual([]);
  });

  it("list 는 배열이면 그대로 준다", () => {
    // when & then
    expect(list({ a: [1, 2] }, "a")).toEqual([1, 2]);
  });
});
