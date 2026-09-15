/**
 * 앱 신원값 파리티.
 *
 * pykorail 과 같은 값을 보내야 서버가 같은 앱으로 봅니다. 여기 있는 값이
 * 바뀌었다면 근거(디컴파일·실측)가 있어야 합니다 — AGENTS.md §3.
 */

import { describe, expect, it } from "vitest";
import {
  API_ENDPOINTS,
  API_HOST,
  API_KEY,
  APP_VERSION,
  DEFAULT_HEADERS,
  DEVICE,
  DEVICE_ID,
  DYNAPATH_PATHS,
  HYPHENLESS_PHONE_REGEX,
  KORAIL_MOBILE,
  KST_OFFSET_HOURS,
  SID_KEY,
  USER_AGENT,
} from "../src/constants";
import { ReserveOption, TrainType } from "../src/options";

describe("앱 신원값", () => {
  it.each([
    ["DEVICE", DEVICE, "AD"],
    ["APP_VERSION", APP_VERSION, "250601002"],
    ["API_KEY", API_KEY, "korail1234567890"],
    ["SID_KEY", SID_KEY, "2485dd54d9deaa36"],
    ["DEVICE_ID", DEVICE_ID, "558a4f02041657ea"],
    ["API_HOST", API_HOST, "smart.letskorail.com"],
    [
      "USER_AGENT",
      USER_AGENT,
      "Dalvik/2.1.0 (Linux; U; Android 13; SM-S928N Build/UP1A.231005.007)",
    ],
  ])("%s 가 pykorail 과 같다", (_label, actual, expected) => {
    // when & then
    expect(actual).toBe(expected);
  });

  it("KST 오프셋은 +9 다", () => {
    // when & then
    expect(KST_OFFSET_HOURS).toBe(9);
  });

  it("기본 헤더가 앱이 보내는 그대로다", () => {
    // when & then
    expect({ ...DEFAULT_HEADERS }).toEqual({
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "User-Agent": USER_AGENT,
      Host: API_HOST,
      Connection: "Keep-Alive",
      "Accept-Encoding": "gzip",
    });
  });
});

describe("엔드포인트", () => {
  it("pykorail 과 같은 경로 집합을 갖는다", () => {
    // when & then
    expect({ ...API_ENDPOINTS }).toEqual({
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
      refundCommission: `${KORAIL_MOBILE}.refunds.CommissionView`,
      code: `${KORAIL_MOBILE}.common.code.do`,
      stationdata: `${KORAIL_MOBILE}.common.stationdata`,
    });
  });

  it("모든 엔드포인트가 https 와 앱 호스트를 쓴다", () => {
    // when
    const bad = Object.values(API_ENDPOINTS).filter(
      (url) => !url.startsWith(`https://${API_HOST}:443/classes/com.korail.mobile`),
    );

    // then
    expect(bad).toEqual([]);
  });

  it("DynaPath 서명 경로가 pykorail 과 같다", () => {
    // when & then
    expect([...DYNAPATH_PATHS]).toEqual([
      "/classes/com.korail.mobile.certification.TicketReservation",
      "/classes/com.korail.mobile.nonMember.NonMemTicket",
      "/classes/com.korail.mobile.seatMovie.ScheduleView",
      "/classes/com.korail.mobile.seatMovie.ScheduleViewSpecial",
      "/classes/com.korail.mobile.trn.prcFare.do",
      "/classes/com.korail.mobile.login.Login",
    ]);
  });
});

describe("정규식", () => {
  it.each([
    ["01012345678", true],
    ["0101234567", true],
    ["010-1234-5678", false],
    ["me@example.com", false],
    ["1234567890", false],
  ])("하이픈 없는 휴대폰 번호 판정: %s", (value, expected) => {
    // when & then
    expect(HYPHENLESS_PHONE_REGEX.test(value)).toBe(expected);
  });
});

describe("옵션", () => {
  it("열차 종별 코드가 pykorail 과 같다", () => {
    // when & then
    expect({ ...TrainType }).toEqual({
      KTX: "100",
      KTX_SANCHEON: "100",
      SAEMAEUL: "101",
      ITX_SAEMAEUL: "101",
      MUGUNGHWA: "102",
      NURIRO: "102",
      TONGGUEN: "103",
      ITX_CHEONGCHUN: "104",
      AIRPORT: "105",
      ALL: "109",
    });
  });

  it("특실 선택 전략이 pykorail 과 같다", () => {
    // when & then
    expect({ ...ReserveOption }).toEqual({
      GENERAL_FIRST: "GENERAL_FIRST",
      GENERAL_ONLY: "GENERAL_ONLY",
      SPECIAL_FIRST: "SPECIAL_FIRST",
      SPECIAL_ONLY: "SPECIAL_ONLY",
    });
  });

  it("옵션은 런타임 enum 이 아니라 평범한 객체다", () => {
    // when & then
    expect(Object.getPrototypeOf(TrainType)).toBe(Object.prototype);
  });
});
