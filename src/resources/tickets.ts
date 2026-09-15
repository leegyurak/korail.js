/** 승차권 리소스. */

import { API_ENDPOINTS } from "../constants";
import { NoResultsError } from "../errors";
import type { ResponseData } from "../models/parsing";
import { list, text } from "../models/parsing";
import { RefundFee } from "../models/refund";
import { Ticket, trainInfoOf } from "../models/ticket";
import { Resource } from "./base";

/**
 * 좌석 상세 조회에 되돌려 줘야 하는 원권(原券) 식별자. 하나도 없으면 조회할 근거가
 * 없습니다.
 */
const ORIGINAL_TICKET_KEYS: readonly string[] = [
  "h_orgtk_wct_no",
  "h_orgtk_ret_sale_dt",
  "h_orgtk_sale_sqno",
  "h_orgtk_ret_pwd",
];

/** `korail.tickets` — 발권된 승차권 조회·환불. */
export class TicketResource extends Resource {
  /**
   * 발권 완료된 승차권 목록. 없으면 빈 배열.
   *
   * 목록 응답에는 실제 좌석번호가 없어 승차권마다 상세를 한 번 더 조회하고,
   * **좌석까지 확정한 뒤** 승차권 객체를 만듭니다.
   */
  async all(): Promise<Ticket[]> {
    const payload = await this.api.get(API_ENDPOINTS.myticketlist, {
      params: {
        ...this.api.basePayload(),
        txtDeviceId: "",
        txtIndex: "1",
        h_page_no: "1",
        h_abrd_dt_from: "",
        h_abrd_dt_to: "",
        hiduserYn: "Y",
      },
    });

    // "승차권이 없다" 로 해석해도 되는 것은 **목록 응답**의 NoResults 뿐입니다.
    // 아래 상세 조회까지 이 try 로 감싸면 좌석 조회 한 건이 실패했을 때 이미
    // 읽어 둔 승차권까지 통째로 사라져, 사용자에게는 "승차권 없음" 으로 보입니다.
    try {
      this.api.check(payload);
    } catch (error) {
      if (error instanceof NoResultsError) {
        return [];
      }
      throw error;
    }

    // 좌석 상세 조회에 원본 객체가 필요해서 Ticket.fromTicketList() 가 아니라
    // 언래핑 헬퍼를 직접 씁니다 — 둘 다 같은 trainInfoOf() 위에 서 있습니다.
    const raws = list(payload, "reservation_list")
      .map((entry) => trainInfoOf(entry))
      .filter((raw): raw is ResponseData => raw !== undefined);

    const tickets: Ticket[] = [];
    for (const raw of raws) {
      tickets.push(Ticket.fromResponse(raw, await this.#seatNo(raw)));
    }
    return tickets;
  }

  /**
   * 승차권 상세 조회로 실제 좌석번호를 확인합니다. 없으면 `undefined`.
   *
   * 상세 조회는 목록 응답을 **보강할 뿐**이라, 결과가 없어도 승차권 자체는
   * 유효합니다. 그래서 NoResults 는 밖으로 내보내지 않고 `undefined` 로 접어
   * 목록 응답의 좌석번호로 되돌아갑니다 — 승차권 한 장의 상세가 비었다고 목록
   * 전체가 비어 보이면 안 됩니다. 그 밖의 실패(만료된 세션 등)는 진짜 문제이므로
   * 그대로 올립니다.
   *
   * 원권 식별자가 하나도 없으면 요청 자체를 보내지 않습니다 — 네 값이 전부
   * 비어 있는 조회는 서버가 돌려줄 것이 없는데 요청만 축냅니다.
   */
  async #seatNo(raw: ResponseData): Promise<string | undefined> {
    const hasIdentifier = ORIGINAL_TICKET_KEYS.some((key) => {
      const value = raw[key];
      return value !== undefined && value !== null && value !== "";
    });
    if (!hasIdentifier) {
      return undefined;
    }

    const payload = await this.api.get(API_ENDPOINTS.myticketseat, {
      params: {
        ...this.api.basePayload(),
        // 넷 중 일부만 온 경우 나머지는 빈 문자열로 나갑니다 — pykorail 은 여기서
        // 리터럴 `None` 을 보냅니다. 의도된 차이입니다 (AGENTS.md §3).
        h_orgtk_wct_no: text(raw, "h_orgtk_wct_no"),
        h_orgtk_ret_sale_dt: text(raw, "h_orgtk_ret_sale_dt"),
        h_orgtk_sale_sqno: text(raw, "h_orgtk_sale_sqno"),
        h_orgtk_ret_pwd: text(raw, "h_orgtk_ret_pwd"),
      },
    });
    try {
      this.api.check(payload);
    } catch (error) {
      if (error instanceof NoResultsError) {
        return undefined;
      }
      throw error;
    }

    const [ticketInfo] = list(payload.ticket_infos, "ticket_info");
    const [seat] = list(ticketInfo, "tk_seat_info");
    const seatNo = (seat as ResponseData | undefined)?.h_seat_no;
    return typeof seatNo === "string" ? seatNo : undefined;
  }

  /**
   * 환불하면 수수료가 얼마인지 **조회만** 합니다. 환불하지 않습니다.
   *
   * 폼 필드 이름이 {@link refund} 와 다릅니다. 같은 `refunds` 패키지인데도
   * 판매일자는 `h_orgtk_ret_sale_dt`(`refund` 는 `h_orgtk_sale_dt`),
   * 창구번호는 `h_orgtk_wct_no`(`refund` 는 `h_orgtk_sale_wct_no`) 입니다.
   * **네 철자가 APK 안에 전부 실재하므로 헷갈리면 조용한 빈 값이 됩니다** —
   * 통일하지 마세요.
   *
   * `h_comp_*`(동반자)와 `ctlDvCd`·`lang` 은 앱이 기본값으로 빈 문자열을
   * 보냅니다. 빼지 말고 빈 값으로 실으세요.
   *
   * 코레일톡+ 7.0.1 의 `RefundCommissionIn` 에서 확인했습니다.
   *
   * @throws {KorailApiError} 조회가 거부됐습니다.
   */
  async refundFee(ticket: Ticket): Promise<RefundFee> {
    const payload = await this.api.post(API_ENDPOINTS.refundCommission, {
      data: {
        ...this.api.basePayload(),
        h_orgtk_ret_sale_dt: ticket.saleInfo2,
        h_orgtk_wct_no: ticket.saleInfo1,
        h_orgtk_sale_sqno: ticket.saleInfo3,
        h_orgtk_ret_pwd: ticket.saleInfo4,
        h_comp_nm: "",
        h_comp_cert_no: "",
        ctlDvCd: "",
        lang: "",
      },
    });
    this.api.check(payload);
    return RefundFee.fromResponse(payload);
  }

  /**
   * 발권된 승차권을 환불합니다.
   *
   * @throws {KorailApiError} 환불이 거부됐습니다.
   */
  async refund(ticket: Ticket): Promise<void> {
    const payload = await this.api.post(API_ENDPOINTS.refund, {
      data: {
        ...this.api.basePayload(),
        txtPrnNo: ticket.pnrNo,
        h_orgtk_sale_dt: ticket.saleInfo2,
        h_orgtk_sale_wct_no: ticket.saleInfo1,
        h_orgtk_sale_sqno: ticket.saleInfo3,
        h_orgtk_ret_pwd: ticket.saleInfo4,
        h_mlg_stl: "N",
        tk_ret_tms_dv_cd: "21",
        trnNo: ticket.train.trainNo,
        pbpAcepTgtFlg: "N",
        latitude: "",
        longitude: "",
      },
    });
    this.api.check(payload);
  }
}
