/** 승객 합치기와 폼 필드. */

import { describe, expect, it } from "vitest";
import {
  AdultPassenger,
  ChildPassenger,
  Disability1To3Passenger,
  Disability4To6Passenger,
  Passenger,
  SeniorPassenger,
  ToddlerPassenger,
} from "../src/models/passenger";

describe("승객 유형", () => {
  it.each([
    ["어른", new AdultPassenger(), "1", "000"],
    ["어린이", new ChildPassenger(), "3", "000"],
    ["유아", new ToddlerPassenger(), "3", "321"],
    ["경로", new SeniorPassenger(), "1", "131"],
    ["중증 장애인", new Disability1To3Passenger(), "1", "111"],
    ["경증 장애인", new Disability4To6Passenger(), "1", "112"],
  ])("%s 의 유형·할인 코드가 pykorail 과 같다", (_label, passenger, typeCode, discount) => {
    // when & then
    expect([passenger.typeCode, passenger.discountType]).toEqual([typeCode, discount]);
  });

  it("인원 기본값은 1명이다", () => {
    // when & then
    expect(new AdultPassenger().count).toBe(1);
  });

  it("할인 코드를 직접 지정할 수 있다", () => {
    // when
    const passenger = new AdultPassenger(1, { discountType: "999" });

    // then
    expect(passenger.discountType).toBe("999");
  });

  it("불변이다", () => {
    // when & then
    expect(Object.isFrozen(new AdultPassenger(2))).toBe(true);
  });

  it("사람이 읽을 수 있게 표시된다", () => {
    // when & then
    expect(String(new AdultPassenger(2))).toBe('AdultPassenger(count=2, discountType="000")');
  });
});

describe("Passenger.reduce", () => {
  it("같은 조건의 승객을 하나로 합친다", () => {
    // when
    const reduced = Passenger.reduce([new AdultPassenger(1), new AdultPassenger(2)]);

    // then
    expect(reduced).toHaveLength(1);
    expect(reduced[0]?.count).toBe(3);
  });

  it("정렬되지 않은 입력도 종류별로 하나씩만 남긴다", () => {
    // given
    const passengers = [new AdultPassenger(1), new ChildPassenger(1), new AdultPassenger(1)];

    // when
    const reduced = Passenger.reduce(passengers);

    // then
    expect(reduced.map((p) => [p.typeCode, p.count])).toEqual([
      ["1", 2],
      ["3", 1],
    ]);
  });

  it("할인 코드가 다르면 합치지 않는다", () => {
    // when
    const reduced = Passenger.reduce([new AdultPassenger(1), new SeniorPassenger(1)]);

    // then
    expect(reduced).toHaveLength(2);
  });

  it("등록카드가 다르면 합치지 않는다", () => {
    // when
    const reduced = Passenger.reduce([
      new AdultPassenger(1, { cardNo: "1111" }),
      new AdultPassenger(1, { cardNo: "2222" }),
    ]);

    // then
    expect(reduced).toHaveLength(2);
  });

  it("인원이 0 이하면 버린다", () => {
    // when
    const reduced = Passenger.reduce([new AdultPassenger(0), new ChildPassenger(-1)]);

    // then
    expect(reduced).toEqual([]);
  });

  it("합친 뒤 0 이 되면 버린다", () => {
    // when
    const reduced = Passenger.reduce([new AdultPassenger(2), new AdultPassenger(-2)]);

    // then
    expect(reduced).toEqual([]);
  });

  it("빈 입력은 빈 결과다", () => {
    // when & then
    expect(Passenger.reduce([])).toEqual([]);
  });

  it("승객이 아닌 것을 거부한다", () => {
    // when & then
    expect(() => Passenger.reduce([{ count: 1 } as unknown as Passenger])).toThrow(TypeError);
  });

  it("합친 승객도 불변이다", () => {
    // when
    const [merged] = Passenger.reduce([new AdultPassenger(1), new AdultPassenger(1)]);

    // then
    expect(Object.isFrozen(merged)).toBe(true);
  });
});

describe("Passenger.add", () => {
  it("유형이 다르면 거부한다", () => {
    // when & then
    expect(() => new AdultPassenger(1).add(new ChildPassenger(1))).toThrow(
      /different passenger types/,
    );
  });

  it("그룹 키가 다르면 거부한다", () => {
    // when & then
    expect(() => new AdultPassenger(1).add(new AdultPassenger(1, { discountType: "999" }))).toThrow(
      /different group keys/,
    );
  });

  it("등록카드 정보를 그대로 물려준다", () => {
    // given
    const options = { card: "CC", cardNo: "1111", cardPw: "22" };

    // when
    const merged = new AdultPassenger(1, options).add(new AdultPassenger(2, options));

    // then
    expect([merged.count, merged.card, merged.cardNo, merged.cardPw]).toEqual([
      3,
      "CC",
      "1111",
      "22",
    ]);
  });
});

describe("toFormFields", () => {
  it("인덱스별 폼 필드를 만든다", () => {
    // when
    const fields = new AdultPassenger(2).toFormFields(1);

    // then
    expect(fields).toEqual({
      txtPsgTpCd1: "1",
      txtDiscKndCd1: "000",
      txtCompaCnt1: 2,
      txtCardCode_1: "",
      txtCardNo_1: "",
      txtCardPw_1: "",
    });
  });

  it("두 번째 승객 블록은 인덱스 2 를 쓴다", () => {
    // when
    const fields = new ChildPassenger(1).toFormFields(2);

    // then
    expect(Object.keys(fields)).toEqual([
      "txtPsgTpCd2",
      "txtDiscKndCd2",
      "txtCompaCnt2",
      "txtCardCode_2",
      "txtCardNo_2",
      "txtCardPw_2",
    ]);
  });
});
