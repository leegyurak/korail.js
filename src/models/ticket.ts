/** 발권 완료된 승차권. */

import { integer, isResponseData, text } from "./parsing";
import { Train } from "./schedule";

/**
 * `MyTicketList` 응답의 `reservation_list` 항목 안에서 `train_info` 까지 가는 경로.
 * 각 단계가 배열이고 첫 항목만 씁니다 — 앱도 그렇게 읽습니다.
 */
export const TRAIN_INFO_PATH: readonly string[] = Object.freeze(["ticket_list", "train_info"]);

/**
 * `reservation_list` 항목 하나에서 `train_info` 객체를 꺼냅니다. 못 찾으면 `undefined`.
 *
 * 중간 단계가 빠지거나 빈 배열로 오면 `undefined` 를 돌려줍니다. 날 인덱싱
 * (`entry.ticket_list[0].train_info[0]`)은 응답이 조금만 달라져도 터지는데,
 * 코레일은 필드를 빼먹고 보내는 서버라 승차권 한 항목 때문에 목록 전체가
 * 터지면 안 됩니다.
 *
 * **빈 객체도 읽을 수 없는 항목으로 봅니다.** 구조만 있고 내용이 없으면
 * 승차권번호도 좌석도 금액도 없는 유령 승차권이 만들어져 목록에 섞입니다 —
 * 관용적으로 읽는 것과 없는 것을 지어내는 것은 다릅니다.
 */
export function trainInfoOf(entry: unknown): Record<string, unknown> | undefined {
  let node: unknown = entry;
  for (const key of TRAIN_INFO_PATH) {
    const branch = isResponseData(node) ? node[key] : undefined;
    if (!Array.isArray(branch) || branch.length === 0) {
      return undefined;
    }
    node = branch[0];
  }
  return isResponseData(node) && Object.keys(node).length > 0
    ? (node as Record<string, unknown>)
    : undefined;
}

/** {@link Ticket} 생성자 인자. */
export interface TicketFields {
  readonly train: Train;
  readonly seatNo: string;
  readonly seatNoEnd: string | undefined;
  readonly seatNoCount: number;
  readonly carNo: string;
  readonly buyerName: string;
  readonly saleDate: string;
  readonly pnrNo: string;
  readonly price: number;
  readonly saleInfo1: string;
  readonly saleInfo2: string;
  readonly saleInfo3: string;
  readonly saleInfo4: string;
}

/**
 * 결제까지 끝난 승차권.
 *
 * 승차권은 열차가 *아니라* 열차를 **참조**합니다 — `ticket.train.depName` 처럼
 * 쓰세요. 상속으로 묶으면 `ticket.hasSeat()` 같은 의미 없는 연산이 딸려 옵니다
 * (이미 발권됐으니 좌석 가용 여부를 물을 일이 없습니다).
 */
export class Ticket implements TicketFields {
  readonly train: Train;
  readonly seatNo: string;
  readonly seatNoEnd: string | undefined;
  readonly seatNoCount: number;
  readonly carNo: string;
  readonly buyerName: string;
  readonly saleDate: string;
  readonly pnrNo: string;
  readonly price: number;

  /** 환불 요청에 그대로 되돌려 줘야 하는 원권(原券) 식별자 4종. */
  readonly saleInfo1: string;
  readonly saleInfo2: string;
  readonly saleInfo3: string;
  readonly saleInfo4: string;

  constructor(fields: TicketFields) {
    this.train = fields.train;
    this.seatNo = fields.seatNo;
    this.seatNoEnd = fields.seatNoEnd;
    this.seatNoCount = fields.seatNoCount;
    this.carNo = fields.carNo;
    this.buyerName = fields.buyerName;
    this.saleDate = fields.saleDate;
    this.pnrNo = fields.pnrNo;
    this.price = fields.price;
    this.saleInfo1 = fields.saleInfo1;
    this.saleInfo2 = fields.saleInfo2;
    this.saleInfo3 = fields.saleInfo3;
    this.saleInfo4 = fields.saleInfo4;
    Object.freeze(this);
  }

  /**
   * `train_info` 항목 하나로 승차권을 만듭니다.
   *
   * @param data 승차권 상세가 담긴 `train_info` 항목.
   * @param seatNo 좌석 상세 조회로 확인한 실제 좌석번호. 넘기면 목록 응답의
   *   값을 덮고 `seatNoEnd` 는 비웁니다(단일 좌석으로 확정되므로).
   */
  static fromResponse(data: unknown, seatNo?: string | undefined): Ticket {
    const resolved = seatNo === undefined ? text(data, "h_seat_no") : seatNo;
    return new Ticket({
      train: Train.fromResponse(data),
      seatNo: resolved,
      seatNoEnd: seatNo === undefined ? text(data, "h_seat_no_end") : undefined,
      seatNoCount: integer(data, "h_seat_cnt"),
      carNo: text(data, "h_srcar_no"),
      buyerName: text(data, "h_buy_ps_nm"),
      saleDate: text(data, "h_orgtk_sale_dt"),
      pnrNo: text(data, "h_pnr_no"),
      price: integer(data, "h_rcvd_amt"),
      saleInfo1: text(data, "h_orgtk_wct_no"),
      saleInfo2: text(data, "h_orgtk_ret_sale_dt"),
      saleInfo3: text(data, "h_orgtk_sale_sqno"),
      saleInfo4: text(data, "h_orgtk_ret_pwd"),
    });
  }

  /**
   * `MyTicketList` 응답의 `reservation_list` 항목 하나를 풀어 승차권을 만듭니다.
   *
   * 항목에서 `train_info` 를 찾지 못하면 `undefined` 입니다 — 읽을 것이 없는
   * 항목은 예외가 아니라 건너뛸 대상입니다.
   */
  static fromTicketList(entry: unknown, seatNo?: string | undefined): Ticket | undefined {
    const raw = trainInfoOf(entry);
    return raw === undefined ? undefined : Ticket.fromResponse(raw, seatNo);
  }

  /** 원권 식별자 4종을 하이픈으로 이은 승차권 번호. */
  get ticketNo(): string {
    return [this.saleInfo1, this.saleInfo2, this.saleInfo3, this.saleInfo4].join("-");
  }

  toString(): string {
    const seats =
      this.seatNoCount === 1 || this.seatNoEnd === undefined
        ? this.seatNo
        : `${this.seatNo}~${this.seatNoEnd}`;
    return `${this.train.summary()} => ${this.carNo}호 ${seats}, ${this.price}원`;
  }
}
