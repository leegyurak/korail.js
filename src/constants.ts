/**
 * 코레일 스마트 앱 API 의 고정 상수.
 *
 * 여기 있는 값들은 실제 앱 트래픽에서 관찰·디컴파일로 확인된 것입니다.
 * **동작하는 값을 근거 없이 바꾸지 마세요** — 서버가 앱 버전·기기 문자열을 게이트로
 * 볼 수 있습니다.
 */

export const EMAIL_REGEX = /[^@]+@[^@]+\.[^@]+/;
export const PHONE_NUMBER_REGEX = /(\d{3})-(\d{3,4})-(\d{4})/;

/**
 * 하이픈이 빠진 휴대폰 번호. 서버는 하이픈이 있는 형태만 휴대폰으로 인식하므로,
 * 이 형태가 들어오면 회원번호로 잘못 조회돼 "비밀번호가 틀렸다"는 엉뚱한 응답이
 * 옵니다. 요청을 보내기 전에 걸러 알려 주려고 따로 둡니다.
 */
export const HYPHENLESS_PHONE_REGEX = /^01[016789]\d{7,8}$/;

export const API_HOST = "smart.letskorail.com";

/**
 * 기기 프로파일을 주입하지 않았을 때 쓰는 기본 User-Agent.
 * {@link dalvikUserAgent} 로 프로파일별 렌더가 가능합니다.
 */
export const USER_AGENT = "Dalvik/2.1.0 (Linux; U; Android 13; SM-S928N Build/UP1A.231005.007)";

export const DEFAULT_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "User-Agent": USER_AGENT,
  Host: API_HOST,
  Connection: "Keep-Alive",
  "Accept-Encoding": "gzip",
});

export const KORAIL_MOBILE = `https://${API_HOST}:443/classes/com.korail.mobile`;

/** DynaPath 서명(`x-dynapath-m-token`)과 `Sid` 를 요구하는 경로들. */
export const DYNAPATH_PATHS: readonly string[] = Object.freeze([
  "/classes/com.korail.mobile.certification.TicketReservation",
  "/classes/com.korail.mobile.nonMember.NonMemTicket",
  "/classes/com.korail.mobile.seatMovie.ScheduleView",
  "/classes/com.korail.mobile.seatMovie.ScheduleViewSpecial",
  "/classes/com.korail.mobile.trn.prcFare.do",
  "/classes/com.korail.mobile.login.Login",
]);

export const API_ENDPOINTS = Object.freeze({
  login: `${KORAIL_MOBILE}.login.Login`,
  logout: `${KORAIL_MOBILE}.common.logout`,
  searchSchedule: `${KORAIL_MOBILE}.seatMovie.ScheduleView`,
  reserve: `${KORAIL_MOBILE}.certification.TicketReservation`,
  cancel: `${KORAIL_MOBILE}.reservationCancel.ReservationCancelChk`,
  myticketseat: `${KORAIL_MOBILE}.refunds.SelTicketInfo`,
  myticketlist: `${KORAIL_MOBILE}.myTicket.MyTicketList`,
  myreservationview: `${KORAIL_MOBILE}.reservation.ReservationView`,
  myreservationlist: `${KORAIL_MOBILE}.certification.ReservationList`,
  pay: `${KORAIL_MOBILE}.payment.ReservationPayment`,
  refund: `${KORAIL_MOBILE}.refunds.RefundsRequest`,
  // 환불 수수료 사전조회. RefundsRequest 와 같은 refunds 패키지지만 폼 필드
  // 이름이 다릅니다 — tickets.refundFee() 주석 참고.
  refundCommission: `${KORAIL_MOBILE}.refunds.CommissionView`,
  code: `${KORAIL_MOBILE}.common.code.do`,
  stationdata: `${KORAIL_MOBILE}.common.stationdata`,
});

/** 엔드포인트 키. 리소스와 테스트가 같은 이름으로 엔드포인트를 지목합니다. */
export type EndpointName = keyof typeof API_ENDPOINTS;

// --------------------------------------------------------------- 앱 신원값
export const DEVICE = "AD";
export const APP_VERSION = "250601002";
export const API_KEY = "korail1234567890";
export const SID_KEY = "2485dd54d9deaa36";
export const DEVICE_ID = "558a4f02041657ea";

/**
 * TLS 임퍼소네이션 타깃 (node-tls-client `clientIdentifier`).
 *
 * pykorail 은 curl_cffi 의 `chrome131_android` 를 씁니다. node-tls-client 에는
 * 안드로이드 크롬 변종이 없어 데스크톱 `chrome_131` 이 가장 가까운 값입니다.
 *
 * **2026-09-15 실측: 조회 경로는 이 값으로 통과합니다** (공개 조회와 DynaPath
 * 서명 경로 둘 다). 로그인 경로는 자격증명이 필요해 확인하지 못했습니다.
 * 실측 없이 바꾸지 마세요 (AGENTS.md §3).
 */
export const IMPERSONATE = "chrome_131";

/** 한국 표준시(UTC+9). 코레일 API 의 모든 날짜·시각은 KST 기준입니다. */
export const KST_OFFSET_HOURS = 9;
