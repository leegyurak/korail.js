/**
 * 요청/응답 계층 — 리소스들이 공유하는 저수준 클라이언트.
 *
 * {@link Korail} 과 각 리소스가 이 객체 하나를 나눠 씁니다. HTTP 왕복·서명·에러
 * 변환처럼 "어느 리소스에서나 똑같은 일"만 담고, 엔드포인트별 폼 필드는 리소스
 * 쪽에 둡니다.
 */

import type { RequestSigner, Signature } from "./auth/signer";
import { API_KEY, APP_VERSION, DEVICE } from "./constants";
import { errorForCode, TransportError } from "./errors";
import type { ResponseData } from "./models/parsing";
import { isResponseData } from "./models/parsing";
import type { FormValues, HttpResponse, HttpSession } from "./transport";

/**
 * 로그인 세션 상태.
 *
 * 여러 리소스가 읽고(`mbCrdNo`) 로그인만 쓰기 때문에, 클라이언트와 리소스가
 * 같은 인스턴스를 공유합니다.
 */
export class Account {
  logined = false;
  membershipNumber: string | undefined = undefined;
  name: string | undefined = undefined;
  email: string | undefined = undefined;
  phoneNumber: string | undefined = undefined;

  clear(): void {
    this.logined = false;
    this.membershipNumber = undefined;
    this.name = undefined;
    this.email = undefined;
    this.phoneNumber = undefined;
  }
}

/** {@link ApiClient} 요청 옵션. */
export interface ApiRequestOptions {
  readonly params?: FormValues | undefined;
  readonly data?: FormValues | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

/** 서명·전송·응답 해석을 담당합니다. */
export class ApiClient {
  readonly #session: HttpSession;
  readonly #signer: RequestSigner;

  /** 응답 본문을 `console.debug` 로 흘립니다. 자격증명이 찍힐 수 있으니 개발용입니다. */
  verbose: boolean;

  readonly account = new Account();

  constructor(session: HttpSession, signer: RequestSigner, verbose = false) {
    this.#session = session;
    this.#signer = signer;
    this.verbose = verbose;
  }

  // ------------------------------------------------------------------- 전송
  /** `url` 에 필요한 헤더와 `Sid`. 서명 대상이 아니면 빈 헤더와 `undefined`. */
  sign(url: string): Signature {
    return this.#signer.sign(url);
  }

  async get(url: string, options: ApiRequestOptions = {}): Promise<ResponseData> {
    return this.#parse(await this.#session.get(url, options));
  }

  async post(url: string, options: ApiRequestOptions = {}): Promise<ResponseData> {
    return this.#parse(await this.#session.post(url, options));
  }

  async close(): Promise<void> {
    await this.#session.close();
  }

  // ------------------------------------------------------------------- 해석
  /** 거의 모든 요청에 실리는 앱 신원 필드. */
  basePayload(): Record<string, string> {
    return { Device: DEVICE, Version: APP_VERSION, Key: API_KEY };
  }

  /** `strResult=FAIL` 이면 코드에 맞는 에러를 던집니다. */
  check(payload: ResponseData): void {
    if (payload.strResult === "FAIL") {
      const code = payload.h_msg_cd;
      const message = payload.h_msg_txt;
      throw errorForCode(
        typeof code === "string" ? code : undefined,
        typeof message === "string" ? message : undefined,
      );
    }
  }

  #parse(response: HttpResponse): ResponseData {
    if (this.verbose) {
      console.debug(response.text);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(response.text);
    } catch (cause) {
      throw new TransportError(
        `코레일 응답을 JSON 으로 읽지 못했습니다: ${JSON.stringify(response.text.slice(0, 200))} (${String(cause)})`,
      );
    }

    // `JSON.parse` 는 `any` 를 돌려줍니다 — 여기서 한 번 좁히지 않으면 타입
    // 안전성이 코드베이스 전체로 새어 나갑니다.
    if (!isResponseData(parsed)) {
      throw new TransportError(`코레일 응답이 객체가 아닙니다: ${typeof parsed}`);
    }
    return parsed;
  }
}
