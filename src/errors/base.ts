/** 예외 계층의 뿌리. */

/**
 * 이 패키지가 던지는 모든 에러의 최상위 타입.
 *
 * 호출자가 `catch (e) { if (e instanceof KorailError) }` 하나로 라이브러리 유래
 * 실패를 전부 잡을 수 있도록 존재합니다. 직접 던지지 말고 하위 타입을 쓰세요.
 */
export class KorailError extends Error {
  constructor(message?: string) {
    super(message);
    // 트랜스파일된 클래스에서도 `instanceof` 와 `error.name` 이 맞게 동작하도록
    // 프로토타입을 명시적으로 복구합니다 (ES5 타깃 다운레벨 대비).
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = new.target.name;
  }
}

/**
 * 코레일 API 가 `strResult=FAIL` 로 응답했을 때 던집니다.
 *
 * 서버가 준 메시지(`h_msg_txt`)와 코드(`h_msg_cd`)를 그대로 실어 나릅니다.
 * 알려진 코드는 구체 타입으로 승격되고, 나머지는 이 타입 그대로 올라옵니다.
 *
 * 하위 타입은 생성자를 덮어쓰지 말고 `codes` 와 `defaultMessage` 정적 필드만
 * 채운 뒤 **`CODED_ERRORS` 배열에 등록**하세요. 생성자 시그니처가 계층 전체에서
 * 같아야 `errorForCode` 가 균일하게 조립할 수 있습니다.
 */
export class KorailApiError extends KorailError {
  /** 이 에러 타입으로 승격할 코레일 응답 코드(`h_msg_cd`). */
  static readonly codes: readonly string[] = [];

  /** `message` 를 생략했을 때 쓸 사람이 읽을 설명. */
  static readonly defaultMessage: string | undefined = undefined;

  /** 서버가 준 응답 코드(`h_msg_cd`). 없으면 `undefined`. */
  readonly code: string | undefined;

  constructor(message?: string | undefined, code?: string | undefined) {
    const ctor = new.target as typeof KorailApiError;
    super(message ?? ctor.defaultMessage);
    this.code = code;
  }

  /** `메시지 (코드)` — 코드가 없으면 메시지만. */
  override toString(): string {
    return this.code === undefined
      ? `${this.name}: ${this.message}`
      : `${this.message} (${this.code})`;
  }
}
