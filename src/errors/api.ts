/**
 * 코레일 응답 코드(`h_msg_cd`)에 대응하는 구체 에러들.
 *
 * 새 코드를 다룰 때는 {@link KorailApiError} 를 상속해 `codes`·`defaultMessage`
 * 만 채우고 **{@link CODED_ERRORS} 에 등록**하세요.
 *
 * JS 에는 클래스가 자기 서브클래스를 열거할 방법이 없어 자동 등록이 불가능합니다.
 * 대신 `tests/errors.test.ts` 가 모듈 export 를 훑어 "코드를 가졌는데 배열에 없는
 * 클래스" 를 잡습니다 — 등록 누락이 조용히 지나가지 않게 하는 유일한 장치이니
 * 그 테스트를 지우지 마세요.
 */

import { KorailApiError } from "./base";

/** 세션이 없거나 만료됐습니다. `korail.login()` 을 다시 호출하세요. */
export class NeedToLoginError extends KorailApiError {
  static override readonly codes: readonly string[] = ["P058"];
  static override readonly defaultMessage = "Need to Login";
}

/** 조건에 맞는 열차·예약·승차권이 없습니다. */
export class NoResultsError extends KorailApiError {
  static override readonly codes: readonly string[] = [
    "P100",
    "WRG000000",
    "WRD000061",
    "WRT300005",
  ];
  static override readonly defaultMessage = "No Results";
}

/** 좌석이 매진됐습니다. */
export class SoldOutError extends KorailApiError {
  static override readonly codes: readonly string[] = ["IRT010110", "ERR211161"];
  static override readonly defaultMessage = "Sold out";
}

/**
 * 로그인에 실패했습니다.
 *
 * 입력 검증(빈 자격증명·하이픈 없는 번호), 준비 단계(암호화 키 발급), 서버의
 * 자격증명 거부를 **모두** 이 타입 하나로 올립니다 — `login()` 이 성공 여부를
 * 반환하지 않으므로, "로그인이 안 됐다" 를 잡는 지점이 여기 하나입니다.
 *
 * 코드로 자동 승격되는 타입이 아니라 클라이언트가 직접 던집니다 — 그래서
 * {@link CODED_ERRORS} 에 없습니다.
 */
export class LoginFailedError extends KorailApiError {
  static override readonly defaultMessage = "Login failed";
}

/**
 * 응답 코드로 승격할 에러 타입들. **새 코드 에러를 만들면 여기 추가하세요.**
 *
 * 순서가 우선순위입니다 — 한 코드가 두 타입에 있으면 앞에 있는 것이 이깁니다.
 */
export const CODED_ERRORS: readonly (typeof KorailApiError)[] = [
  NeedToLoginError,
  NoResultsError,
  SoldOutError,
];

/**
 * 응답 코드를 가장 구체적인 에러 인스턴스로 바꿉니다.
 *
 * 매칭되는 코드가 없으면 서버 메시지를 담은 {@link KorailApiError} 를 돌려줍니다.
 * 반환만 하고 던지지 않으므로 호출부에서 `throw errorForCode(...)` 하세요.
 */
export function errorForCode(
  code?: string | undefined,
  message?: string | undefined,
): KorailApiError {
  const matched =
    code === undefined ? undefined : CODED_ERRORS.find((type) => type.codes.includes(code));
  if (matched !== undefined) {
    return new matched(undefined, code);
  }
  return new KorailApiError(message, code);
}
