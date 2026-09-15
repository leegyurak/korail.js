/**
 * NetFunnel 대기열 게이트 (`nf.letskorail.com`).
 *
 * 접속 폭주 때 코레일 앞단에 서는 대기열입니다. 통과 티켓(key)을 받아 두면
 * 잠깐 재사용할 수 있어 캐시합니다.
 *
 * **클라이언트는 이 모듈을 쓰지 않습니다 — 의도된 것입니다.** 대기열은 코레일 웹
 * 프런트가 통과하는 관문이고, 이 패키지가 쓰는 스마트 앱 엔드포인트
 * (`smart.letskorail.com`)는 대기열 뒤에 있지 않습니다. 명절 예매처럼 앱 경로에도
 * 대기열이 붙는 상황을 만나면 직접 꺼내 쓸 수 있도록 공개 유틸리티로 남겨 둡니다.
 *
 * ```ts
 * import { NetFunnelHelper } from "korail.js";
 *
 * const key = await new NetFunnelHelper().run(); // 통과할 때까지 대기
 * ```
 *
 * {@link Korail} 에 자동으로 엮지 않은 이유는, 필요 없는 상황에서 매 요청마다
 * 외부 게이트를 때리는 비용과 실패 지점이 생기기 때문입니다.
 */

import { NetFunnelError } from "../errors";
import type { HttpSession, SessionFactory } from "../transport";
import { createSession } from "../transport";

export const NETFUNNEL_URL = "http://nf.letskorail.com/ts.wseq";

export const NETFUNNEL_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  Host: "nf.letskorail.com",
  Connection: "Keep-Alive",
  "User-Agent": "Apache-HttpClient/UNAVAILABLE (java 1.4)",
});

const WAIT_STATUS_PASS = "200";
const WAIT_STATUS_FAIL = "201";
const ALREADY_COMPLETED = "502";

const OP_CODE: Readonly<Record<string, string>> = Object.freeze({
  getTidchkEnter: "5101",
  chkEnter: "5002",
  setComplete: "5004",
});

/** 티켓 재사용 시간(밀리초). 서버 만료보다 짧게 잡아 아슬아슬한 재사용을 피합니다. */
export const CACHE_TTL_MS = 50_000;

/** 대기 중일 때 다시 물어보기까지의 간격(밀리초). */
const POLL_INTERVAL_MS = 1_000;

/** {@link NetFunnelHelper} 생성 옵션. */
export interface NetFunnelOptions {
  /** 전송 구현. 테스트에서 가짜 세션을 끼울 때 씁니다. */
  readonly sessionFactory?: SessionFactory | undefined;
  /** 대기 중 재시도 간격(밀리초). */
  readonly pollIntervalMs?: number | undefined;
}

interface NetFunnelReply {
  readonly status: string | undefined;
  readonly key: string | undefined;
  readonly nwait: string | undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 대기열을 통과해 티켓(key)을 얻습니다.
 *
 * {@link run} 이 유일한 진입점입니다. 대기 줄이 있으면 통과할 때까지 폴링하므로
 * **오래 걸릴 수 있습니다**.
 */
export class NetFunnelHelper {
  readonly #session: HttpSession;
  readonly #pollIntervalMs: number;
  #cachedKey: string | undefined;
  #lastFetchTime = 0;

  constructor(options: NetFunnelOptions = {}) {
    this.#session = (options.sessionFactory ?? createSession)(NETFUNNEL_HEADERS);
    this.#pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  }

  /**
   * 통과 티켓을 돌려줍니다. 캐시가 살아 있으면 재사용합니다.
   *
   * @throws {NetFunnelError} 대기열 통과에 실패했습니다. 캐시는 비워집니다.
   */
  async run(): Promise<string | undefined> {
    const now = Date.now();
    if (this.#isCacheValid(now)) {
      return this.#cachedKey;
    }

    try {
      let reply = await this.#request("getTidchkEnter");
      this.#cachedKey = reply.key;
      this.#lastFetchTime = now;

      while (reply.status === WAIT_STATUS_FAIL) {
        await sleep(this.#pollIntervalMs);
        reply = await this.#request("chkEnter");
        this.#cachedKey = reply.key;
      }

      const completed = await this.#request("setComplete");
      if (completed.status === WAIT_STATUS_PASS || completed.status === ALREADY_COMPLETED) {
        return this.#cachedKey;
      }

      this.clear();
      throw new NetFunnelError("Failed to complete NetFunnel");
    } catch (error) {
      this.clear();
      throw error instanceof NetFunnelError ? error : new NetFunnelError(String(error));
    }
  }

  /** 캐시된 티켓을 버립니다. */
  clear(): void {
    this.#cachedKey = undefined;
    this.#lastFetchTime = 0;
  }

  /** HTTP 연결을 정리합니다. */
  async close(): Promise<void> {
    await this.#session.close();
  }

  // ------------------------------------------------------------------- 내부
  async #request(operation: keyof typeof OP_CODE): Promise<NetFunnelReply> {
    const opcode = OP_CODE[operation] ?? "";
    const response = await this.#session.get(NETFUNNEL_URL, {
      params: this.#buildParams(opcode),
    });
    return NetFunnelHelper.parse(response.text);
  }

  #buildParams(opcode: string): Record<string, string> {
    if (opcode === OP_CODE.getTidchkEnter) {
      return { opcode, sid: "service_1", aid: "act_8" };
    }
    if (opcode === OP_CODE.chkEnter) {
      return { opcode, sid: "service_1", aid: "act_8", key: this.#cachedKey ?? "", ttl: "1" };
    }
    if (opcode === OP_CODE.setComplete) {
      return { opcode, key: this.#cachedKey ?? "" };
    }
    return { opcode };
  }

  /** `200:key=abc&nwait=0` 형태의 응답을 풉니다. */
  static parse(response: string): NetFunnelReply {
    const separator = response.indexOf(":");
    const paramsString = separator === -1 ? "" : response.slice(separator + 1);
    if (paramsString === "") {
      throw new NetFunnelError("Failed to parse NetFunnel response");
    }

    const parsed = new Map<string, string>(
      paramsString
        .split("&")
        .filter((param) => param.includes("="))
        .map((param) => {
          const index = param.indexOf("=");
          return [param.slice(0, index), param.slice(index + 1)] as [string, string];
        }),
    );

    return {
      status: response.slice(0, separator),
      key: parsed.get("key"),
      nwait: parsed.get("nwait"),
    };
  }

  #isCacheValid(now: number): boolean {
    return (
      this.#cachedKey !== undefined &&
      this.#cachedKey !== "" &&
      now - this.#lastFetchTime < CACHE_TTL_MS
    );
  }
}
