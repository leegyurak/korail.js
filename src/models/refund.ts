/** 환불 사전조회 모델. */

import { integer, text } from "./parsing";

/** {@link RefundFee} 생성자 인자. */
export interface RefundFeeFields {
  readonly fee: number;
  readonly amount: number;
  readonly usableMileage: number;
  readonly refundable: boolean;
  readonly periodCode: string;
}

/**
 * 환불하면 얼마를 떼고 얼마를 돌려받는지.
 *
 * `korail.tickets.refundFee()` 가 돌려줍니다. **조회일 뿐 환불하지 않습니다** —
 * 실제 환불은 `refund()` 입니다.
 *
 * 수수료는 출발 시각까지 남은 시간에 따라 달라지므로, 조회한 값과 실제 환불
 * 시점의 값이 다를 수 있습니다. {@link periodCode} 가 어느 구간으로 계산된
 * 것인지 알려줍니다.
 */
export class RefundFee implements RefundFeeFields {
  /** 환불 수수료(원). */
  readonly fee: number;
  /** 실제로 돌려받는 금액(원). 결제액에서 {@link fee} 를 뺀 값. */
  readonly amount: number;
  /** 이 환불에 쓸 수 있는 마일리지. */
  readonly usableMileage: number;
  /** 환불이 가능한 상태인지. `false` 면 {@link amount} 는 의미가 없습니다. */
  readonly refundable: boolean;
  /**
   * 수수료를 계산한 반환 시기 구분 코드 (`tk_ret_tms_dv_cd`).
   *
   * 코드값의 의미는 앱이 화면에서만 쓰고 응답으로 설명하지 않아 그대로 둡니다.
   */
  readonly periodCode: string;

  constructor(fields: RefundFeeFields) {
    this.fee = fields.fee;
    this.amount = fields.amount;
    this.usableMileage = fields.usableMileage;
    this.refundable = fields.refundable;
    this.periodCode = fields.periodCode;
    Object.freeze(this);
  }

  /** `CommissionView` 응답 하나로 만듭니다. */
  static fromResponse(data: unknown): RefundFee {
    return new RefundFee({
      fee: integer(data, "ret_fee"),
      amount: integer(data, "ret_amt"),
      usableMileage: integer(data, "use_psb_mlg_num"),
      // 앱은 "Y" 를 가능으로 봅니다. 빈 값이면 판단할 근거가 없으므로 불가로
      // 처리합니다 — 여기서 낙관하면 사용자가 환불되는 줄 알고 넘어갑니다.
      refundable: text(data, "prg_psb_flg") === "Y",
      periodCode: text(data, "tk_ret_tms_dv_cd"),
    });
  }

  toString(): string {
    if (!this.refundable) {
      return "환불 불가";
    }
    const won = (value: number): string => value.toLocaleString("en-US");
    return `${won(this.amount)}원 환불 (수수료 ${won(this.fee)}원)`;
  }
}
