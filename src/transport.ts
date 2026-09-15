/**
 * HTTP 전송 — 세션 생성과 폼 인코딩.
 *
 * 코레일 서버는 TLS 지문을 봅니다. 기본 전송은 `node-tls-client` 이고, 그것을
 * 쓸 수 없는 환경에서는 로그인이 거부될 수 있습니다.
 *
 * > **미검증 위험.** node-tls-client 의 `chrome_131` 지문이 실서버에서 통과하는지는
 * > 아직 실측되지 않았습니다 (AGENTS.md §3). 전송 구현을 통째로 갈아끼울 수 있도록
 * > {@link HttpSession} 인터페이스 뒤에 두었습니다 — 실측 결과가 나쁘면 이 파일만
 * > 바꾸면 됩니다.
 */

import { IMPERSONATE } from "./constants";

/** 폼·쿼리스트링에 실을 수 있는 값. */
export type FormValue = string | number | boolean | null | undefined;

/** 폼·쿼리스트링 한 벌. */
export type FormValues = Readonly<Record<string, FormValue>>;

/** 전송 계층이 돌려주는 최소 응답 표면. */
export interface HttpResponse {
  readonly text: string;
}

/** 요청 하나에 붙일 수 있는 것들. */
export interface RequestOptions {
  readonly params?: FormValues | undefined;
  readonly data?: FormValues | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

/**
 * 전송 구현이 만족해야 하는 표면.
 *
 * 리소스는 이 인터페이스를 **직접 보지 않습니다** — `ApiClient` 만 씁니다.
 * 테스트는 이 인터페이스를 구현한 가짜 세션을 주입해 네트워크 없이 돕니다.
 */
export interface HttpSession {
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
  post(url: string, options?: RequestOptions): Promise<HttpResponse>;
  close(): Promise<void>;
}

/** {@link HttpSession} 을 만드는 함수. 전송을 갈아끼우는 지점입니다. */
export type SessionFactory = (headers: Readonly<Record<string, string>>) => HttpSession;

/**
 * 파이썬 `urllib.parse.quote_plus` 와 **같은** 이스케이프.
 *
 * `encodeURIComponent` 는 `!'()*` 를 그대로 두고 공백을 `%20` 으로 만드는데,
 * 파이썬은 앞의 다섯 글자를 퍼센트 인코딩하고 공백을 `+` 로 만듭니다. 지금 나가는
 * 값(한글·숫자·base64)에는 걸리지 않지만, 새 필드의 값에 무엇이 들어갈지는 알 수
 * 없으므로 경계를 여기서 고정합니다.
 */
function quotePlus(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replaceAll("%20", "+");
}

/**
 * 폼 값 하나를 문자열로.
 *
 * `undefined` 는 폼에서 사라지고 `null` 은 `"null"` 이 되는 것이 JS 기본값인데,
 * 둘 다 서버에 그대로 나가면 안 됩니다 — 앱이 그러듯 **빈 문자열**로 보냅니다.
 */
function formValue(value: FormValue): string {
  return value === null || value === undefined ? "" : String(value);
}

/** `application/x-www-form-urlencoded` 한 벌을 만듭니다. 키 순서는 입력 순서입니다. */
export function encodeForm(values: FormValues): string {
  return Object.entries(values)
    .map(([key, value]) => `${quotePlus(key)}=${quotePlus(formValue(value))}`)
    .join("&");
}

/** 쿼리스트링을 붙인 URL. 값이 없으면 URL 을 그대로 돌려줍니다. */
export function withQuery(url: string, params?: FormValues | undefined): string {
  if (params === undefined || Object.keys(params).length === 0) {
    return url;
  }
  return `${url}?${encodeForm(params)}`;
}

/** node-tls-client 의 `Session` 중 이 패키지가 쓰는 부분. */
interface TlsSession {
  get(url: string, options: Record<string, unknown>): Promise<{ body: string }>;
  post(url: string, options: Record<string, unknown>): Promise<{ body: string }>;
  close(): Promise<unknown>;
}

interface TlsModule {
  Session: new (config: Record<string, unknown>) => TlsSession;
  /** 네이티브 워커 풀을 띄웁니다. 첫 요청 전에 반드시 한 번 불러야 합니다. */
  initTLS: () => Promise<void>;
  /** 워커 풀을 내립니다. 부르지 않으면 프로세스가 끝나지 않습니다. */
  destroyTLS: () => Promise<void>;
}

/**
 * 내장 `fetch` 폴백.
 *
 * node-tls-client 를 불러오지 못했을 때만 씁니다. **TLS 지문이 앱과 다르므로
 * 로그인이 거부될 수 있습니다** — 공개 조회(역 마스터)까지만 기대하세요.
 * pykorail 의 `requests` 폴백과 같은 자리입니다.
 *
 * `fetch` 는 쿠키를 자동으로 보관하지 않으므로 `Set-Cookie` 를 직접 모아 다시
 * 실어 보냅니다. 세션 쿠키가 후속 요청에 실리지 않으면 서버는 `P058` 을 주고,
 * 그건 "로그인이 안 된다" 로 오인됩니다.
 */
class FetchSession implements HttpSession {
  readonly #headers: Readonly<Record<string, string>>;
  readonly #cookies = new Map<string, string>();

  constructor(headers: Readonly<Record<string, string>>) {
    this.#headers = Object.freeze({ ...headers });
  }

  #requestHeaders(headers?: Readonly<Record<string, string>> | undefined): Record<string, string> {
    const merged: Record<string, string> = { ...this.#headers, ...headers };
    if (this.#cookies.size > 0) {
      merged.Cookie = [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; ");
    }
    // 호스트 헤더는 fetch 가 직접 채웁니다 — 넘기면 런타임이 거부합니다.
    delete merged.Host;
    return merged;
  }

  #storeCookies(response: Response): void {
    response.headers.getSetCookie().forEach((raw) => {
      const pair = raw.split(";")[0] ?? "";
      const index = pair.indexOf("=");
      if (index > 0) {
        this.#cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
    });
  }

  async #send(url: string, init: RequestInit): Promise<HttpResponse> {
    const response = await fetch(url, init);
    this.#storeCookies(response);
    return { text: await response.text() };
  }

  async get(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    return this.#send(withQuery(url, options.params), {
      method: "GET",
      headers: this.#requestHeaders(options.headers),
    });
  }

  async post(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    return this.#send(withQuery(url, options.params), {
      method: "POST",
      headers: this.#requestHeaders(options.headers),
      ...(options.data === undefined ? {} : { body: encodeForm(options.data) }),
    });
  }

  async close(): Promise<void> {
    this.#cookies.clear();
  }
}

/**
 * node-tls-client 응답을 {@link HttpResponse} 로 맞춰 주는 어댑터.
 *
 * 라이브러리는 요청별 헤더를 **덮어쓰기만** 하므로 세션 기본 헤더를 여기서 직접
 * 얹습니다. 세션 하나가 쿠키 저장소(tough-cookie) 하나를 들고 요청마다 병합·동기화
 * 하므로, 로그인 세션 쿠키가 후속 요청에 그대로 실립니다.
 */
class TlsClientAdapter implements HttpSession {
  readonly #headers: Readonly<Record<string, string>>;
  readonly #session: TlsSession;
  readonly #destroy: () => Promise<void>;

  constructor(
    session: TlsSession,
    headers: Readonly<Record<string, string>>,
    destroy: () => Promise<void>,
  ) {
    this.#session = session;
    this.#headers = headers;
    this.#destroy = destroy;
  }

  #merge(headers?: Readonly<Record<string, string>> | undefined): Record<string, string> {
    return { ...this.#headers, ...headers };
  }

  async get(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const response = await this.#session.get(withQuery(url, options.params), {
      headers: this.#merge(options.headers),
    });
    return { text: response.body };
  }

  async post(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    const response = await this.#session.post(withQuery(url, options.params), {
      headers: this.#merge(options.headers),
      // 바디가 없는 POST 는 `body` 자체를 넘기지 않습니다 — `stationdata` 처럼
      // 앱이 빈 바디로 보내는 엔드포인트의 모양을 유지하려는 것입니다.
      ...(options.data === undefined ? {} : { body: encodeForm(options.data) }),
    });
    return { text: response.body };
  }

  async close(): Promise<void> {
    await this.#session.close();
    // 세션만 닫고 끝내면 네이티브 워커 풀이 살아 있어 프로세스가 종료되지 않습니다.
    await this.#destroy();
  }
}

/**
 * 기본 전송 — 첫 요청까지 구현 선택을 미루는 게으른 세션.
 *
 * node-tls-client 는 네이티브 바이너리를 쓰는 모듈이라 **첫 요청까지 로드를
 * 미룹니다** — `new Korail()` 이 네트워크는 물론 네이티브 로딩도 하지 않게 하려는
 * 것입니다.
 *
 * 한 번 고른 구현은 계속 재사용합니다. 요청마다 세션을 새로 만들면 쿠키 저장소도
 * 새로 생겨 로그인 세션이 유지되지 않고, 서버는 `P058` 을 줍니다 — 그건 "로그인이
 * 안 된다" 로 오인됩니다.
 */
class LazySession implements HttpSession {
  readonly #headers: Readonly<Record<string, string>>;
  #delegate: Promise<HttpSession> | undefined;

  constructor(headers: Readonly<Record<string, string>>) {
    // 호출자의 객체를 나중에 고쳐도 세션 헤더가 따라 바뀌지 않도록 복사합니다.
    this.#headers = Object.freeze({ ...headers });
  }

  async #ensure(): Promise<HttpSession> {
    this.#delegate ??= this.#create();
    return this.#delegate;
  }

  async #create(): Promise<HttpSession> {
    let module: TlsModule;
    try {
      module = (await import("node-tls-client")) as unknown as TlsModule;
    } catch (cause) {
      // pykorail 이 curl_cffi 를 못 쓸 때 requests 로 내려앉는 것과 같은 자리입니다.
      // 던지지 않고 폴백하되, TLS 지문이 달라졌다는 사실을 크게 알립니다.
      console.warn(
        "node-tls-client 를 불러오지 못해 내장 fetch 로 폴백합니다 — TLS 지문이 달라져 " +
          `서버가 로그인을 거부할 수 있습니다 (네이티브 바이너리 설치 실패): ${String(cause)}`,
      );
      return new FetchSession(this.#headers);
    }
    // v2 는 네이티브 워커 풀을 명시적으로 띄워야 합니다 — 이걸 빼면 첫 요청이
    // "Client not initialized" 로 죽습니다. 모듈을 모킹한 테스트로는 안 잡히는
    // 자리라 실제 요청으로만 드러납니다.
    await module.initTLS();
    const session = new module.Session({
      clientIdentifier: IMPERSONATE,
      headers: { ...this.#headers },
      timeout: 30_000,
    });
    return new TlsClientAdapter(session, this.#headers, () => module.destroyTLS());
  }

  async get(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    return (await this.#ensure()).get(url, options);
  }

  async post(url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    return (await this.#ensure()).post(url, options);
  }

  async close(): Promise<void> {
    // 한 번도 요청하지 않았으면 만들 것도 닫을 것도 없습니다.
    const pending = this.#delegate;
    if (pending === undefined) {
      return;
    }
    await (await pending).close();
  }
}

/** 기본 헤더가 적용된 HTTP 세션을 만듭니다. */
export const createSession: SessionFactory = (headers) => new LazySession(headers);
