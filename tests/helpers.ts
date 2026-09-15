/** 가짜 HTTP 세션 — 네트워크 없이 리소스를 돌립니다. */

import type { KorailOptions } from "../src/client";
import { Korail } from "../src/client";
import type { EndpointName } from "../src/constants";
import { API_ENDPOINTS } from "../src/constants";
import type { HttpResponse, HttpSession, RequestOptions } from "../src/transport";
import {
  OK,
  REFUND_FEE_PAYLOAD,
  RESERVATION_LIST_PAYLOAD,
  SEARCH_PAYLOAD,
  SEAT_DETAIL_PAYLOAD,
  STATION_PAYLOAD,
  TICKET_LIST_PAYLOAD,
  TICKET_SEAT_PAYLOAD,
} from "./payloads";

/** 한 번의 요청 기록. */
export interface RecordedCall {
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly options: RequestOptions;
}

export type Routes = Partial<Record<EndpointName, unknown>>;

/** 호출을 기록하고 엔드포인트별로 미리 정해 둔 응답을 돌려줍니다. */
export class FakeSession implements HttpSession {
  readonly headers: Record<string, string>;
  readonly routes: Routes;
  readonly calls: RecordedCall[] = [];
  closed = false;

  /** 요청 시점에 세션이 몇 개 만들어져 있었는지 — 재사용을 확인하는 데 씁니다. */
  static created = 0;

  constructor(routes: Routes, headers: Record<string, string> = {}) {
    this.routes = routes;
    this.headers = headers;
    FakeSession.created += 1;
  }

  #respond(method: "GET" | "POST", url: string, options: RequestOptions): HttpResponse {
    this.calls.push({ method, url, options });
    const matched = Object.entries(this.routes).find(
      ([endpoint]) => API_ENDPOINTS[endpoint as EndpointName] === url,
    );
    if (matched === undefined) {
      throw new Error(`예상하지 못한 요청: ${url}`);
    }
    return { text: JSON.stringify(matched[1]) };
  }

  async get(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    return this.#respond("GET", url, options);
  }

  async post(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    return this.#respond("POST", url, options);
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  // ------------------------------------------------------------------ 헬퍼
  urls(): string[] {
    return this.calls.map((call) => call.url);
  }

  /** 해당 엔드포인트로 나간 **마지막** 요청. */
  callFor(endpoint: EndpointName): RecordedCall {
    const url = API_ENDPOINTS[endpoint];
    const found = [...this.calls].reverse().find((call) => call.url === url);
    if (found === undefined) {
      throw new Error(`${endpoint} 으로 나간 요청이 없습니다`);
    }
    return found;
  }

  /**
   * 해당 엔드포인트로 나간 **모든** 요청을 보낸 순서대로.
   *
   * 호출 횟수만 세면 같은 대상을 N번 조회해도 통과합니다 — 무엇을 조회했는지
   * 확인하려면 요청 하나하나가 필요합니다.
   */
  allCallsFor(endpoint: EndpointName): RecordedCall[] {
    const url = API_ENDPOINTS[endpoint];
    return this.calls.filter((call) => call.url === url);
  }

  /** 해당 엔드포인트로 나간 마지막 요청의 폼 필드(GET 은 쿼리, POST 는 바디). */
  formFor(endpoint: EndpointName): Record<string, unknown> {
    const { options } = this.callFor(endpoint);
    return { ...(options.params ?? options.data ?? {}) };
  }
}

/** 지정한 라우트를 갖는 클라이언트와 그 가짜 세션을 만듭니다. */
export function makeKorail(
  routes: Routes,
  options: Omit<KorailOptions, "sessionFactory"> = {},
): { client: Korail; session: FakeSession } {
  let session: FakeSession | undefined;
  const client = new Korail({
    ...options,
    sessionFactory: (headers) => {
      session = new FakeSession(routes, { ...headers });
      return session;
    },
  });
  if (session === undefined) {
    throw new Error("세션이 만들어지지 않았습니다");
  }
  return { client, session };
}

/** 대부분의 엔드포인트가 성공 응답을 주는 기본 클라이언트. */
export function korail(options: Omit<KorailOptions, "sessionFactory"> = {}): {
  client: Korail;
  session: FakeSession;
} {
  return makeKorail(
    {
      stationdata: STATION_PAYLOAD,
      searchSchedule: SEARCH_PAYLOAD,
      myreservationview: RESERVATION_LIST_PAYLOAD,
      myreservationlist: SEAT_DETAIL_PAYLOAD,
      myticketlist: TICKET_LIST_PAYLOAD,
      myticketseat: TICKET_SEAT_PAYLOAD,
      reserve: { ...OK, h_pnr_no: "1234567890" },
      cancel: OK,
      pay: OK,
      refund: OK,
      refundCommission: REFUND_FEE_PAYLOAD,
      logout: OK,
    },
    options,
  );
}
