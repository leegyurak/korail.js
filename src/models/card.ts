/**
 * 결제 수단.
 *
 * 카드 정보를 낱개 인자로 흩뿌리지 않고 한 값 객체로 묶습니다 — 결제는 인자 순서를
 * 잘못 넣으면 조용히 실패하거나 엉뚱한 승인이 나는 경로라, 이름으로 묶어 두는 편이
 * 안전합니다.
 */

/** 결제 인증 구분 코드 (`hidAthnDvCd1`). */
const INDIVIDUAL = "J";
const CORPORATE = "S";

const INSPECT_CUSTOM = Symbol.for("nodejs.util.inspect.custom");

/** {@link Card} 생성자 인자. */
export interface CardFields {
  /** 카드번호 (하이픈 없이). */
  readonly number: string;
  /** 카드 비밀번호 앞 2자리. */
  readonly password: string;
  /** 소유자 확인번호. 개인카드면 생년월일 `YYMMDD`, 법인카드면 사업자등록번호. */
  readonly verifyNumber: string;
  /** 유효기간 `YYMM`. */
  readonly expire: string;
  /** 할부 개월. 0 이면 일시불. */
  readonly installment?: number;
  /** 법인카드 여부. */
  readonly isCorporate?: boolean;
}

/** 로그·스택트레이스에 새어도 안전한 카드 표현. */
interface MaskedCard {
  readonly number: string;
  readonly installment: number;
  readonly isCorporate: boolean;
}

/**
 * 결제에 쓸 신용카드.
 *
 * `expire` 와 `verifyNumber` 는 앞자리 0 이 의미를 가지므로 **문자열**입니다
 * (`"0412"` 를 숫자로 넘기면 `412` 가 됩니다).
 *
 * ```ts
 * const card = new Card({
 *   number: "1234567812345678",
 *   password: "12",
 *   verifyNumber: "900101",
 *   expire: "2812",
 * });
 * await korail.reservations.pay(reservation, card);
 * ```
 */
export class Card {
  readonly number: string;
  readonly password: string;
  readonly verifyNumber: string;
  readonly expire: string;
  readonly installment: number;
  readonly isCorporate: boolean;

  constructor(fields: CardFields) {
    const required: readonly [keyof CardFields, unknown][] = [
      ["number", fields.number],
      ["password", fields.password],
      ["verifyNumber", fields.verifyNumber],
      ["expire", fields.expire],
    ];
    const missing = required
      .filter(([, value]) => typeof value !== "string" || value === "")
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new TypeError(`Card.${missing[0]} 는 비어 있지 않은 문자열이어야 합니다`);
    }

    const installment = fields.installment ?? 0;
    if (!Number.isInteger(installment) || installment < 0) {
      throw new RangeError("Card.installment 는 0 이상의 정수여야 합니다");
    }

    this.number = fields.number;
    this.password = fields.password;
    this.verifyNumber = fields.verifyNumber;
    this.expire = fields.expire;
    this.installment = installment;
    this.isCorporate = fields.isCorporate ?? false;
    Object.freeze(this);
  }

  /** 서버 인증 구분 코드 (`S`=법인 / `J`=개인). */
  get authType(): string {
    return this.isCorporate ? CORPORATE : INDIVIDUAL;
  }

  /** 카드번호 뒤 4자리만 남긴 표현. */
  #masked(): MaskedCard {
    const tail = this.number.length >= 4 ? `****${this.number.slice(-4)}` : "****";
    return { number: tail, installment: this.installment, isCorporate: this.isCorporate };
  }

  /**
   * `JSON.stringify(card)` 가 카드번호·비밀번호를 뱉지 않게 막습니다.
   *
   * 파이썬은 `__repr__` 하나만 막으면 됐지만 JS 는 새는 구멍이 둘입니다 —
   * `console.log` 는 inspect 훅을, `JSON.stringify` 는 여기를 부릅니다.
   */
  toJSON(): MaskedCard {
    return this.#masked();
  }

  /** `console.log(card)` 가 카드번호를 뱉지 않게 막습니다. */
  [INSPECT_CUSTOM](): string {
    return this.toString();
  }

  toString(): string {
    const { number, installment, isCorporate } = this.#masked();
    return `Card(number="${number}", installment=${installment}, isCorporate=${isCorporate})`;
  }
}
