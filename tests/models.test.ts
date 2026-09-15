/** 응답 모델의 경계 동작 — 필드 누락 · 빈 문자열 · 자정 넘김 · 매진/예약대기. */

import { describe, expect, it } from "vitest";
import { RefundFee } from "../src/models/refund";
import { Reservation } from "../src/models/reservation";
import { formatDuration, Schedule, Train, WAITING_NOT_APPLICABLE } from "../src/models/schedule";
import { Seat } from "../src/models/seat";
import { parseStations, Station } from "../src/models/station";
import { Ticket, trainInfoOf } from "../src/models/ticket";
import {
  REFUND_FEE_PAYLOAD,
  RESERVATION_INFO,
  SEAT_INFO,
  SOLD_OUT_INFO,
  STATION_PAYLOAD,
  TICKET_LIST_PAYLOAD,
  TICKET_RAW,
  TRAIN_INFO,
} from "./payloads";

describe("Station", () => {
  it("역 마스터를 파싱한다", () => {
    // when
    const stations = parseStations(STATION_PAYLOAD);

    // then
    expect(stations.map((station) => station.name)).toEqual(["서울", "부산", "대전"]);
  });

  it("좌표가 없으면 undefined 다", () => {
    // when
    const [, busan] = parseStations(STATION_PAYLOAD);

    // then
    expect(busan?.latitude).toBeUndefined();
  });

  it("좌표가 있으면 숫자로 읽는다", () => {
    // when
    const [seoul] = parseStations(STATION_PAYLOAD);

    // then
    expect(seoul?.latitude).toBe(37.55);
  });

  it.each([
    ["major 가 있으면 주요역", { stn_nm: "서울", major: "1" }, true],
    ["major 가 비면 주요역 아님", { stn_nm: "부산", major: "" }, false],
    ["major 가 없으면 주요역 아님", { stn_nm: "부산" }, false],
  ])("%s", (_label, data, expected) => {
    // when
    const station = Station.fromResponse(data);

    // then
    expect(station.isMajor).toBe(expected);
  });

  it("이름(코드) 형태로 표시된다", () => {
    // when
    const station = Station.fromResponse({ stn_cd: "0001", stn_nm: "서울" });

    // then
    expect(String(station)).toBe("서울(0001)");
  });

  it("불변이다", () => {
    // when
    const station = Station.fromResponse({ stn_cd: "0001", stn_nm: "서울" });

    // then
    expect(Object.isFrozen(station)).toBe(true);
  });

  it.each([
    ["stns 가 없으면", {}],
    ["stn 이 배열이 아니면", { stns: { stn: "배열 아님" } }],
    ["응답이 객체가 아니면", "문자열"],
  ])("%s 빈 목록이다", (_label, payload) => {
    // when & then
    expect(parseStations(payload)).toEqual([]);
  });
});

describe("Schedule", () => {
  it("소요 시간을 분으로 계산한다", () => {
    // when
    const schedule = Schedule.fromResponse(TRAIN_INFO);

    // then
    expect(schedule.durationMinutes).toBe(210);
  });

  it("자정을 넘기면 하루를 더해 보정한다", () => {
    // given
    const overnight = { ...TRAIN_INFO, h_dpt_tm: "233000", h_arv_tm: "013000" };

    // when
    const schedule = Schedule.fromResponse(overnight);

    // then
    expect(schedule.durationMinutes).toBe(120);
  });

  it.each([
    ["출발 시각이 비면", { ...TRAIN_INFO, h_dpt_tm: "" }],
    ["도착 시각이 비면", { ...TRAIN_INFO, h_arv_tm: "" }],
    ["시각이 숫자가 아니면", { ...TRAIN_INFO, h_dpt_tm: "abcdef" }],
  ])("%s 소요 시간이 undefined 다", (_label, data) => {
    // when
    const schedule = Schedule.fromResponse(data);

    // then
    expect(schedule.durationMinutes).toBeUndefined();
    expect(schedule.durationText).toBeUndefined();
  });

  it("요약 한 줄을 만든다", () => {
    // when
    const schedule = Schedule.fromResponse(TRAIN_INFO);

    // then
    expect(String(schedule)).toBe("[KTX 101]  04/01 09:00~12:30  서울~부산");
  });

  it("필드가 통째로 없어도 만들어진다", () => {
    // when
    const schedule = Schedule.fromResponse({});

    // then
    expect(schedule.trainNo).toBe("");
  });

  it("불변이다", () => {
    // when
    const schedule = Schedule.fromResponse(TRAIN_INFO);

    // then
    expect(Object.isFrozen(schedule)).toBe(true);
  });
});

describe("formatDuration", () => {
  it.each([
    [45, "45분"],
    [60, "1시간"],
    [210, "3시간 30분"],
    [355, "5시간 55분"],
    [0, "0분"],
  ])("%d분 → %s", (minutes, expected) => {
    // when & then
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe("Train", () => {
  it("좌석 가용 플래그를 읽는다", () => {
    // when
    const train = Train.fromResponse(TRAIN_INFO);

    // then
    expect([train.hasSpecialSeat(), train.hasGeneralSeat(), train.hasSeat()]).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("매진이면 좌석이 없다", () => {
    // when
    const train = Train.fromResponse(SOLD_OUT_INFO);

    // then
    expect(train.hasSeat()).toBe(false);
  });

  it("예약대기 플래그가 9 면 대기를 걸 수 있다", () => {
    // when
    const train = Train.fromResponse(TRAIN_INFO);

    // then
    expect(train.hasWaitingList()).toBe(true);
  });

  it("예약대기 필드가 없으면 미적용(-1)이다", () => {
    // given
    const { h_wait_rsv_flg: _omitted, ...withoutFlag } = TRAIN_INFO;

    // when
    const train = Train.fromResponse(withoutFlag);

    // then
    expect(train.waitReserveFlag).toBe(WAITING_NOT_APPLICABLE);
  });

  it("예약가능 열차를 사람이 읽을 수 있게 표시한다", () => {
    // when
    const train = Train.fromResponse(TRAIN_INFO);

    // then
    expect(String(train)).toBe(
      "[KTX 101]  04/01 09:00~12:30  서울~부산  특실 가능, 일반실 가능, 예약대기 가능 (3시간 30분)",
    );
  });

  it("매진 열차를 사람이 읽을 수 있게 표시한다", () => {
    // when
    const train = Train.fromResponse(SOLD_OUT_INFO);

    // then
    expect(String(train)).toBe(
      "[KTX 103]  04/01 10:00~13:30  서울~부산  특실 매진, 일반실 매진, 예약대기 매진 (3시간 30분)",
    );
  });

  it("예약대기가 미적용이면 그 항목을 표시하지 않는다", () => {
    // given
    const { h_wait_rsv_flg: _omitted, ...withoutFlag } = TRAIN_INFO;

    // when
    const train = Train.fromResponse(withoutFlag);

    // then
    expect(String(train)).not.toContain("예약대기");
  });

  it("예약 가능 여부 문구가 없으면 좌석 정보를 표시하지 않는다", () => {
    // given
    const { h_rsv_psb_nm: _omitted, ...withoutName } = TRAIN_INFO;

    // when
    const train = Train.fromResponse(withoutName);

    // then
    expect(String(train)).toBe("[KTX 101]  04/01 09:00~12:30  서울~부산 (3시간 30분)");
  });

  it("시각을 못 읽으면 (?분) 으로 표시한다", () => {
    // when
    const train = Train.fromResponse({ ...TRAIN_INFO, h_dpt_tm: "" });

    // then
    expect(String(train)).toContain("(?분)");
  });

  it("불변이다", () => {
    // when
    const train = Train.fromResponse(TRAIN_INFO);

    // then
    expect(Object.isFrozen(train)).toBe(true);
  });
});

describe("Seat", () => {
  it("좌석 상세를 읽는다", () => {
    // when
    const seat = Seat.fromResponse(SEAT_INFO);

    // then
    expect(String(seat)).toBe("3호차 5A (일반실) 어른 [59800원(0원 할인)]");
  });

  it("좌석번호가 비면 예약대기다", () => {
    // when
    const seat = Seat.fromResponse({ ...SEAT_INFO, h_seat_no: "" });

    // then
    expect(seat.isWaiting).toBe(true);
    expect(String(seat)).toContain("예약대기");
  });

  it("불변이다", () => {
    // when
    const seat = Seat.fromResponse(SEAT_INFO);

    // then
    expect(Object.isFrozen(seat)).toBe(true);
  });
});

describe("Reservation", () => {
  it("운행일을 출발·도착일로 채운다", () => {
    // given
    const data = { ...RESERVATION_INFO, h_dpt_dt: "", h_arv_dt: "" };

    // when
    const reservation = Reservation.fromResponse(data);

    // then
    expect([reservation.train.depDate, reservation.train.arrDate]).toEqual([
      "20260401",
      "20260401",
    ]);
  });

  it("좌석과 발매창구를 생성 시점에 받는다", () => {
    // given
    const seats = [Seat.fromResponse(SEAT_INFO)];

    // when
    const reservation = Reservation.fromResponse(RESERVATION_INFO, { seats, wctNo: "0143" });

    // then
    expect(reservation.seats).toHaveLength(1);
    expect(reservation.wctNo).toBe("0143");
  });

  it("좌석 배열을 밖에서 밀어 넣어도 바뀌지 않는다", () => {
    // given
    const seats = [Seat.fromResponse(SEAT_INFO)];
    const reservation = Reservation.fromResponse(RESERVATION_INFO, { seats });

    // when
    seats.push(Seat.fromResponse({ ...SEAT_INFO, h_seat_no: "6B" }));

    // then
    expect(reservation.seats).toHaveLength(1);
  });

  it("좌석 배열 자체가 동결돼 있다", () => {
    // when
    const reservation = Reservation.fromResponse(RESERVATION_INFO, {
      seats: [Seat.fromResponse(SEAT_INFO)],
    });

    // then
    expect(Object.isFrozen(reservation.seats)).toBe(true);
  });

  it("여정 식별자가 없으면 앱 기본값을 쓴다", () => {
    // when
    const reservation = Reservation.fromResponse(RESERVATION_INFO);

    // then
    expect([reservation.journeyNo, reservation.journeyCnt, reservation.rsvChgNo]).toEqual([
      "001",
      "01",
      "00000",
    ]);
  });

  it("구입기한을 사람이 읽을 수 있게 표시한다", () => {
    // when
    const reservation = Reservation.fromResponse(RESERVATION_INFO);

    // then
    expect(String(reservation)).toContain("구입기한 3월 25일 14:30");
  });

  it.each([
    ["구입기한 날짜가 0 이면", { h_ntisu_lmt_dt: "00000000" }],
    ["구입기한 시각이 235959 면", { h_ntisu_lmt_tm: "235959" }],
  ])("%s 예약대기다", (_label, overrides) => {
    // when
    const reservation = Reservation.fromResponse({ ...RESERVATION_INFO, ...overrides });

    // then
    expect(reservation.isWaiting).toBe(true);
    expect(String(reservation)).toContain("예약대기");
  });

  it("구입기한 형식이 이상하면 원본을 그대로 보여준다", () => {
    // when
    const reservation = Reservation.fromResponse({
      ...RESERVATION_INFO,
      h_ntisu_lmt_dt: "곧",
      h_ntisu_lmt_tm: "1430",
    });

    // then
    expect(String(reservation)).toContain("구입기한 곧 14:30");
  });

  it("불변이다", () => {
    // when
    const reservation = Reservation.fromResponse(RESERVATION_INFO);

    // then
    expect(Object.isFrozen(reservation)).toBe(true);
  });
});

describe("Ticket", () => {
  it("승차권 목록 항목을 풀어 만든다", () => {
    // given
    const [entry] = TICKET_LIST_PAYLOAD.reservation_list;

    // when
    const ticket = Ticket.fromTicketList(entry);

    // then
    expect(ticket?.pnrNo).toBe("1234567890");
  });

  it("원권 식별자 4종을 이어 승차권번호를 만든다", () => {
    // when
    const ticket = Ticket.fromResponse(TICKET_RAW);

    // then
    expect(ticket.ticketNo).toBe("0000-20260320-0001-1111");
  });

  it("좌석번호를 주면 목록 응답의 값을 덮는다", () => {
    // when
    const ticket = Ticket.fromResponse(TICKET_RAW, "7C");

    // then
    expect(ticket.seatNo).toBe("7C");
    expect(ticket.seatNoEnd).toBeUndefined();
  });

  it("좌석이 여러 장이면 범위로 표시한다", () => {
    // when
    const ticket = Ticket.fromResponse(TICKET_RAW);

    // then
    expect(String(ticket)).toContain("3호 5A~5B");
  });

  it("좌석이 한 장이면 하나만 표시한다", () => {
    // when
    const ticket = Ticket.fromResponse({ ...TICKET_RAW, h_seat_cnt: "1" });

    // then
    expect(String(ticket)).toContain("3호 5A,");
  });

  it.each([
    ["ticket_list 가 없으면", {}],
    ["ticket_list 가 비었으면", { ticket_list: [] }],
    ["train_info 가 비었으면", { ticket_list: [{ train_info: [] }] }],
    ["train_info 가 빈 객체면", { ticket_list: [{ train_info: [{}] }] }],
    ["항목이 객체가 아니면", "문자열"],
  ])("%s 읽을 수 없는 항목이다", (_label, entry) => {
    // when & then
    expect(trainInfoOf(entry)).toBeUndefined();
    expect(Ticket.fromTicketList(entry)).toBeUndefined();
  });

  it("불변이다", () => {
    // when
    const ticket = Ticket.fromResponse(TICKET_RAW);

    // then
    expect(Object.isFrozen(ticket)).toBe(true);
  });
});

describe("RefundFee", () => {
  it("환불 사전조회 응답을 읽는다", () => {
    // when
    const fee = RefundFee.fromResponse(REFUND_FEE_PAYLOAD);

    // then
    expect({ fee: fee.fee, amount: fee.amount, usableMileage: fee.usableMileage }).toEqual({
      fee: 5600,
      amount: 53400,
      usableMileage: 1200,
    });
  });

  it("금액을 천 단위로 끊어 보여준다", () => {
    // when
    const fee = RefundFee.fromResponse(REFUND_FEE_PAYLOAD);

    // then
    expect(String(fee)).toBe("53,400원 환불 (수수료 5,600원)");
  });

  it.each([
    ["빈 값이면 불가", ""],
    ["N 이면 불가", "N"],
  ])("환불 가능 플래그가 %s", (_label, flag) => {
    // when
    const fee = RefundFee.fromResponse({ ...REFUND_FEE_PAYLOAD, prg_psb_flg: flag });

    // then
    expect(fee.refundable).toBe(false);
    expect(String(fee)).toBe("환불 불가");
  });

  it("불변이다", () => {
    // when
    const fee = RefundFee.fromResponse(REFUND_FEE_PAYLOAD);

    // then
    expect(Object.isFrozen(fee)).toBe(true);
  });
});
