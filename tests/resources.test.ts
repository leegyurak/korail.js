/**
 * 리소스 — **폼 필드 집합 전체**를 고정합니다.
 *
 * 값 하나만 확인하면 필드가 통째로 빠져도 통과합니다. 코레일은 빠진 필드를
 * 에러가 아니라 조용한 빈 값으로 처리하므로, 키 집합을 통째로 박아 둡니다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_KEY, APP_VERSION, DEVICE } from "../src/constants";
import { NoResultsError, PastDepartureError, StationNotFoundError } from "../src/errors";
import { Card } from "../src/models/card";
import { AdultPassenger, ChildPassenger, SeniorPassenger } from "../src/models/passenger";
import type { Reservation } from "../src/models/reservation";
import { Train } from "../src/models/schedule";
import { Ticket } from "../src/models/ticket";
import { ReserveOption } from "../src/options";
import { encodeForm } from "../src/transport";
import { korail, makeKorail } from "./helpers";
import {
  MANY_RESERVATION_IDS,
  MANY_RESERVATIONS_PAYLOAD,
  NEARBY_SEARCH_PAYLOAD,
  NO_RESULTS,
  REFUND_FEE_PAYLOAD,
  RESERVATION_INFO,
  RESERVATION_LIST_PAYLOAD,
  SEARCH_PAYLOAD,
  SEAT_DETAIL_PAYLOAD,
  SOLD_OUT_INFO,
  STATION_PAYLOAD,
  TICKET_LIST_PAYLOAD,
  TICKET_RAW,
  TICKET_SEAT_PAYLOAD,
  TRAIN_INFO,
} from "./payloads";

const DEPART_AFTER = new Date("2026-04-01T09:00:00+09:00");
const CARD = new Card({
  number: "1234567812345678",
  password: "12",
  verifyNumber: "900101",
  expire: "2812",
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-03-01T00:00:00+09:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("stations", () => {
  it("bodyless POST 로 역 마스터를 부른다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.stations.all();

    // then
    const call = session.callFor("stationdata");
    expect(call.method).toBe("POST");
    expect(call.options.data).toBeUndefined();
    expect(call.options.params).toBeUndefined();
  });

  it("두 번째 호출은 캐시를 쓴다", async () => {
    // given
    const { client, session } = korail();
    await client.stations.all();

    // when
    await client.stations.all();

    // then
    expect(session.allCallsFor("stationdata")).toHaveLength(1);
  });

  it("refresh 하면 다시 받아온다", async () => {
    // given
    const { client, session } = korail();
    await client.stations.all();

    // when
    await client.stations.all(true);

    // then
    expect(session.allCallsFor("stationdata")).toHaveLength(2);
  });

  it("돌려준 배열을 고쳐도 캐시가 깨지지 않는다", async () => {
    // given
    const { client } = korail();
    const first = await client.stations.all();

    // when
    first.length = 0;

    // then
    expect(await client.stations.all()).toHaveLength(3);
  });

  it("이름으로 역을 찾는다", async () => {
    // given
    const { client } = korail();

    // when
    const station = await client.stations.find("부산");

    // then
    expect(station?.code).toBe("0020");
  });

  it("없는 이름이면 undefined 다", async () => {
    // given
    const { client } = korail();

    // when & then
    expect(await client.stations.find("없는역")).toBeUndefined();
  });

  it("이름 집합을 준다", async () => {
    // given
    const { client } = korail();

    // when
    const names = await client.stations.names();

    // then
    expect([...names].sort()).toEqual(["대전", "부산", "서울"]);
  });

  it("없는 역이면 요청 전에 막는다", async () => {
    // given
    const { client } = korail();

    // when & then
    await expect(client.stations.ensureExist("서울", "없는역")).rejects.toThrow(
      StationNotFoundError,
    );
  });

  it("있는 역만 있으면 통과한다", async () => {
    // given
    const { client } = korail();

    // when & then
    await expect(client.stations.ensureExist("서울", "부산")).resolves.toBeUndefined();
  });
});

describe("trains.search", () => {
  it("조회 폼 필드 집합 전체가 앱과 같다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.trains.search("서울", "부산", { departAfter: DEPART_AFTER });

    // then
    expect(session.formFor("searchSchedule")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Sid: "",
      txtMenuId: "11",
      radJobId: "1",
      selGoTrain: "109",
      txtTrnGpCd: "109",
      txtGoStart: "서울",
      txtGoEnd: "부산",
      txtGoAbrdDt: "20260401",
      txtGoHour: "090000",
      txtPsgFlg_1: 1,
      txtPsgFlg_2: 0,
      txtPsgFlg_3: 0,
      txtPsgFlg_4: 0,
      txtPsgFlg_5: 0,
      txtSeatAttCd_2: "000",
      txtSeatAttCd_3: "000",
      txtSeatAttCd_4: "015",
      ebizCrossCheck: "N",
      srtCheckYn: "N",
      rtYn: "N",
      adjStnScdlOfrFlg: "N",
      mbCrdNo: undefined,
    });
  });

  it("바디 없는 POST 에 쿼리스트링으로 나간다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.trains.search("서울", "부산", { departAfter: DEPART_AFTER });

    // then
    const call = session.callFor("searchSchedule");
    expect(call.method).toBe("POST");
    expect(call.options.data).toBeUndefined();
    expect(call.options.params).toBeDefined();
  });

  it("조회만 Key 없이 빈 Sid 를 보낸다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.trains.search("서울", "부산", { departAfter: DEPART_AFTER });

    // then
    const form = session.formFor("searchSchedule");
    expect(form.Key).toBeUndefined();
    expect(form.Sid).toBe("");
  });

  it("DynaPath 토큰 헤더를 싣는다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.trains.search("서울", "부산", { departAfter: DEPART_AFTER });

    // then
    expect(session.callFor("searchSchedule").options.headers?.["x-dynapath-m-token"]).toMatch(
      /^bEeEP/,
    );
  });

  it("승객 인원을 유형별 칸에 나눠 싣는다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.trains.search("서울", "부산", {
      departAfter: DEPART_AFTER,
      passengers: [new AdultPassenger(2), new ChildPassenger(1), new SeniorPassenger(1)],
    });

    // then
    const form = session.formFor("searchSchedule");
    expect([form.txtPsgFlg_1, form.txtPsgFlg_2, form.txtPsgFlg_3]).toEqual([2, 1, 1]);
  });

  it("인접역 옵션을 켜면 Y 를 보낸다", async () => {
    // given
    const { client, session } = makeKorail({
      stationdata: STATION_PAYLOAD,
      searchSchedule: NEARBY_SEARCH_PAYLOAD,
    });

    // when
    await client.trains.search("서울", "부산", {
      departAfter: DEPART_AFTER,
      includeNearbyStations: true,
    });

    // then
    expect(session.formFor("searchSchedule").adjStnScdlOfrFlg).toBe("Y");
  });

  it("좌석 있는 열차만 기본으로 돌려준다", async () => {
    // given
    const { client } = korail();

    // when
    const trains = await client.trains.search("서울", "부산", { departAfter: DEPART_AFTER });

    // then
    expect(trains.map((train) => train.trainNo)).toEqual(["101"]);
  });

  it("includeNoSeats 면 매진 열차도 준다", async () => {
    // given
    const { client } = korail();

    // when
    const trains = await client.trains.search("서울", "부산", {
      departAfter: DEPART_AFTER,
      includeNoSeats: true,
    });

    // then
    expect(trains.map((train) => train.trainNo)).toEqual(["101", "103"]);
  });

  it("includeWaitingList 면 예약대기 열차도 준다", async () => {
    // given
    const waiting = { ...SOLD_OUT_INFO, h_wait_rsv_flg: "9" };
    const { client } = makeKorail({
      stationdata: STATION_PAYLOAD,
      searchSchedule: { strResult: "SUCC", trn_infos: { trn_info: [waiting] } },
    });

    // when
    const trains = await client.trains.search("서울", "부산", {
      departAfter: DEPART_AFTER,
      includeWaitingList: true,
    });

    // then
    expect(trains).toHaveLength(1);
  });

  it("결과가 없으면 NoResultsError 다", async () => {
    // given
    const { client } = makeKorail({
      stationdata: STATION_PAYLOAD,
      searchSchedule: { strResult: "SUCC", trn_infos: { trn_info: [SOLD_OUT_INFO] } },
    });

    // when & then
    await expect(
      client.trains.search("서울", "부산", { departAfter: DEPART_AFTER }),
    ).rejects.toThrow(NoResultsError);
  });

  it("서버가 결과 없음으로 응답해도 NoResultsError 다", async () => {
    // given
    const { client } = makeKorail({ stationdata: STATION_PAYLOAD, searchSchedule: NO_RESULTS });

    // when & then
    expect.assertions(1);
    await expect(
      client.trains.search("서울", "부산", { departAfter: DEPART_AFTER }),
    ).rejects.toThrow(NoResultsError);
  });

  it("없는 역이면 요청을 보내지 않는다", async () => {
    // given
    const { client, session } = korail();

    // when
    await expect(client.trains.search("서울역", "부산")).rejects.toThrow(StationNotFoundError);

    // then
    expect(session.allCallsFor("searchSchedule")).toEqual([]);
  });

  it("역 검증을 끄면 그대로 보낸다", async () => {
    // given
    const { client, session } = korail({ validateStations: false });

    // when
    await client.trains.search("서울역", "부산", { departAfter: DEPART_AFTER });

    // then
    expect(session.formFor("searchSchedule").txtGoStart).toBe("서울역");
  });

  it("지난 시각이면 요청 전에 막는다", async () => {
    // given
    const { client, session } = korail();
    const past = new Date("2026-02-01T09:00:00+09:00");

    // when
    await expect(client.trains.search("서울", "부산", { departAfter: past })).rejects.toThrow(
      PastDepartureError,
    );

    // then
    expect(session.allCallsFor("searchSchedule")).toEqual([]);
  });

  it("지금을 넘기면 유예 안이라 통과한다", async () => {
    // given
    const { client } = korail();

    // when
    const trains = await client.trains.search("서울", "부산", { departAfter: new Date() });

    // then
    expect(trains).toHaveLength(1);
  });

  it("출발 시각을 생략하면 지금으로 조회한다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.trains.search("서울", "부산");

    // then
    expect(session.formFor("searchSchedule").txtGoAbrdDt).toBe("20260301");
  });
});

describe("reservations", () => {
  it("예약 목록 폼 필드가 앱 신원값뿐이다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.reservations.all();

    // then
    expect(session.formFor("myreservationview")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
    });
  });

  it("좌석 상세를 붙여 완성된 예약을 준다", async () => {
    // given
    const { client } = korail();

    // when
    const [reservation] = await client.reservations.all();

    // then
    expect(reservation?.seats).toHaveLength(1);
    expect(reservation?.wctNo).toBe("0143");
  });

  it("좌석 조회 폼에 예약번호를 싣는다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.reservations.all();

    // then
    expect(session.formFor("myreservationlist")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
      hidPnrNo: "1234567890",
    });
  });

  it("예약이 없으면 빈 배열이다", async () => {
    // given
    const { client } = makeKorail({ myreservationview: NO_RESULTS });

    // when & then
    expect(await client.reservations.all()).toEqual([]);
  });

  it("find 는 일치하는 예약의 좌석만 조회한다", async () => {
    // given
    const { client, session } = makeKorail({
      myreservationview: MANY_RESERVATIONS_PAYLOAD,
      myreservationlist: SEAT_DETAIL_PAYLOAD,
    });

    // when
    await client.reservations.find("1234567890");

    // then
    expect(
      session.allCallsFor("myreservationlist").map((call) => call.options.params?.hidPnrNo),
    ).toEqual(["1234567890"]);
  });

  it("all 은 모든 예약의 좌석을 조회한다", async () => {
    // given
    const { client, session } = makeKorail({
      myreservationview: MANY_RESERVATIONS_PAYLOAD,
      myreservationlist: SEAT_DETAIL_PAYLOAD,
    });

    // when
    await client.reservations.all();

    // then
    expect(
      session.allCallsFor("myreservationlist").map((call) => call.options.params?.hidPnrNo),
    ).toEqual(MANY_RESERVATION_IDS);
  });

  it.each([
    ["빈 문자열", ""],
    ["undefined", undefined],
  ])("예약번호가 %s 면 요청하지 않는다", async (_label, rsvId) => {
    // given
    const { client, session } = korail();

    // when
    const found = await client.reservations.find(rsvId);

    // then
    expect(found).toBeUndefined();
    expect(session.calls).toEqual([]);
  });

  it("목록에 없는 예약번호면 좌석을 조회하지 않는다", async () => {
    // given
    const { client, session } = korail();

    // when
    const found = await client.reservations.find("0000000000");

    // then
    expect(found).toBeUndefined();
    expect(session.allCallsFor("myreservationlist")).toEqual([]);
  });

  it("좌석 조회에 결과가 없어도 모양을 유지한다", async () => {
    // given
    const { client } = makeKorail({
      myreservationview: RESERVATION_LIST_PAYLOAD,
      myreservationlist: NO_RESULTS,
    });

    // when
    const seats = await client.reservations.seats("1234567890");

    // then
    expect(seats).toEqual({ seats: [], wctNo: undefined });
  });

  it("여정이 비어 있어도 발매창구는 읽는다", async () => {
    // given
    const { client } = makeKorail({
      myreservationlist: { strResult: "SUCC", h_wct_no: "0143", jrny_infos: { jrny_info: [] } },
    });

    // when
    const seats = await client.reservations.seats("1234567890");

    // then
    expect(seats).toEqual({ seats: [], wctNo: "0143" });
  });
});

describe("reservations.create", () => {
  const EXPECTED_KEYS = [
    "Device",
    "Version",
    "Key",
    "txtMenuId",
    "txtJobId",
    "txtGdNo",
    "hidFreeFlg",
    "txtTotPsgCnt",
    "txtSeatAttCd1",
    "txtSeatAttCd2",
    "txtSeatAttCd3",
    "txtSeatAttCd4",
    "txtSeatAttCd5",
    "txtStndFlg",
    "txtSrcarCnt",
    "txtJrnyCnt",
    "txtJrnySqno1",
    "txtJrnyTpCd1",
    "txtDptDt1",
    "txtDptRsStnCd1",
    "txtDptTm1",
    "txtArvRsStnCd1",
    "txtTrnNo1",
    "txtRunDt1",
    "txtTrnClsfCd1",
    "txtTrnGpCd1",
    "txtPsrmClCd1",
    "txtChgFlg1",
    "txtJrnySqno2",
    "txtJrnyTpCd2",
    "txtDptDt2",
    "txtDptRsStnCd2",
    "txtDptTm2",
    "txtArvRsStnCd2",
    "txtTrnNo2",
    "txtRunDt2",
    "txtTrnClsfCd2",
    "txtPsrmClCd2",
    "txtChgFlg2",
    "txtPsgTpCd1",
    "txtDiscKndCd1",
    "txtCompaCnt1",
    "txtCardCode_1",
    "txtCardNo_1",
    "txtCardPw_1",
  ];

  it("예매 폼 필드 집합 전체가 앱과 같다", async () => {
    // given
    const { client, session } = korail();
    const train = Train.fromResponse(TRAIN_INFO);

    // when
    await client.reservations.create(train);

    // then
    expect(Object.keys(session.formFor("reserve"))).toEqual(EXPECTED_KEYS);
  });

  it("2번째 여정 필드를 빈 문자열로 보낸다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.reservations.create(Train.fromResponse(TRAIN_INFO));

    // then
    const form = session.formFor("reserve");
    expect([form.txtChgFlg2, form.txtJrnySqno2, form.txtDptDt2]).toEqual(["", "", ""]);
  });

  it("열차 식별 필드를 그대로 되돌려 보낸다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.reservations.create(Train.fromResponse(TRAIN_INFO));

    // then
    const form = session.formFor("reserve");
    expect([form.txtTrnNo1, form.txtRunDt1, form.txtDptRsStnCd1, form.txtArvRsStnCd1]).toEqual([
      "101",
      "20260401",
      "0001",
      "0020",
    ]);
  });

  it.each([
    [ReserveOption.GENERAL_FIRST, "1"],
    [ReserveOption.GENERAL_ONLY, "1"],
    [ReserveOption.SPECIAL_FIRST, "2"],
    [ReserveOption.SPECIAL_ONLY, "2"],
  ])("좌석이 있을 때 %s 는 객실 등급 %s 를 고른다", async (option, expected) => {
    // given
    const { client, session } = korail();

    // when
    await client.reservations.create(Train.fromResponse(TRAIN_INFO), undefined, option);

    // then
    expect(session.formFor("reserve").txtPsrmClCd1).toBe(expected);
  });

  it("일반실이 매진이면 GENERAL_FIRST 도 특실을 고른다", async () => {
    // given
    const { client, session } = korail();
    const train = Train.fromResponse({ ...TRAIN_INFO, h_gen_rsv_cd: "00" });

    // when
    await client.reservations.create(train, undefined, ReserveOption.GENERAL_FIRST);

    // then
    expect(session.formFor("reserve").txtPsrmClCd1).toBe("2");
  });

  it("좌석이 있으면 예매 작업코드(1101)를 쓴다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.reservations.create(Train.fromResponse(TRAIN_INFO));

    // then
    expect(session.formFor("reserve").txtJobId).toBe("1101");
  });

  it("매진인데 예약대기가 열려 있으면 대기 작업코드(1102)를 쓴다", async () => {
    // given
    const { client, session } = korail();
    const waiting = Train.fromResponse({ ...SOLD_OUT_INFO, h_wait_rsv_flg: "9" });

    // when
    await client.reservations.create(waiting);

    // then
    expect(session.formFor("reserve").txtJobId).toBe("1102");
  });

  it("예약대기 미적용 열차는 좌석 예매로 시도한다", async () => {
    // given
    const { client, session } = korail();
    const { h_wait_rsv_flg: _omitted, ...noFlag } = SOLD_OUT_INFO;

    // when
    await client.reservations.create(Train.fromResponse(noFlag));

    // then
    expect(session.formFor("reserve").txtJobId).toBe("1101");
  });

  it.each([
    [ReserveOption.GENERAL_FIRST, "1"],
    [ReserveOption.SPECIAL_FIRST, "2"],
  ])("예약대기에서 %s 는 객실 등급 %s 를 고른다", async (option, expected) => {
    // given
    const { client, session } = korail();
    const waiting = Train.fromResponse({ ...SOLD_OUT_INFO, h_wait_rsv_flg: "9" });

    // when
    await client.reservations.create(waiting, undefined, option);

    // then
    expect(session.formFor("reserve").txtPsrmClCd1).toBe(expected);
  });

  it("승객을 합쳐 블록 인덱스를 붙인다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.reservations.create(Train.fromResponse(TRAIN_INFO), [
      new AdultPassenger(1),
      new ChildPassenger(1),
      new AdultPassenger(1),
    ]);

    // then
    const form = session.formFor("reserve");
    expect([form.txtTotPsgCnt, form.txtCompaCnt1, form.txtCompaCnt2]).toEqual([3, 2, 1]);
  });

  it("예매 후 예약을 다시 조회해 돌려준다", async () => {
    // given
    const { client } = korail();

    // when
    const reservation = await client.reservations.create(Train.fromResponse(TRAIN_INFO));

    // then
    expect(reservation.rsvId).toBe("1234567890");
  });

  it("예매 후 예약을 찾지 못하면 에러다", async () => {
    // given
    const { client } = makeKorail({
      reserve: { strResult: "SUCC", h_pnr_no: "9999999999" },
      myreservationview: RESERVATION_LIST_PAYLOAD,
      myreservationlist: SEAT_DETAIL_PAYLOAD,
    });

    // when & then
    expect.assertions(1);
    await expect(client.reservations.create(Train.fromResponse(TRAIN_INFO))).rejects.toThrow(
      /다시 조회하지 못했습니다/,
    );
  });
});

describe("reservations.pay", () => {
  it("결제 폼 필드 집합 전체가 앱과 같다", async () => {
    // given
    const { client, session } = korail();
    const [reservation] = await client.reservations.all();

    // when
    await client.reservations.pay(reservation as Reservation, CARD);

    // then
    expect(session.formFor("pay")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
      hidPnrNo: "1234567890",
      hidWctNo: "0143",
      hidTmpJobSqno1: "000000",
      hidTmpJobSqno2: "000000",
      hidRsvChgNo: "000",
      hidInrecmnsGridcnt: "1",
      hidStlMnsSqno1: "1",
      hidStlMnsCd1: "02",
      hidMnsStlAmt1: "119600",
      hidCrdInpWayCd1: "@",
      hidStlCrCrdNo1: "1234567812345678",
      hidVanPwd1: "12",
      hidCrdVlidTrm1: "2812",
      hidIsmtMnthNum1: 0,
      hidAthnDvCd1: "J",
      hidAthnVal1: "900101",
      hiduserYn: "Y",
    });
  });

  it("법인카드 플래그를 싣는다", async () => {
    // given
    const { client, session } = korail();
    const [reservation] = await client.reservations.all();
    const corporate = new Card({
      number: "1234567812345678",
      password: "12",
      verifyNumber: "1234567890",
      expire: "2812",
      isCorporate: true,
    });

    // when
    await client.reservations.pay(reservation as Reservation, corporate);

    // then
    expect(session.formFor("pay").hidAthnDvCd1).toBe("S");
  });

  it.each([
    ["예약", { reservation: {} as Reservation, card: CARD }],
    ["카드", { reservation: undefined as unknown as Reservation, card: {} as Card }],
  ])("%s 타입이 아니면 거부한다", async (_label, { reservation, card }) => {
    // given
    const { client } = korail();

    // when & then
    await expect(client.reservations.pay(reservation, card)).rejects.toThrow(TypeError);
  });
});

describe("reservations.cancel", () => {
  it("취소 폼 필드 집합 전체가 앱과 같다", async () => {
    // given
    const { client, session } = korail();
    const [reservation] = await client.reservations.all();

    // when
    await client.reservations.cancel(reservation as Reservation);

    // then
    expect(session.formFor("cancel")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
      txtPnrNo: "1234567890",
      txtJrnySqno: "001",
      txtJrnyCnt: "01",
      hidRsvChgNo: "00000",
    });
  });

  it("예약 타입이 아니면 거부한다", async () => {
    // given
    const { client } = korail();

    // when & then
    await expect(client.reservations.cancel({} as Reservation)).rejects.toThrow(TypeError);
  });

  it("서버가 거부하면 에러를 올린다", async () => {
    // given
    const { client } = makeKorail({
      myreservationview: RESERVATION_LIST_PAYLOAD,
      myreservationlist: SEAT_DETAIL_PAYLOAD,
      cancel: NO_RESULTS,
    });
    const [reservation] = await client.reservations.all();

    // when & then
    expect.assertions(1);
    await expect(client.reservations.cancel(reservation as Reservation)).rejects.toThrow(
      NoResultsError,
    );
  });
});

describe("tickets", () => {
  it("승차권 목록 폼 필드 집합 전체가 앱과 같다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.tickets.all();

    // then
    expect(session.formFor("myticketlist")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
      txtDeviceId: "",
      txtIndex: "1",
      h_page_no: "1",
      h_abrd_dt_from: "",
      h_abrd_dt_to: "",
      hiduserYn: "Y",
    });
  });

  it("좌석 상세 조회로 좌석번호를 확정한다", async () => {
    // given
    const { client } = korail();

    // when
    const [ticket] = await client.tickets.all();

    // then
    expect(ticket?.seatNo).toBe("7C");
  });

  it("좌석 상세 조회 폼에 원권 식별자 4종을 싣는다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.tickets.all();

    // then
    expect(session.formFor("myticketseat")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
      h_orgtk_wct_no: "0000",
      h_orgtk_ret_sale_dt: "20260320",
      h_orgtk_sale_sqno: "0001",
      h_orgtk_ret_pwd: "1111",
    });
  });

  it("원권 식별자가 하나도 없으면 상세를 조회하지 않는다", async () => {
    // given
    const bare = {
      ...TICKET_RAW,
      h_orgtk_wct_no: "",
      h_orgtk_ret_sale_dt: "",
      h_orgtk_sale_sqno: "",
      h_orgtk_ret_pwd: "",
    };
    const { client, session } = makeKorail({
      myticketlist: {
        strResult: "SUCC",
        reservation_list: [{ ticket_list: [{ train_info: [bare] }] }],
      },
    });

    // when
    const tickets = await client.tickets.all();

    // then
    expect(tickets).toHaveLength(1);
    expect(session.allCallsFor("myticketseat")).toEqual([]);
  });

  it("상세 조회에 결과가 없으면 목록의 좌석번호로 되돌아간다", async () => {
    // given
    const { client } = makeKorail({
      myticketlist: TICKET_LIST_PAYLOAD,
      myticketseat: NO_RESULTS,
    });

    // when
    const [ticket] = await client.tickets.all();

    // then
    expect(ticket?.seatNo).toBe("5A");
  });

  it("목록이 비면 빈 배열이다", async () => {
    // given
    const { client } = makeKorail({ myticketlist: NO_RESULTS });

    // when & then
    expect(await client.tickets.all()).toEqual([]);
  });

  it("읽을 수 없는 항목은 건너뛴다", async () => {
    // given
    const { client } = makeKorail({
      myticketlist: {
        strResult: "SUCC",
        reservation_list: [{}, { ticket_list: [{ train_info: [TICKET_RAW] }] }],
      },
      myticketseat: TICKET_SEAT_PAYLOAD,
    });

    // when
    const tickets = await client.tickets.all();

    // then
    expect(tickets).toHaveLength(1);
  });
});

describe("tickets.refundFee", () => {
  it("환불 수수료 조회 폼 필드 집합 전체가 앱과 같다", async () => {
    // given
    const { client, session } = korail();
    const ticket = Ticket.fromResponse(TICKET_RAW);

    // when
    await client.tickets.refundFee(ticket);

    // then
    expect(session.formFor("refundCommission")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
      h_orgtk_ret_sale_dt: "20260320",
      h_orgtk_wct_no: "0000",
      h_orgtk_sale_sqno: "0001",
      h_orgtk_ret_pwd: "1111",
      h_comp_nm: "",
      h_comp_cert_no: "",
      ctlDvCd: "",
      lang: "",
    });
  });

  it("조회 결과를 RefundFee 로 돌려준다", async () => {
    // given
    const { client } = korail();

    // when
    const fee = await client.tickets.refundFee(Ticket.fromResponse(TICKET_RAW));

    // then
    expect(fee.amount).toBe(Number(REFUND_FEE_PAYLOAD.ret_amt));
  });
});

describe("tickets.refund", () => {
  it("환불 폼 필드 집합 전체가 앱과 같다", async () => {
    // given
    const { client, session } = korail();

    // when
    await client.tickets.refund(Ticket.fromResponse(TICKET_RAW));

    // then
    expect(session.formFor("refund")).toEqual({
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
      txtPrnNo: "1234567890",
      h_orgtk_sale_dt: "20260320",
      h_orgtk_sale_wct_no: "0000",
      h_orgtk_ret_pwd: "1111",
      h_orgtk_sale_sqno: "0001",
      h_mlg_stl: "N",
      tk_ret_tms_dv_cd: "21",
      trnNo: "101",
      pbpAcepTgtFlg: "N",
      latitude: "",
      longitude: "",
    });
  });

  it("환불과 수수료 조회의 필드 이름이 서로 다르다", async () => {
    // given
    const { client, session } = korail();
    const ticket = Ticket.fromResponse(TICKET_RAW);

    // when
    await client.tickets.refundFee(ticket);
    await client.tickets.refund(ticket);

    // then
    expect(Object.keys(session.formFor("refundCommission"))).toContain("h_orgtk_wct_no");
    expect(Object.keys(session.formFor("refund"))).toContain("h_orgtk_sale_wct_no");
  });
});

describe("HTTP 메서드", () => {
  it("엔드포인트별 GET/POST 구분이 pykorail 과 같다", async () => {
    // given
    const { client, session } = korail();
    const [reservation] = await client.reservations.all();

    // when
    await client.trains.search("서울", "부산", { departAfter: DEPART_AFTER });
    await client.stations.all();
    await client.reservations.create(Train.fromResponse(TRAIN_INFO));
    await client.reservations.pay(reservation as Reservation, CARD);
    await client.reservations.cancel(reservation as Reservation);
    await client.tickets.all();
    await client.tickets.refundFee(Ticket.fromResponse(TICKET_RAW));
    await client.tickets.refund(Ticket.fromResponse(TICKET_RAW));
    await client.logout();

    // then
    const methods = Object.fromEntries(
      (
        [
          "stationdata",
          "searchSchedule",
          "myreservationview",
          "myreservationlist",
          "reserve",
          "pay",
          "cancel",
          "myticketlist",
          "myticketseat",
          "refundCommission",
          "refund",
          "logout",
        ] as const
      ).map((endpoint) => [endpoint, session.callFor(endpoint).method]),
    );
    expect(methods).toEqual({
      stationdata: "POST",
      searchSchedule: "POST",
      myreservationview: "GET",
      myreservationlist: "GET",
      reserve: "GET",
      pay: "POST",
      cancel: "POST",
      myticketlist: "GET",
      myticketseat: "GET",
      refundCommission: "POST",
      refund: "POST",
      logout: "GET",
    });
  });

  it("바디를 쓰는 요청과 쿼리를 쓰는 요청이 섞이지 않는다", async () => {
    // given
    const { client, session } = korail();
    const [reservation] = await client.reservations.all();

    // when
    await client.reservations.pay(reservation as Reservation, CARD);

    // then
    const bothSet = session.calls.filter(
      (call) => call.options.params !== undefined && call.options.data !== undefined,
    );
    expect(bothSet).toEqual([]);
  });
});

describe("폼 값", () => {
  it("모든 요청의 폼 값에 undefined 가 없다", async () => {
    // given
    const { client, session } = korail();
    const [reservation] = await client.reservations.all();

    // when
    await client.trains.search("서울", "부산", { departAfter: DEPART_AFTER });
    await client.reservations.create(Train.fromResponse(TRAIN_INFO));
    await client.reservations.pay(reservation as Reservation, CARD);
    await client.reservations.cancel(reservation as Reservation);
    await client.tickets.all();
    await client.tickets.refund(Ticket.fromResponse(TICKET_RAW));

    // then
    // 실제로 와이어에 나가는 것은 인코딩 결과입니다 — `undefined`/`null` 이 글자로
    // 새어 나가지 않는지는 거기서 봐야 합니다.
    const leaked = session.calls
      .map((call) => ({
        url: call.url,
        encoded: encodeForm({ ...call.options.params, ...call.options.data }),
      }))
      .filter(({ encoded }) => /=(undefined|null)(&|$)/.test(encoded))
      .map(({ url }) => url);
    expect(leaked).toEqual([]);
  });

  it("검색 결과가 실제 응답 열차 수와 맞는다", async () => {
    // given
    const { client } = korail();

    // when
    const trains = await client.trains.search("서울", "부산", {
      departAfter: DEPART_AFTER,
      includeNoSeats: true,
    });

    // then
    expect(trains).toHaveLength(SEARCH_PAYLOAD.trn_infos.trn_info.length);
  });

  it("예약 응답의 열차 정보를 그대로 읽는다", async () => {
    // given
    const { client } = korail();

    // when
    const [reservation] = await client.reservations.all();

    // then
    expect(reservation?.price).toBe(Number(RESERVATION_INFO.h_rsv_amt));
  });
});
