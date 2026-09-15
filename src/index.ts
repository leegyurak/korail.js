/**
 * korail.js — 코레일(KTX) 스마트 예매 비공식 TypeScript/JavaScript 클라이언트.
 *
 * ```ts
 * import { AdultPassenger, ChildPassenger, Korail } from "korail.js";
 *
 * const korail = await Korail.loggedIn("me@example.com", "password");
 * try {
 *   const trains = await korail.trains.search("서울", "부산", {
 *     passengers: [new AdultPassenger(2), new ChildPassenger(1)],
 *   });
 *   const reservation = await korail.reservations.create(trains[0]);
 * } finally {
 *   await korail.close();
 * }
 * ```
 *
 * API 는 리소스별로 나뉘어 있습니다 — `korail.stations` / `korail.trains` /
 * `korail.reservations` / `korail.tickets`. 로그인·로그아웃·연결 정리만
 * {@link Korail} 본체에 있습니다.
 */

export type { ApiRequestOptions } from "./api";
export { Account, ApiClient } from "./api";
export type {
  DynaPathEngineOptions,
  NetFunnelOptions,
  RequestSignerOptions,
  Signature,
} from "./auth";
export { DynaPathMasterEngine, NetFunnelHelper, RequestSigner } from "./auth";
export type { KorailOptions } from "./client";
export { Korail } from "./client";
export type { EndpointName } from "./constants";
export {
  API_ENDPOINTS,
  API_HOST,
  APP_VERSION,
  DEFAULT_HEADERS,
  DEVICE,
  KST_OFFSET_HOURS,
  USER_AGENT,
} from "./constants";
export { encryptPassword, encryptSid } from "./crypto";
export type { DeviceProfile, DeviceProfileLike } from "./device";
export {
  BUILD_ID,
  CATALOG_SIZE,
  DEVICE_PROFILES,
  dalvikUserAgent,
  profileById,
  randomProfile,
} from "./device";
export {
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
} from "./errors";
export type {
  CardFields,
  PassengerFormFields,
  PassengerOptions,
  RefundFeeFields,
  ReservationExtras,
  ReservationFields,
  ScheduleFields,
  SeatFields,
  StationFields,
  TicketFields,
  TrainFields,
} from "./models";
export {
  AdultPassenger,
  Card,
  ChildPassenger,
  Disability1To3Passenger,
  Disability4To6Passenger,
  formatDuration,
  Passenger,
  parseStations,
  RefundFee,
  Reservation,
  Schedule,
  Seat,
  SeniorPassenger,
  Station,
  Ticket,
  ToddlerPassenger,
  Train,
  trainInfoOf,
  WAITING_NOT_APPLICABLE,
} from "./models";
export type { ResponseData } from "./models/parsing";
export { floating, hhmm, integer, mmdd, text } from "./models/parsing";
export type { ReserveOptionCode, TrainTypeCode } from "./options";
export { ReserveOption, TrainType } from "./options";
export type { KstMoment, ReservationSeats, TrainSearchOptions } from "./resources";
export {
  PAST_TOLERANCE_MINUTES,
  ReservationResource,
  Resource,
  StationResource,
  TicketResource,
  TrainResource,
  toKst,
} from "./resources";
export type {
  FormValue,
  FormValues,
  HttpResponse,
  HttpSession,
  RequestOptions,
  SessionFactory,
} from "./transport";
export { createSession, encodeForm, withQuery } from "./transport";
