/** 좌석 한 자리. */

import { integer, text } from "./parsing";

/** {@link Seat} 생성자 인자. */
export interface SeatFields {
  readonly car: string;
  readonly seat: string;
  readonly seatType: string;
  readonly passengerType: string;
  readonly price: number;
  readonly originalPrice: number;
  readonly discount: number;
}

/**
 * 예약·승차권에 딸린 좌석 하나.
 *
 * 좌석번호가 비어 있으면 실좌석이 아니라 예약대기 자리입니다.
 */
export class Seat implements SeatFields {
  readonly car: string;
  readonly seat: string;
  readonly seatType: string;
  readonly passengerType: string;
  readonly price: number;
  readonly originalPrice: number;
  readonly discount: number;

  constructor(fields: SeatFields) {
    this.car = fields.car;
    this.seat = fields.seat;
    this.seatType = fields.seatType;
    this.passengerType = fields.passengerType;
    this.price = fields.price;
    this.originalPrice = fields.originalPrice;
    this.discount = fields.discount;
    Object.freeze(this);
  }

  static fromResponse(data: unknown): Seat {
    return new Seat({
      car: text(data, "h_srcar_no"),
      seat: text(data, "h_seat_no"),
      seatType: text(data, "h_psrm_cl_nm"),
      passengerType: text(data, "h_psg_tp_dv_nm"),
      price: integer(data, "h_rcvd_amt"),
      originalPrice: integer(data, "h_seat_prc"),
      discount: integer(data, "h_dcnt_amt"),
    });
  }

  get isWaiting(): boolean {
    return this.seat === "";
  }

  toString(): string {
    const price = `[${this.price}원(${this.discount}원 할인)]`;
    if (this.isWaiting) {
      return `예약대기 (${this.seatType}) ${this.passengerType}${price}`;
    }
    return `${this.car}호차 ${this.seat} (${this.seatType}) ${this.passengerType} ${price}`;
  }
}
