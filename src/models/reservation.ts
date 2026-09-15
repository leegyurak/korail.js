/** 결제 전 예약. */

import { hhmm, integer, text } from "./parsing";
import { Train, trainFieldsFrom } from "./schedule";
import type { Seat } from "./seat";

const WAITING_BUY_LIMIT_DATE = "00000000";
const WAITING_BUY_LIMIT_TIME = "235959";

/** {@link Reservation} 생성자 인자. */
export interface ReservationFields {
  readonly train: Train;
  readonly rsvId: string;
  readonly seatNoCount: number;
  readonly buyLimitDate: string;
  readonly buyLimitTime: string;
  readonly price: number;
  readonly journeyNo: string;
  readonly journeyCnt: string;
  readonly rsvChgNo: string;
  readonly seats: readonly Seat[];
  readonly wctNo: string | undefined;
}

/** {@link Reservation.fromResponse} 가 함께 받는 부속 데이터. */
export interface ReservationExtras {
  readonly seats?: readonly Seat[];
  readonly wctNo?: string | undefined;
}

/**
 * 아직 결제하지 않은 예약. 구입기한을 넘기면 자동 취소됩니다.
 *
 * 예약은 열차가 *아니라* 열차를 **참조**합니다 — `reservation.train.depName`
 * 처럼 쓰세요. 좌석 상세({@link seats}, {@link wctNo})는 생성 시점에 이미 채워져
 * 있습니다. 반쯤 채워진 예약은 존재하지 않습니다.
 */
export class Reservation implements ReservationFields {
  readonly train: Train;
  readonly rsvId: string;
  readonly seatNoCount: number;
  readonly buyLimitDate: string;
  readonly buyLimitTime: string;
  readonly price: number;

  /** 취소 요청에 그대로 되돌려 줘야 하는 여정 식별자. */
  readonly journeyNo: string;
  readonly journeyCnt: string;
  readonly rsvChgNo: string;

  /** 배정된 좌석들. */
  readonly seats: readonly Seat[];
  /** 발매창구 번호. 좌석 상세 조회에서 함께 옵니다. */
  readonly wctNo: string | undefined;

  constructor(fields: ReservationFields) {
    this.train = fields.train;
    this.rsvId = fields.rsvId;
    this.seatNoCount = fields.seatNoCount;
    this.buyLimitDate = fields.buyLimitDate;
    this.buyLimitTime = fields.buyLimitTime;
    this.price = fields.price;
    this.journeyNo = fields.journeyNo;
    this.journeyCnt = fields.journeyCnt;
    this.rsvChgNo = fields.rsvChgNo;
    // 얕은 freeze 함정: 호출자가 넘긴 배열을 그대로 들고 있으면 나중에 밖에서
    // push 해 내용이 뒤에서 바뀝니다. 복사해서 함께 동결합니다.
    this.seats = Object.freeze([...fields.seats]);
    this.wctNo = fields.wctNo;
    Object.freeze(this);
  }

  static fromResponse(data: unknown, extras: ReservationExtras = {}): Reservation {
    // 예약 응답에는 출발·도착일이 따로 오지 않고 운행일 하나만 옵니다.
    const trainFields = trainFieldsFrom(data);
    const train = new Train({
      ...trainFields,
      depDate: trainFields.runDate,
      arrDate: trainFields.runDate,
    });

    return new Reservation({
      train,
      rsvId: text(data, "h_pnr_no"),
      seatNoCount: integer(data, "h_tot_seat_cnt"),
      buyLimitDate: text(data, "h_ntisu_lmt_dt"),
      buyLimitTime: text(data, "h_ntisu_lmt_tm"),
      price: integer(data, "h_rsv_amt"),
      journeyNo: text(data, "txtJrnySqno", "001"),
      journeyCnt: text(data, "txtJrnyCnt", "01"),
      rsvChgNo: text(data, "hidRsvChgNo", "00000"),
      seats: extras.seats ?? [],
      wctNo: extras.wctNo,
    });
  }

  /** 실좌석이 아니라 예약대기입니다 — 구입기한이 채워지지 않습니다. */
  get isWaiting(): boolean {
    return (
      this.buyLimitDate === WAITING_BUY_LIMIT_DATE || this.buyLimitTime === WAITING_BUY_LIMIT_TIME
    );
  }

  toString(): string {
    const head = `${this.train.toString()}, ${this.price}원(${this.seatNoCount}석)`;
    if (this.isWaiting) {
      return `${head}, 예약대기`;
    }

    const raw = this.buyLimitDate;
    const limitDate =
      raw.length >= 8 && /^\d+$/.test(raw)
        ? `${Number(raw.slice(4, 6))}월 ${Number(raw.slice(6, 8))}일`
        : raw;
    return `${head}, 구입기한 ${limitDate} ${hhmm(this.buyLimitTime)}`;
  }
}
