/**
 * 에러 계층 — 코드 매핑과 **등록 누락 감지**.
 *
 * JS 에는 클래스가 자기 서브클래스를 열거할 방법이 없어 `CODED_ERRORS` 자동
 * 등록이 불가능합니다. 대신 여기서 모듈 export 를 훑어 "코드를 가졌는데 배열에
 * 없는 클래스" 를 잡습니다 — 이 테스트를 지우면 새 에러가 등록되지 않은 채
 * 머지되고, 사용자는 구체 타입 대신 밋밋한 `KorailApiError` 를 받습니다.
 */

import { describe, expect, it } from "vitest";
import * as errorsModule from "../src/errors";
import {
  CODED_ERRORS,
  errorForCode,
  KorailApiError,
  KorailError,
  LoginFailedError,
  NeedToLoginError,
  NetFunnelError,
  NoResultsError,
  PastDepartureError,
  SoldOutError,
  StationNotFoundError,
  TransportError,
} from "../src/errors";
import { closeMatches, similarity } from "../src/errors/similarity";

/** 모듈 export 중 코드를 가졌는데 `CODED_ERRORS` 에 없는 클래스 이름들. */
function unregistered(moduleExports: Record<string, unknown>): string[] {
  return Object.entries(moduleExports)
    .filter(
      ([, value]) =>
        typeof value === "function" &&
        value !== KorailApiError &&
        value.prototype instanceof KorailApiError &&
        (value as typeof KorailApiError).codes.length > 0,
    )
    .filter(([, value]) => !CODED_ERRORS.includes(value as typeof KorailApiError))
    .map(([name]) => name);
}

describe("등록 누락 감지", () => {
  it("코드를 가진 에러가 전부 CODED_ERRORS 에 있다", () => {
    // when
    const missing = unregistered(errorsModule as unknown as Record<string, unknown>);

    // then
    expect(missing).toEqual([]);
  });

  it("등록하지 않은 코드 에러를 실제로 잡는다", () => {
    // given
    class UnregisteredError extends KorailApiError {
      static override readonly codes: readonly string[] = ["ZZZ999"];
    }

    // when
    const missing = unregistered({ UnregisteredError });

    // then
    expect(missing).toEqual(["UnregisteredError"]);
  });

  it("코드가 없는 에러는 등록 대상이 아니다", () => {
    // when
    const missing = unregistered({ LoginFailedError });

    // then
    expect(missing).toEqual([]);
  });

  it("CODED_ERRORS 안에 중복된 코드가 없다", () => {
    // when
    const all = CODED_ERRORS.flatMap((type) => [...type.codes]);

    // then
    expect(all).toHaveLength(new Set(all).size);
  });
});

describe("errorForCode", () => {
  it.each([
    ["P058", NeedToLoginError],
    ["P100", NoResultsError],
    ["WRG000000", NoResultsError],
    ["WRD000061", NoResultsError],
    ["WRT300005", NoResultsError],
    ["IRT010110", SoldOutError],
    ["ERR211161", SoldOutError],
  ])("%s 를 구체 타입으로 승격한다", (code, expected) => {
    // when
    const error = errorForCode(code, "서버 메시지");

    // then
    expect(error).toBeInstanceOf(expected);
    expect(error.code).toBe(code);
  });

  it("알 수 없는 코드는 서버 메시지를 그대로 담는다", () => {
    // when
    const error = errorForCode("WRC000000", "비밀번호가 틀렸습니다");

    // then
    expect(error.constructor).toBe(KorailApiError);
    expect(error.message).toBe("비밀번호가 틀렸습니다");
  });

  it("코드가 없으면 메시지만 담는다", () => {
    // when
    const error = errorForCode(undefined, "알 수 없는 실패");

    // then
    expect(error.code).toBeUndefined();
    expect(error.message).toBe("알 수 없는 실패");
  });

  it("승격된 에러는 기본 메시지를 쓴다", () => {
    // when
    const error = errorForCode("P058", "서버가 준 메시지");

    // then
    expect(error.message).toBe("Need to Login");
  });
});

describe("에러 계층", () => {
  it.each([
    ["KorailApiError", new KorailApiError("실패")],
    ["NeedToLoginError", new NeedToLoginError()],
    ["LoginFailedError", new LoginFailedError()],
    ["NetFunnelError", new NetFunnelError("대기열 실패")],
    ["TransportError", new TransportError("전송 실패")],
    ["StationNotFoundError", new StationNotFoundError(["서울역"])],
    ["PastDepartureError", new PastDepartureError("2026-04-01 09:00", "2026-04-02 09:00")],
  ])("%s 는 KorailError 로 잡힌다", (_label, error) => {
    // when & then
    expect(error).toBeInstanceOf(KorailError);
  });

  it.each([
    ["NetFunnelError", new NetFunnelError("x")],
    ["TransportError", new TransportError("x")],
    ["StationNotFoundError", new StationNotFoundError(["x"])],
    ["PastDepartureError", new PastDepartureError("a", "b")],
  ])("%s 는 KorailApiError 가 아니다", (_label, error) => {
    // when & then
    expect(error).not.toBeInstanceOf(KorailApiError);
  });

  it("에러 이름이 클래스 이름과 같다", () => {
    // when & then
    expect(new NoResultsError().name).toBe("NoResultsError");
  });

  it("코드가 있으면 메시지와 함께 보여준다", () => {
    // when & then
    expect(String(new KorailApiError("실패", "P999"))).toBe("실패 (P999)");
  });

  it("코드가 없으면 이름과 메시지만 보여준다", () => {
    // when & then
    expect(String(new LoginFailedError())).toBe("LoginFailedError: Login failed");
  });

  it("스택 트레이스가 남는다", () => {
    // when & then
    expect(new NoResultsError().stack).toContain("NoResultsError");
  });
});

describe("StationNotFoundError", () => {
  it("오타 후보를 함께 알려준다", () => {
    // when
    const error = new StationNotFoundError(["서울역"], ["서울", "부산", "대전"]);

    // then
    expect(error.message).toContain("혹시");
    expect(error.suggestions.get("서울역")).toEqual(["서울"]);
  });

  it("비슷한 역이 없으면 이름만 알려준다", () => {
    // when
    const error = new StationNotFoundError(["없는역"], ["부산", "대전"]);

    // then
    expect(error.message).toBe('존재하지 않는 역입니다: "없는역"');
  });

  it("여러 역을 한 번에 담는다", () => {
    // when
    const error = new StationNotFoundError(["가", "나"], ["부산"]);

    // then
    expect(error.names).toEqual(["가", "나"]);
  });

  it("이름 목록이 동결돼 있다", () => {
    // when
    const error = new StationNotFoundError(["가"]);

    // then
    expect(Object.isFrozen(error.names)).toBe(true);
  });
});

describe("유사도", () => {
  it.each([
    ["같은 문자열", "서울", "서울", 1],
    ["빈 문자열끼리", "", "", 1],
    ["겹치는 글자 없음", "abc", "xyz", 0],
  ])("%s", (_label, a, b, expected) => {
    // when & then
    expect(similarity(a, b)).toBe(expected);
  });

  it("difflib 과 같은 비율을 낸다", () => {
    // when & then
    expect(similarity("서울역", "서울")).toBeCloseTo(0.8, 10);
  });

  it("후보를 비율 내림차순으로 준다", () => {
    // when
    const matches = closeMatches("동대구역", ["동대구", "대구", "부산"], 3, 0.5);

    // then
    expect(matches[0]).toBe("동대구");
  });

  it("컷오프 미만은 버린다", () => {
    // when & then
    expect(closeMatches("부산", ["서울", "대전"])).toEqual([]);
  });

  it("최대 개수를 지킨다", () => {
    // when
    const matches = closeMatches("서울역", ["서울", "서울역앞", "서울역광장", "서울역사"], 2, 0.3);

    // then
    expect(matches).toHaveLength(2);
  });
});
