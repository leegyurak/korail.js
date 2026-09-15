---
name: add-error-code
description: 새 코레일 응답 코드(h_msg_cd)를 korail.js 에러 계층에 매핑하는 절차. "이 에러 코드 처리해줘", "P0xx 코드가 뜨는데", "예외 추가" 같은 요청에 사용하세요. CODED_ERRORS 등록 방식과 KorailApiError / KorailError 중 어디에 붙일지 판단 기준을 담고 있습니다.
---

# 응답 코드를 에러로 매핑

## 먼저 판단: 어느 갈래인가

```
KorailError                    ← 이 패키지가 던지는 모든 에러의 최상위
├── KorailApiError             ← 서버가 strResult=FAIL 로 응답한 경우
│   ├── NeedToLoginError
│   ├── NoResultsError
│   ├── SoldOutError
│   └── LoginFailedError
├── NetFunnelError             ← 대기열 게이트 실패
├── StationNotFoundError       ← 요청을 보내기 **전** 클라이언트가 잡은 입력 오류
└── TransportError             ← 세션 생성 실패 / 비 JSON 응답
```

- **서버가 `h_msg_cd` 로 알려준 실패** → `KorailApiError` 하위. 아래 절차대로.
- **요청을 보내기 전에 우리가 막는 입력 오류** → `KorailApiError` 가 아니라
  `KorailError` 의 형제로 만드세요 (`src/errors/validation.ts`).
  서버 응답이 아닌 것을 `KorailApiError` 로 두면 `catch (e instanceof KorailApiError)`
  의 의미가 흐려집니다.

## 코레일 응답 코드 추가하기

`src/errors/api.ts` 에 클래스를 추가하고 **`CODED_ERRORS` 배열에 등록**합니다.

```ts
/** 1인당 예약 한도를 넘었습니다. */
export class TooManyReservationsError extends KorailApiError {
  static override readonly codes = new Set(["ERR211072"]);
  static override readonly defaultMessage = "Too many reservations";
}

// 파일 하단
export const CODED_ERRORS = [
  NeedToLoginError,
  NoResultsError,
  SoldOutError,
  TooManyReservationsError,   // ← 추가
] as const;
```

### 왜 배열이 필요한가

클래스가 자기 서브클래스를 알 방법이 JS 에는 없어서, 자동 등록이 불가능합니다.
그래서 명시 배열을 씁니다. 대신 등록 누락이 조용히 지나가지 않도록
`tests/errors.test.ts` 가 모듈 export 를 훑어 **"`codes` 를 가졌는데
`CODED_ERRORS` 에 없는 클래스"** 를 찾아냅니다.

```ts
it("코드를 가진 에러는 전부 등록돼 있다", async () => {
  // when
  const unregistered = Object.values(await import("../src/errors/api.js"))
    .filter((v) => typeof v === "function" && "codes" in v && (v.codes as Set<string>).size > 0)
    .filter((v) => !CODED_ERRORS.includes(v as never))
    .map((v) => (v as { name: string }).name);

  // then
  expect(unregistered).toEqual([]);
});
```

**이 테스트를 지우지 마세요.** 이게 없으면 새 에러 클래스가 등록되지 않은 채
머지되고, 사용자는 `TooManyReservationsError` 대신 밋밋한 `KorailApiError` 를
받게 됩니다 — 에러도 안 나고 테스트도 통과합니다.

### 지켜야 할 것

- **생성자를 덮어쓰지 마세요.** 시그니처가 계층 전체에서 같아야
  `errorForCode(code, message)` 가 균일하게 조립합니다. `codes` 와
  `defaultMessage` 정적 필드만 채우세요.
- `codes` 는 `Set<string>` 입니다. `static override readonly` 를 빠뜨리지 마세요 —
  `override` 가 없으면 `tsc` 가 막고, `readonly` 가 없으면 밖에서 바뀝니다.
- 코드를 여러 개 묶어도 됩니다 (`NoResultsError` 가 4개를 묶습니다). **호출자가
  같은 방식으로 대응할 코드끼리** 묶으세요. 대응이 다르면 타입을 나누세요.
- `defaultMessage` 는 짧은 영문 식별 문구. 사용자에게 보일 한국어 메시지는 서버가
  `h_msg_txt` 로 주고, 매칭 안 된 코드는 그 메시지가 그대로 실립니다.
- `src/errors/index.ts` 의 export 에 추가하고, 공개할 만하면 `src/index.ts` 에도
  추가하세요.
- **`Error` 를 상속할 때 `Object.setPrototypeOf` 가 필요한지 확인하세요.** 이
  저장소의 `tsconfig` 는 `target: ES2022` 라 필요 없지만, 베이스 클래스가
  바뀌면 `instanceof` 가 조용히 깨집니다 — `tests/errors.test.ts` 의 계층
  테스트가 그것도 지킵니다.
- **`name` 을 설정하세요.** 설정하지 않으면 스택트레이스에 부모 클래스 이름이
  찍혀 원인 파악이 어려워집니다.

## 새 갈래(클라이언트 측 검증)를 만들 때

`src/errors/validation.ts` 에 `KorailError` 를 상속해 만듭니다. 사용자가 고칠 수
있도록 **무엇이 왜 잘못됐는지** 를 담으세요 — `StationNotFoundError` 가 오타
후보까지 알려주는 것처럼.

```ts
export class SeatUnavailableError extends KorailError {
  readonly requested: string;
  readonly available: readonly string[];

  constructor(requested: string, available: readonly string[]) {
    super(`'${requested}' 좌석을 쓸 수 없습니다. 가능: ${available.join(", ")}`);
    this.name = "SeatUnavailableError";
    this.requested = requested;
    this.available = Object.freeze([...available]);
  }
}
```

## 테스트

`tests/errors.test.ts` 에 추가합니다. 기존 `it.each` 표에 코드를 얹으면 됩니다:

```ts
it.each([
  ["P058", NeedToLoginError],
  ["ERR211072", TooManyReservationsError],   // ← 추가
])("코드 %s 는 구체 타입으로 승격된다", (code, expected) => {
  // when
  const error = errorForCode(code, "서버 메시지");

  // then
  expect(error).toBeInstanceOf(expected);
  expect(error.constructor).toBe(expected);   // 정확히 그 타입인지 (부모가 아니라)
  expect(error.code).toBe(code);
});
```

계층 테스트(`모든 에러가 KorailError 다`)의 목록에도 새 타입을 넣어, 새 에러가
`KorailError` 아래에 있다는 것을 고정하세요.

## 마무리

```bash
pnpm verify
```

README 의 에러 계층 다이어그램도 갱신하세요.
