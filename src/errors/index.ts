/**
 * korail.js 에러 계층.
 *
 * ```text
 * KorailError                  라이브러리 유래 실패 전부
 * ├── KorailApiError           코레일이 strResult=FAIL 로 응답
 * │   ├── NeedToLoginError     P058
 * │   ├── NoResultsError       P100, WRG000000, WRD000061, WRT300005
 * │   ├── SoldOutError         IRT010110, ERR211161
 * │   └── LoginFailedError     로그인 실패 전부 (코드 매핑 없음 — 클라이언트가 직접 던짐)
 * ├── NetFunnelError           대기열 게이트 실패
 * ├── StationNotFoundError     요청 전 클라이언트 검증 실패
 * ├── PastDepartureError       이미 지난 시각으로 조회
 * └── TransportError           세션 생성 실패 / 비 JSON 응답
 * ```
 */

export {
  CODED_ERRORS,
  errorForCode,
  LoginFailedError,
  NeedToLoginError,
  NoResultsError,
  SoldOutError,
} from "./api";
export { KorailApiError, KorailError } from "./base";
export { NetFunnelError, TransportError } from "./network";
export { PastDepartureError, StationNotFoundError } from "./validation";
