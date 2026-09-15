/** 예약 리소스. */

import { API_ENDPOINTS } from "../constants";
import { KorailApiError, NoResultsError } from "../errors";
import { Card } from "../models/card";
import type { ResponseData } from "../models/parsing";
import { list, text } from "../models/parsing";
import { AdultPassenger, Passenger } from "../models/passenger";
import { Reservation } from "../models/reservation";
import type { Train } from "../models/schedule";
import { Seat } from "../models/seat";
import type { ReserveOptionCode } from "../options";
import { ReserveOption } from "../options";
import { Resource } from "./base";

/** 좌석이 있는 열차를 예매할 때의 특실 선택 규칙. 값은 "특실을 고를지" 여부입니다. */
const SEATED_PREFERS_SPECIAL: Record<ReserveOptionCode, (train: Train) => boolean> = {
  [ReserveOption.GENERAL_ONLY]: () => false,
  [ReserveOption.SPECIAL_ONLY]: () => true,
  [ReserveOption.GENERAL_FIRST]: (train) => !train.hasGeneralSeat(),
  [ReserveOption.SPECIAL_FIRST]: (train) => train.hasSpecialSeat(),
};

/** 좌석이 없어 예약대기를 걸 때의 규칙. 가용 좌석이 없으니 선호만 반영합니다. */
const WAITING_PREFERS_SPECIAL: Record<ReserveOptionCode, boolean> = {
  [ReserveOption.GENERAL_ONLY]: false,
  [ReserveOption.GENERAL_FIRST]: false,
  [ReserveOption.SPECIAL_ONLY]: true,
  [ReserveOption.SPECIAL_FIRST]: true,
};

/** 예약의 좌석 상세와 발매창구 번호. */
export interface ReservationSeats {
  readonly seats: readonly Seat[];
  readonly wctNo: string | undefined;
}

/** `korail.reservations` — 예매·조회·취소. */
export class ReservationResource extends Resource {
  /**
   * 결제 전 예약 목록. 없으면 빈 배열.
   *
   * 각 예약의 좌석 상세까지 채워서 돌려주므로 예약 수만큼 추가 요청이 나갑니다.
   * 하나만 필요하면 {@link find} 를 쓰세요 — 그쪽은 2회로 끝납니다.
   */
  async all(): Promise<Reservation[]> {
    const entries = await this.#entries();
    const reservations: Reservation[] = [];
    for (const entry of entries) {
      reservations.push(await this.#complete(entry));
    }
    return reservations;
  }

  /**
   * `rsvId` 와 일치하는 예약 하나. 없으면 `undefined`.
   *
   * 목록을 전부 조립하지 않고 **일치하는 예약의 좌석만** 조회합니다. 예약이
   * N건이어도 찾았을 때 요청은 2회(목록 + 그 예약의 좌석)이고, 목록에 없으면
   * 1회에서 멈춥니다.
   */
  async find(rsvId: string | undefined): Promise<Reservation | undefined> {
    if (rsvId === undefined || rsvId === "") {
      return undefined;
    }
    const entries = await this.#entries();
    const matched = entries.find((entry) => text(entry, "h_pnr_no") === rsvId);
    return matched === undefined ? undefined : this.#complete(matched);
  }

  /** 예약 목록 응답에서 예약 항목들을 평평하게 꺼냅니다. 없으면 빈 배열. */
  async #entries(): Promise<ResponseData[]> {
    const payload = await this.api.get(API_ENDPOINTS.myreservationview, {
      params: this.api.basePayload(),
    });
    try {
      this.api.check(payload);
    } catch (error) {
      if (error instanceof NoResultsError) {
        return [];
      }
      throw error;
    }

    return list(payload.jrny_infos, "jrny_info").flatMap((journey) =>
      list((journey as ResponseData).train_infos, "train_info"),
    ) as ResponseData[];
  }

  /**
   * 예약 항목 하나에 좌석 상세를 붙여 완성합니다 (요청 1회).
   *
   * 좌석을 나중에 주입하지 않고 여기서 미리 조회해 생성자에 넘깁니다 —
   * 반쯤 채워진 예약이 돌아다니면 안 됩니다 (AGENTS.md §2-3).
   */
  async #complete(entry: ResponseData): Promise<Reservation> {
    const rsvId = entry.h_pnr_no;
    const { seats, wctNo } = await this.seats(typeof rsvId === "string" ? rsvId : undefined);
    return Reservation.fromResponse(entry, { seats, wctNo });
  }

  /**
   * 예약의 좌석 상세와 발매창구 번호(`wctNo`).
   *
   * 조회 결과가 없으면 `{ seats: [], wctNo: undefined }` 를 돌려줍니다 — 호출부가
   * 항상 같은 모양으로 풀 수 있어야 하므로 실패해도 모양을 유지합니다.
   */
  async seats(rsvId?: string | undefined): Promise<ReservationSeats> {
    const payload = await this.api.get(API_ENDPOINTS.myreservationlist, {
      params: { ...this.api.basePayload(), hidPnrNo: rsvId },
    });
    try {
      this.api.check(payload);
    } catch (error) {
      if (error instanceof NoResultsError) {
        return { seats: Object.freeze([]), wctNo: undefined };
      }
      throw error;
    }

    const wctNo = typeof payload.h_wct_no === "string" ? payload.h_wct_no : undefined;
    const [journey] = list(payload.jrny_infos, "jrny_info");
    if (journey === undefined) {
      return { seats: Object.freeze([]), wctNo };
    }

    const seatInfo = list((journey as ResponseData).seat_infos, "seat_info");
    return { seats: Object.freeze(seatInfo.map((seat) => Seat.fromResponse(seat))), wctNo };
  }

  /**
   * 열차를 예매합니다. 좌석이 없고 예약대기가 열려 있으면 대기를 겁니다.
   *
   * @throws {KorailApiError} 서버가 예매를 거부했거나(매진 등), 예매 후 예약을
   *   다시 조회하지 못했습니다.
   */
  async create(
    train: Train,
    passengers?: readonly Passenger[] | undefined,
    option: ReserveOptionCode = ReserveOption.GENERAL_FIRST,
  ): Promise<Reservation> {
    const reservingSeat = train.hasSeat() || train.waitReserveFlag < 0;
    // 좌석이 없고 예약대기가 열려 있는 열차 — 대기를 겁니다.
    const isSpecialSeat = reservingSeat
      ? SEATED_PREFERS_SPECIAL[option](train)
      : WAITING_PREFERS_SPECIAL[option];

    const reduced = Passenger.reduce(passengers ?? [new AdultPassenger()]);
    const totalCount = reduced.reduce((sum, passenger) => sum + passenger.count, 0);

    const url = API_ENDPOINTS.reserve;
    const { headers } = this.api.sign(url);
    const data: Record<string, string | number> = {
      ...this.api.basePayload(),
      txtMenuId: "11",
      txtJobId: reservingSeat ? "1101" : "1102",
      txtGdNo: "",
      hidFreeFlg: "N",
      txtTotPsgCnt: totalCount,
      txtSeatAttCd1: "000",
      txtSeatAttCd2: "000",
      txtSeatAttCd3: "000",
      txtSeatAttCd4: "015",
      txtSeatAttCd5: "000",
      txtStndFlg: "N",
      txtSrcarCnt: "0",
      txtJrnyCnt: "1",
      txtJrnySqno1: "001",
      txtJrnyTpCd1: "11",
      txtDptDt1: train.depDate,
      txtDptRsStnCd1: train.depCode,
      txtDptTm1: train.depTime,
      txtArvRsStnCd1: train.arrCode,
      txtTrnNo1: train.trainNo,
      txtRunDt1: train.runDate,
      txtTrnClsfCd1: train.trainType,
      txtTrnGpCd1: train.trainGroup,
      txtPsrmClCd1: isSpecialSeat ? "2" : "1",
      txtChgFlg1: "",
      // 편도 예매라 2번째 여정 필드는 비워 보냅니다 (폼이 존재 자체를 요구합니다).
      txtJrnySqno2: "",
      txtJrnyTpCd2: "",
      txtDptDt2: "",
      txtDptRsStnCd2: "",
      txtDptTm2: "",
      txtArvRsStnCd2: "",
      txtTrnNo2: "",
      txtRunDt2: "",
      txtTrnClsfCd2: "",
      txtPsrmClCd2: "",
      txtChgFlg2: "",
    };
    reduced.forEach((passenger, index) => {
      Object.assign(data, passenger.toFormFields(index + 1));
    });

    const payload = await this.api.get(url, { params: data, headers });
    this.api.check(payload);

    const rsvId = payload.h_pnr_no;
    const reservation = await this.find(typeof rsvId === "string" ? rsvId : undefined);
    if (reservation === undefined) {
      throw new KorailApiError(
        `예매는 성공했지만 예약(${String(rsvId)})을 다시 조회하지 못했습니다`,
      );
    }
    return reservation;
  }

  /**
   * 신용카드로 결제해 예약을 승차권으로 확정합니다.
   *
   * @throws {KorailApiError} 결제가 거부됐습니다.
   */
  async pay(reservation: Reservation, card: Card): Promise<void> {
    if (!(reservation instanceof Reservation)) {
      throw new TypeError("reservation must be a Reservation instance");
    }
    if (!(card instanceof Card)) {
      throw new TypeError("card must be a Card instance");
    }

    const payload = await this.api.post(API_ENDPOINTS.pay, {
      data: {
        ...this.api.basePayload(),
        hidPnrNo: reservation.rsvId,
        // 발매창구가 비면 빈 문자열입니다 — pykorail 의 리터럴 `None` 과 다른
        // 의도된 차이입니다 (AGENTS.md §3). 값 없는 필드는 앱처럼 빈 값으로 보냅니다.
        hidWctNo: reservation.wctNo,
        hidTmpJobSqno1: "000000",
        hidTmpJobSqno2: "000000",
        hidRsvChgNo: "000",
        hidInrecmnsGridcnt: "1",
        hidStlMnsSqno1: "1",
        hidStlMnsCd1: "02",
        hidMnsStlAmt1: String(reservation.price),
        hidCrdInpWayCd1: "@",
        hidStlCrCrdNo1: card.number,
        hidVanPwd1: card.password,
        hidCrdVlidTrm1: card.expire,
        hidIsmtMnthNum1: card.installment,
        hidAthnDvCd1: card.authType,
        hidAthnVal1: card.verifyNumber,
        hiduserYn: "Y",
      },
    });
    this.api.check(payload);
  }

  /**
   * 예약을 취소합니다.
   *
   * @throws {KorailApiError} 서버가 취소를 거부했습니다.
   */
  async cancel(reservation: Reservation): Promise<void> {
    if (!(reservation instanceof Reservation)) {
      throw new TypeError("reservation must be a Reservation instance");
    }

    const payload = await this.api.post(API_ENDPOINTS.cancel, {
      data: {
        ...this.api.basePayload(),
        txtPnrNo: reservation.rsvId,
        txtJrnySqno: reservation.journeyNo,
        txtJrnyCnt: reservation.journeyCnt,
        hidRsvChgNo: reservation.rsvChgNo,
      },
    });
    this.api.check(payload);
  }
}
