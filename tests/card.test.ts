/** 카드 값 객체의 검증과 마스킹. */

import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { Card } from "../src/models/card";

const VALID = {
  number: "1234567812345678",
  password: "12",
  verifyNumber: "900101",
  expire: "2812",
};

describe("Card 검증", () => {
  it.each([
    ["number", { number: "" }],
    ["password", { password: "" }],
    ["verifyNumber", { verifyNumber: "" }],
    ["expire", { expire: "" }],
  ])("%s 가 비면 거부한다", (field, overrides) => {
    // when & then
    expect(() => new Card({ ...VALID, ...overrides })).toThrow(new RegExp(field));
  });

  it("문자열이 아닌 값을 거부한다", () => {
    // when & then
    expect(() => new Card({ ...VALID, expire: 2812 as unknown as string })).toThrow(TypeError);
  });

  it("음수 할부를 거부한다", () => {
    // when & then
    expect(() => new Card({ ...VALID, installment: -1 })).toThrow(/installment/);
  });

  it("정수가 아닌 할부를 거부한다", () => {
    // when & then
    expect(() => new Card({ ...VALID, installment: 1.5 })).toThrow(/installment/);
  });

  it("기본은 일시불·개인카드다", () => {
    // when
    const card = new Card(VALID);

    // then
    expect([card.installment, card.isCorporate, card.authType]).toEqual([0, false, "J"]);
  });

  it("법인카드는 인증 구분이 S 다", () => {
    // when
    const card = new Card({ ...VALID, isCorporate: true });

    // then
    expect(card.authType).toBe("S");
  });

  it("불변이다", () => {
    // when & then
    expect(Object.isFrozen(new Card(VALID))).toBe(true);
  });
});

describe("Card 마스킹", () => {
  it("JSON.stringify 에 카드번호가 새지 않는다", () => {
    // when
    const serialized = JSON.stringify(new Card(VALID));

    // then
    expect(serialized).not.toContain("1234567812345678");
    expect(serialized).toContain("****5678");
  });

  it("JSON.stringify 에 비밀번호·확인번호가 새지 않는다", () => {
    // when
    const serialized = JSON.stringify(new Card(VALID));

    // then
    expect(serialized).not.toContain("900101");
  });

  it("console.log(inspect) 에 카드번호가 새지 않는다", () => {
    // when
    const shown = inspect(new Card(VALID));

    // then
    expect(shown).not.toContain("1234567812345678");
    expect(shown).toContain("****5678");
  });

  it("객체 안에 중첩돼 있어도 마스킹된다", () => {
    // when
    const shown = inspect({ payment: new Card(VALID) }, { depth: 3 });

    // then
    expect(shown).not.toContain("1234567812345678");
  });

  it("문자열 변환도 마스킹된다", () => {
    // when & then
    expect(String(new Card(VALID))).toBe(
      'Card(number="****5678", installment=0, isCorporate=false)',
    );
  });

  it("카드번호가 4자리 미만이면 전부 가린다", () => {
    // when
    const card = new Card({ ...VALID, number: "12" });

    // then
    expect(String(card)).toContain('number="****"');
  });
});
