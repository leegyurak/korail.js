/**
 * 코레일 스마트 예매 클라이언트.
 *
 * {@link Korail} 은 세션 수명(로그인·로그아웃·연결)만 책임지고, 실제 엔드포인트는
 * 리소스들이 나눠 갖습니다.
 */

import { ApiClient } from "./api";
import { RequestSigner } from "./auth/signer";
import {
  API_ENDPOINTS,
  API_KEY,
  APP_VERSION,
  DEFAULT_HEADERS,
  DEVICE,
  EMAIL_REGEX,
  HYPHENLESS_PHONE_REGEX,
  PHONE_NUMBER_REGEX,
} from "./constants";
import { encryptPassword } from "./crypto";
import type { DeviceProfileLike } from "./device/profile";
import { dalvikUserAgent } from "./device/profile";
import { LoginFailedError } from "./errors";
import { isResponseData, text } from "./models/parsing";
import { ReservationResource } from "./resources/reservations";
import { StationResource } from "./resources/stations";
import { TicketResource } from "./resources/tickets";
import { TrainResource } from "./resources/trains";
import type { SessionFactory } from "./transport";
import { createSession } from "./transport";

/** {@link Korail} 생성 옵션. */
export interface KorailOptions {
  /** 응답 본문을 `console.debug` 로 흘립니다. 자격증명이 찍힐 수 있으니 개발용입니다. */
  readonly verbose?: boolean | undefined;
  /**
   * 기기 프로파일. 주면 User-Agent 와 DynaPath 서명이 **같은 기기**를 가리키도록
   * 함께 바뀝니다 — 둘 중 하나만 바꾸면 그 불일치가 곧 탐지 신호입니다.
   */
  readonly deviceProfile?: DeviceProfileLike | undefined;
  /** 조회 전에 역 이름을 검증할지. */
  readonly validateStations?: boolean | undefined;
  /** 전송 구현. 테스트에서 가짜 세션을 끼울 때 씁니다. */
  readonly sessionFactory?: SessionFactory | undefined;
}

/**
 * 코레일 스마트 앱 API 를 감싼 클라이언트. 공개 메서드는 전부 `async` 입니다.
 *
 * 생성자는 네트워크를 건드리지 않습니다 — 객체를 만드는 일과 로그인하는 일은
 * 별개입니다. 한 줄로 끝내고 싶으면 {@link Korail.loggedIn} 을 쓰세요.
 *
 * ```ts
 * const korail = await Korail.loggedIn("me@example.com", "password");
 * try {
 *   const trains = await korail.trains.search("서울", "부산");
 * } finally {
 *   await korail.close();
 * }
 * ```
 */
export class Korail {
  readonly #api: ApiClient;
  #idx: string | undefined;

  /** 이 클라이언트가 흉내 내는 기기. 생성 시에만 정해집니다. */
  readonly deviceProfile: DeviceProfileLike | undefined;

  /** 역 마스터 조회·검증. */
  readonly stations: StationResource;
  /** 시간표 조회. */
  readonly trains: TrainResource;
  /** 예매·결제·취소. */
  readonly reservations: ReservationResource;
  /** 승차권 조회·환불. */
  readonly tickets: TicketResource;

  constructor(options: KorailOptions = {}) {
    // 공유 객체를 오염시키지 않도록 복사한 뒤 User-Agent 만 갈아 끼웁니다.
    const headers: Record<string, string> = { ...DEFAULT_HEADERS };
    if (options.deviceProfile !== undefined) {
      headers["User-Agent"] = dalvikUserAgent(options.deviceProfile);
    }

    const factory = options.sessionFactory ?? createSession;
    this.#api = new ApiClient(
      factory(headers),
      new RequestSigner({ profile: options.deviceProfile }),
      options.verbose ?? false,
    );
    this.deviceProfile = options.deviceProfile;

    this.stations = new StationResource(this.#api);
    this.trains = new TrainResource(this.#api, this.stations, options.validateStations ?? true);
    this.reservations = new ReservationResource(this.#api);
    this.tickets = new TicketResource(this.#api);
  }

  /**
   * 클라이언트를 만들고 곧바로 로그인합니다.
   *
   * 실패하면 연결을 닫고 에러를 다시 올립니다 — 로그인 못 한 클라이언트가
   * 소켓만 붙든 채 돌아다니면 안 됩니다.
   *
   * @throws {LoginFailedError} {@link login} 이 실패했습니다.
   */
  static async loggedIn(
    korailId: string,
    korailPw: string,
    options: KorailOptions = {},
  ): Promise<Korail> {
    const korail = new Korail(options);
    try {
      await korail.login(korailId, korailPw);
    } catch (error) {
      await korail.close();
      throw error;
    }
    return korail;
  }

  // ------------------------------------------------------------- 세션 상태
  get verbose(): boolean {
    return this.#api.verbose;
  }

  set verbose(value: boolean) {
    this.#api.verbose = value;
  }

  get logined(): boolean {
    return this.#api.account.logined;
  }

  get membershipNumber(): string | undefined {
    return this.#api.account.membershipNumber;
  }

  get name(): string | undefined {
    return this.#api.account.name;
  }

  get email(): string | undefined {
    return this.#api.account.email;
  }

  get phoneNumber(): string | undefined {
    return this.#api.account.phoneNumber;
  }

  /** HTTP 연결을 정리합니다. 로그아웃은 하지 않습니다. */
  async close(): Promise<void> {
    await this.#api.close();
  }

  // --------------------------------------------------------------------- 인증
  /**
   * 서버에서 1회용 암호화 키를 받아 비밀번호를 암호화합니다.
   *
   * 함께 내려오는 `idx` 는 로그인 폼에 되돌려 줘야 하므로 보관합니다.
   */
  async #encryptPassword(password: string): Promise<string> {
    const payload = await this.#api.post(API_ENDPOINTS.code, {
      data: { code: "app.login.cphd" },
    });
    const cipherInfo = payload["app.login.cphd"];
    const cipher = isResponseData(cipherInfo) ? cipherInfo : {};
    const idx = cipher.idx;
    const key = cipher.key;

    // `strResult` 가 SUCC 여도 idx·key 가 빠지거나 빈 값으로 올 수 있습니다.
    // 날로 인덱싱하면 TypeError 가 그대로 새어 나가 "로그인 실패는 전부
    // LoginFailedError" 라는 login() 의 계약이 깨집니다.
    if (
      payload.strResult !== "SUCC" ||
      idx === undefined ||
      idx === null ||
      idx === "" ||
      typeof key !== "string" ||
      key === ""
    ) {
      throw new LoginFailedError(
        "비밀번호 암호화 키를 발급받지 못했습니다",
        text(payload, "h_msg_cd") || undefined,
      );
    }

    // `idx` 는 로그인 폼에 문자열로 실려 나갑니다. 서버가 숫자로 내려보내도
    // 폼 인코딩 결과는 같지만, `#idx` 의 타입이 거짓말이 되지 않게 여기서
    // 확정합니다. 형식을 이유로 거부하지는 않습니다 — 관측한 적 없는 형태
    // 하나로 로그인을 통째로 막는 쪽이 더 위험합니다.
    this.#idx = String(idx);
    try {
      return encryptPassword(password, key);
    } catch (cause) {
      // 키 길이가 AES 규격(16·24·32바이트)에 안 맞는 경우. node:crypto 의 에러를
      // 날것으로 올리면 호출자가 잡을 타입이 없습니다.
      throw new LoginFailedError(`발급받은 암호화 키를 쓸 수 없습니다: ${String(cause)}`);
    }
  }

  /**
   * 로그인합니다. 실패는 전부 에러입니다 — 성공 여부를 반환하지 않습니다.
   *
   * 빈 자격증명·하이픈 없는 번호·암호화 키 발급 실패는 에러인데 비밀번호가
   * 틀린 것만 `false` 를 돌려주면, 반환값을 확인하지 않은 호출자는 로그인하지
   * 못한 채로 조회에 들어가 한참 뒤 엉뚱한 `P058` 을 보게 됩니다. 실패 경로를
   * 하나로 모아 그 구멍을 없앱니다.
   *
   * @throws {LoginFailedError} 아이디/비밀번호가 비었거나, 휴대폰 번호 형식이
   *   잘못됐거나, 암호화 키 발급이 실패했거나, 서버가 자격증명을 거부했습니다.
   */
  async login(korailId: string, korailPw: string): Promise<void> {
    if (!korailId || !korailPw) {
      throw new LoginFailedError("아이디와 비밀번호가 필요합니다");
    }

    // 하이픈 없는 휴대폰 번호는 회원번호로 잘못 조회돼 "비밀번호가 틀렸다"는
    // 엉뚱한 응답을 받습니다. 서버에 보내기 전에 분명하게 알려 줍니다.
    if (HYPHENLESS_PHONE_REGEX.test(korailId)) {
      const hyphenated = `${korailId.slice(0, 3)}-${korailId.slice(3, -4)}-${korailId.slice(-4)}`;
      throw new LoginFailedError(
        `휴대폰 번호로 로그인하려면 하이픈을 넣어야 합니다: "${korailId}" 대신 "${hyphenated}"`,
      );
    }

    // 아이디 형태에 따라 서버가 조회할 컬럼이 달라집니다: 5=이메일, 4=휴대폰, 2=회원번호.
    const inputFlag = EMAIL_REGEX.test(korailId)
      ? "5"
      : PHONE_NUMBER_REGEX.test(korailId)
        ? "4"
        : "2";

    const encryptedPw = await this.#encryptPassword(korailPw);

    const url = API_ENDPOINTS.login;
    const { headers, sid } = this.#api.sign(url);
    const data: Record<string, string | undefined> = {
      Device: DEVICE,
      Version: APP_VERSION,
      Key: API_KEY,
      txtMemberNo: korailId,
      txtPwd: encryptedPw,
      txtInputFlg: inputFlag,
      idx: this.#idx,
      ...(sid === undefined ? {} : { Sid: sid }),
    };

    const payload = await this.#api.post(url, { data, headers });
    const account = this.#api.account;

    if (payload.strResult === "SUCC" && text(payload, "strMbCrdNo") !== "") {
      // 프로필 필드는 날로 인덱싱하지 않습니다. 서버가 이름·이메일·번호 중
      // 하나를 빼먹으면 `logined = true` 를 이미 세운 뒤 터져, 반쯤 갱신된
      // 계정과 "로그인 실패는 전부 LoginFailedError" 라는 계약이 함께 깨집니다.
      // 서버는 SUCC 와 회원번호를 줬고 세션 쿠키도 받았으니 로그인은 성공한
      // 것입니다 — 표시용 필드가 비었다고 실패로 뒤집으면 서버는 로그인
      // 상태인데 클라이언트만 아니라고 우기게 됩니다.
      account.logined = true;
      account.membershipNumber = text(payload, "strMbCrdNo");
      account.name = text(payload, "strCustNm") || undefined;
      account.email = text(payload, "strEmailAdr") || undefined;
      account.phoneNumber = text(payload, "strCpNo") || undefined;
      return;
    }

    account.clear();
    // 서버가 준 이유를 그대로 전달합니다 — "비밀번호가 틀렸습니다" 와 "휴면
    // 계정입니다" 는 사용자가 해야 할 일이 다른데, 하나로 뭉개면 알 길이 없습니다.
    throw new LoginFailedError(
      text(payload, "h_msg_txt") || "아이디 또는 비밀번호가 올바르지 않습니다",
      text(payload, "h_msg_cd") || undefined,
    );
  }

  /**
   * 서버 로그인 세션을 끊습니다.
   *
   * HTTP 연결은 그대로 둡니다 — 로그아웃은 프로토콜 상태이고 연결은 자원이라
   * 수명이 다릅니다. 같은 클라이언트로 다른 계정에 다시 로그인하려면 연결이
   * 살아 있어야 합니다. 연결까지 정리하려면 {@link close} 를 부르세요.
   */
  async logout(): Promise<void> {
    await this.#api.get(API_ENDPOINTS.logout);
    this.#api.account.clear();
  }
}
