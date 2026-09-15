# AGENTS.md — korail.js

코레일(KTX) 스마트 예매 비공식 TypeScript 클라이언트. npm 배포 패키지이고
**TypeScript 와 JavaScript 를 모두 지원**합니다 (ESM + CJS 듀얼 번들, `.d.ts` 동봉).

이 문서가 **모든 코딩 에이전트의 단일 규범**입니다. Codex · Claude Code · Pi ·
Cursor · OpenCode 가 각자의 진입점에서 이 파일로 수렴합니다 (`.agents/README.md` 참조).

---

## 1. 명령

`pnpm` 으로만 실행합니다. `npm` 이나 `yarn` 을 쓰지 마세요 — 잠긴 의존성과 어긋납니다.

```bash
pnpm install                 # 환경 구성 (CI 는 --frozen-lockfile)
pnpm format                  # biome format --write   (검사 전에 먼저)
pnpm lint                    # biome check --write
pnpm typecheck               # tsc --noEmit
pnpm test                    # vitest run --coverage  (커버리지 게이트 포함)
pnpm build                   # tsup → dist/ (ESM + CJS + .d.ts)
pnpm verify                  # 위 네 개를 순서대로
```

**작업을 끝내기 전에 반드시 네 개를 전부 통과시키세요.** 하나라도 실패하면 끝난 게
아닙니다. 실패를 우회(`biome-ignore`, `@ts-expect-error`, 커버리지 임계값 인하)하지
말고 원인을 고치세요. 정말 우회가 맞다면 **왜** 인지 같은 줄에 적으세요.

---

## 2. 아키텍처 — 절대 어기지 말 것

계층은 **한 방향으로만** 의존합니다. 화살표를 거스르는 import 를 추가하지 마세요.

```
client.ts  (Korail — 로그인/로그아웃/연결 수명만)
   │
   ├── resources/   stations · trains · reservations · tickets   ← 엔드포인트는 전부 여기
   │      │
   │      └── api.ts (ApiClient) ── auth/ (signer · dynapath) ── crypto.ts
   │             │                       └── transport.ts
   │             └── models/  (불변 응답 모델)
   │
   └── errors/ · constants.ts · options.ts · device/   ← 누구나 의존 가능, 아무에게도 의존 안 함
```

### 지켜야 할 규칙

1. **엔드포인트는 리소스에만.** `Korail` 본체에 새 API 메서드를 붙이지 마세요.
   `korail.trains.search()` 처럼 리소스에 넣고, 클라이언트에는 `login`/`logout`/
   `close` 와 리소스 배선만 둡니다. 리소스가 늘면 `Korail` 생성자에 한 줄 추가.

2. **HTTP 는 `ApiClient` 를 통해서만.** 리소스가 `#session` 을 직접 만지거나
   전송 라이브러리를 import 하면 안 됩니다. `this.api.get/post/sign/check/
   basePayload` 만 씁니다.

3. **응답 모델은 불변 + 완성 상태.** 전부 `readonly` 필드이고 생성자 끝에서
   `Object.freeze(this)` 합니다. 만드는 길은 `static fromResponse()` 하나뿐입니다.
   생성자는 값 조립, 응답 객체 해석은 `fromResponse` — 이 경계를 섞지 마세요.
   객체를 만든 뒤 필드를 채우는 코드는 **금지**입니다. 부속 데이터가 필요하면
   **먼저 조회해서 생성자에 넘기세요** (`Reservation.fromResponse(data, { seats, wctNo })`).
   반쯤 채워진 객체가 돌아다니면 안 됩니다.

   > **`Object.freeze` 는 얕습니다.** 배열·객체 필드는 **복사해서 함께 동결**
   > 하세요 (`Object.freeze([...seats])`). 그러지 않으면 호출자가 넘긴 배열을
   > 나중에 바꿔 모델 내용이 뒤에서 변합니다.

4. **상속이 아니라 합성.** `Ticket`·`Reservation` 은 `Train` 을 **참조**합니다
   (`ticket.train.depName`). 예약에 `hasSeat()` 이 딸려오는 건 말이 안 됩니다.
   새 모델도 "A는 B다"가 참일 때만 상속하세요.

5. **파싱 관용성은 `models/parsing.ts` 에.** 코레일은 필드를 빼먹거나 빈 문자열로
   보냅니다. 응답 객체를 날로 인덱싱하지 말고 `text`/`integer`/`floating` 을 쓰세요.
   모델 생성이 응답 누락으로 죽으면 안 됩니다.

   > JS 에서는 이게 특히 중요합니다. `Number("")` 은 `0`, `Number(null)` 도
   > `0`, `Number("12abc")` 는 `NaN` 입니다 — 잘못된 값이 예외가 아니라 그럴듯한
   > 숫자가 되어 그대로 흘러갑니다. 파싱 헬퍼가 그것을 막는 유일한 지점입니다.

6. **에러는 계층 안에서.** 새 코레일 응답 코드는 `KorailApiError` 를 상속하고
   `codes`·`defaultMessage` 정적 필드만 채운 뒤 **`CODED_ERRORS` 배열에 추가**
   하세요. 클라이언트 측 입력 오류는 `KorailApiError` 가 아니라 `KorailError` 의
   형제로 (`StationNotFoundError` 참고).

   > **왜 배열이 필요한가.** 클래스가 자기 서브클래스를 알 방법이 JS 에는
   > 없어서, 자동 등록이 불가능합니다. 대신 `tests/errors.test.ts` 가 모듈
   > export 를 훑어 "코드를 가졌는데 배열에 없는 클래스" 를 잡습니다 — 등록
   > 누락이 조용히 지나가지 않게 하는 유일한 장치이니 **그 테스트를 지우지
   > 마세요.** 없으면 새 에러가 등록되지 않은 채 머지되고, 사용자는 구체 타입
   > 대신 밋밋한 `KorailApiError` 를 받습니다 — 에러도 안 나고 테스트도 통과합니다.

7. **상태 변경 메서드는 `Promise<void>` 를 반환하고 실패 시 throw.**
   `create`/`pay`/`cancel`/`refund`. 성공 여부를 불리언으로 돌려주지 마세요.
   (`create` 는 만들어진 `Reservation` 을 돌려줍니다 — 그건 상태 조회가 아니라
   결과물입니다.)

8. **생성자에서 I/O 금지.** `new Korail()` 은 네트워크를 치지 않습니다. 한 줄
   편의가 필요하면 `Korail.loggedIn()` 같은 정적 팩토리를 쓰세요. 생성자는
   `async` 가 될 수 없으니 이 규칙은 저절로 지켜지는 편입니다.

9. **공개 표면은 전부 `async`.** 내부에서도 콜백이나 `.then()` 체인 대신
   `async`/`await` 을 쓰세요.

---

## 3. 외부 API 불변식 — 가장 위험한 부분

### 새 엔드포인트는 APK 검증이 선행 조건입니다

**공식 코레일톡+(`com.korail.talk`) APK 를 디컴파일해 경로·폼 필드·서명 대상 여부를
확인하기 전에는 엔드포인트를 추가하지 마세요.** 추측한 필드 이름은 에러가 아니라
**조용한 빈 값**이 되어, 테스트는 통과하고 사용자만 실패합니다. 절차는
`add-endpoint` 스킬(`.claude/skills/add-endpoint/SKILL.md`)에 있습니다.

확인할 수 없으면 **거기서 멈추고 그 사실을 보고하세요.** "아마 이럴 것 같다" 로
코드를 넣는 것이 이 저장소에서 가장 비싼 실수입니다.

### TLS 지문 — 2026-09-15 실측됨 (로그인 경로만 미검증)

**조회 경로는 실서버로 검증됐습니다. 로그인 경로는 아직 아닙니다.**

2026-09-15, 사용자의 명시적 동의 아래 **자격증명 없이** 실측했습니다. 실계정
로그인은 시도하지 않았습니다.

| 실측 | 전송 | 결과 |
| --- | --- | --- |
| `common.stationdata` (공개 조회, 서명 없음) | node-tls-client `chrome_131` | **통과** — 역 281개 |
| `seatMovie.ScheduleView` (DynaPath 서명, 비로그인) | node-tls-client `chrome_131` | **통과** — 열차 10편 |
| `common.stationdata` | 내장 `fetch` (Node 기본 지문) | **통과** — HTTP 200 |
| `seatMovie.ScheduleView` (DynaPath 서명) | 내장 `fetch` (Node 기본 지문) | **통과** — 열차 10편 |

읽어 낼 것 두 가지:

1. **`chrome_131` 은 통과합니다.** 서명된 경로까지 받아들여졌으므로 TLS·서명·앱
   신원이 함께 맞는 것이 실증됐습니다.
2. **이 엔드포인트들은 지문으로 막고 있지 않습니다.** Node 기본 지문(`fetch`)도
   그대로 통과했습니다 — 조회 경로에 한해서는 지문 위장이 필수가 아닙니다.

**남은 미검증 하나: 로그인 엔드포인트(`login.Login`).** 자격증명이 필요해 확인하지
못했습니다. 조회가 통과한다고 로그인도 통과한다고 단정하지 마세요 — 서버가 인증
경로에만 더 센 게이트를 둘 수 있습니다.

아래 표는 왜 `node-tls-client` 를 골랐는지의 기록입니다.

코레일 서버는 TLS 지문을 봅니다. pykorail 은 `curl_cffi` 의
`impersonate="chrome131_android"` 로 통과하는데, **Node 에는 그것과 정확히
대응하는 수단이 없습니다.**

| 수단 | 판정 |
| --- | --- |
| Node 내장 `https.Agent` | `ciphers`/`sigalgs`/`ecdhCurve` 만 제어. 확장 순서·GREASE 불가 → **JA3 재현 불가** |
| `impit` | `browser: "chrome" \| "firefox"` 만 — 버전·안드로이드 변종 지정 불가 |
| `node-tls-client` | `ClientIdentifier` + 임의 `ja3string` 지정 가능 → **현재 채택안** |
| `cycletls` | JA3 지정 가능하나 유지보수 활발도가 낮음 |
| `node-libcurl` | curl-impersonate 패치 빌드가 아니라 **임퍼소네이션 없음** |

`node-tls-client` 가 기본 전송이고, 불러오지 못하면 내장 `fetch` 로 폴백합니다
(경고 동반). pykorail 의 `requests` 폴백과 같은 자리입니다.

**`src/transport.ts` 를 건드리는 작업은 실측 결과를 근거로만 하세요.** 실측은
실서버 요청이라 §7 "하지 말 것" 의 예외이고, **사용자의 명시적 동의가 있을 때만**
합니다. 조회 엔드포인트로 하는 실측은 자격증명이 필요 없습니다 — 로그인을
시도하지 말고 `stationdata` 와 `ScheduleView` 로 확인하세요.

#### 네이티브 바이너리의 배포상 함정 (2026-09-15 확인)

`node-tls-client` 는 설치 시점이 아니라 **첫 요청에** 12MB 짜리 공유 라이브러리를
GitHub 릴리스에서 `os.tmpdir()` 로 내려받습니다. 두 가지가 따라옵니다:

- **임시 디렉터리가 비워지면 다시 받습니다.** 서버리스·매번 새로 뜨는 CI 러너에서는
  실행마다 12MB 를 내려받는다는 뜻입니다.
- **내려받기에 실패하면 `process.exit(1)` 로 호스트 프로세스를 죽입니다.**
  `initTLS()` 가 메인 스레드에서 부르므로 **우리 쪽 try/catch 와 `fetch` 폴백이
  잡을 수 없습니다.** 폴백은 *모듈 임포트* 실패만 막아 줍니다.

오프라인·에어갭 환경이라면 배포 이미지에 이 파일을 미리 넣거나, 배포 단계에서
요청 한 번을 흘려 워밍업하세요.

### 그 밖의 불변식

이 패키지는 **문서 없는 사설 API** 를 상대합니다. 서버가 앱 버전·기기 문자열·TLS
지문·서명을 교차 검증하므로, 아래를 건드리면 조용히 로그인이 막힙니다.

- **작동하는 값을 근거 없이 바꾸지 마세요**: `constants.ts` 의 `USER_AGENT`,
  `APP_VERSION`, `API_KEY`, `SID_KEY`, `DEVICE_ID`, 그리고 `auth/dynapath.ts` 의
  인코딩 테이블·상수(`TABLE`, `RADIX`, `MODULUS`, `CHUNK`).
- **폼 필드를 정리하지 마세요.** 빈 문자열로 보내는 필드(`txtChgFlg2` 등)나 조회
  엔드포인트만 `Key` 없이 빈 `Sid` 를 보내는 것은 앱 동작을 그대로 옮긴 것입니다.
  "안 쓰는 것 같으니 지운다" 는 회귀입니다.
- **UA 와 서명은 같은 기기를 가리켜야 합니다.** `deviceProfile` 이 User-Agent 와
  DynaPath 서명(`os=`·`dm=`)을 함께 바꿉니다. 한쪽만 바꾸면 그 불일치가 탐지 신호입니다.
- **암호화 형태를 "고치지" 마세요.** 이중 base64, `Sid` 끝의 개행, 키를 IV 로 재사용
  하는 AES-CBC — 전부 서버가 그 모양을 기대합니다.

### JS 고유의 와이어 함정

파이썬에 없던 것들입니다. 전부 **조용히** 나갑니다.

- **`URLSearchParams` 와 파이썬 `urlencode` 의 safe 문자 집합이 다릅니다.**
  `~` 는 파이썬이 그대로 두고 JS 가 `%7E` 로, `*` 는 반대입니다. 지금 나가는
  값(한글·숫자·base64)에는 안 걸리지만, **새 필드를 넣을 때 값에 무엇이 들어갈
  수 있는지 보세요.** 폼 인코딩 파리티 테스트가 이 경계를 지킵니다.
- **`JSON.stringify` 로 폼을 만들지 마세요.** 이 API 는 전부
  `application/x-www-form-urlencoded` 입니다.
- **`undefined` 필드는 사라지고 `null` 은 `"null"` 이 됩니다.** 폼 조립에서
  값이 없는 필드는 **넣지 않거나 빈 문자열**이어야 합니다 — 앱이 하는 대로.
- **`new Date("20260401")` 의 파싱은 구현 의존입니다.** 코레일의 `YYYYMMDD`·
  `HHMMSS` 문자열을 `Date` 생성자에 넘기지 마세요. 문자열은 문자열로 다루고,
  시각 계산이 필요하면 KST(+9) 오프셋 산술을 명시적으로 하세요.

리팩터링으로 이 영역을 건드렸다면, **요청 페이로드가 그대로인지 증명**하세요.
가짜 세션으로 요청 인자를 캡처해 변경 전후를 필드 단위로 비교하는 테스트를 쓰면 됩니다
(`tests/resources.test.ts` 의 폼 필드 단언 참고).

---

## 4. TypeScript 규약

- **소스는 TypeScript, 배포는 TS + JS 양쪽.** `dist/` 에 ESM(`.mjs`)·CJS(`.cjs`)·
  타입 선언(`.d.ts`)이 함께 나가고 `package.json` 의 `exports` 가 셋을 연결합니다.
  **JS 사용자가 쓰는 경로가 깨지지 않게** `require()` 와 `import` 를 둘 다
  확인하세요 (`tests/packaging.test.ts`).
- **최소 Node 20.19.** `package.json` 의 `engines` 와 `tsconfig` 의 `target`/`lib`
  가 함께 막습니다. 20.19 가 하한인 이유는 그 버전부터 `require(esm)` 이 되어
  듀얼 패키지 위험이 크게 줄기 때문입니다.
- **`strict: true` 는 협상 대상이 아닙니다.** `noUncheckedIndexedAccess` ·
  `exactOptionalPropertyTypes` 도 켜져 있습니다.
- **`any` 는 경계에만.** 서버 응답은 `any` 가 아니라 **`unknown`** 으로 받고
  파싱 헬퍼로 좁히세요. `JSON.parse` 는 `any` 를 돌려주므로 여기서 한 번 막지
  않으면 타입 안전성이 코드베이스 전체로 새어 나갑니다.
- **타입만 쓰는 import 는 `import type`.** `verbatimModuleSyntax` 가 켜져 있어
  런타임 import 와 섞으면 번들에 불필요한 모듈이 들어갑니다.
- **`enum` 금지. `as const` 객체 + 유니온 타입을 쓰세요.** 이 값들은 폼에 그대로
  실려 나가는데 `enum` 은 런타임 객체를 만들어 트리셰이킹을 막고, 숫자 enum 은
  역매핑 키까지 만듭니다. `options.ts` 의 패턴을 따르세요.

  ```ts
  export const TrainType = { KTX: "100", ALL: "109" } as const;
  export type TrainTypeCode = (typeof TrainType)[keyof typeof TrainType];
  ```

- **공개 API 에 반환 타입을 명시하세요.** 추론에 맡기면 내부 구현이 바뀔 때
  공개 타입이 조용히 따라 바뀝니다.
- **불변 컬렉션은 `readonly T[]`.** 인자로 받은 배열은 그대로 보관하지 말고
  복사하세요 (§2-3).
- **`#private` 필드를 쓰세요.** TS 의 `private` 은 컴파일 후 사라져 JS 사용자에게
  그대로 노출됩니다. `#session` 은 런타임에도 닫혀 있습니다.
- **주석은 "무엇"이 아니라 "왜".** 특히 이상해 보이는 코드(앱 동작 재현, 서버 요구
  사항)에는 이유를 남기세요 — 다음 사람이 "정리"하려 들기 때문입니다.
- **TSDoc 은 한국어**, 코드 식별자는 영어. 기존 파일의 밀도와 어조를 맞추세요.
- **비밀은 `toJSON`·`[Symbol.for("nodejs.util.inspect.custom")]` 에서 마스킹.**
  `Card` 가 카드번호 뒤 4자리만 남기는 것처럼, 민감한 값을 담는 모델은 로그·
  스택트레이스·`JSON.stringify` 에 새지 않게 하세요.

  > 파이썬은 `__repr__` 하나만 막으면 됐지만 **JS 는 새는 구멍이 두 개**입니다.
  > `console.log(card)` 는 inspect 를, `JSON.stringify(card)` 는 `toJSON` 을
  > 부릅니다. 둘 다 막으세요.

- **네이밍은 JS 관용을 따릅니다** — `camelCase` 메서드·필드, `PascalCase` 타입.
  다만 **폼 필드 키와 응답 필드 이름은 서버가 정한 그대로**입니다 (`txtGoAbrdDt`,
  `h_dpt_rs_stn_cd`). 그것들을 camelCase 로 "정리"하면 요청이 조용히 깨집니다.

### Biome / tsc

- 설정은 `biome.json` 과 `tsconfig.json` 안에만. 별도 ESLint·Prettier 설정을
  만들지 마세요 — 도구를 늘리면 같은 것을 다른 규칙으로 두 번 지적합니다.
- 줄 길이 100. 포매터가 결정하게 두고 손으로 줄바꿈하지 마세요.
- `pnpm format` → `pnpm lint` → `pnpm typecheck` 순서로 돌립니다.
- 규칙을 통째로 끄지 말고 `biome.json` 의 `overrides` 로 경로 단위 예외를 쓰세요.
- `biome-ignore`/`@ts-expect-error` 를 쓸 거면 **왜** 인지 같은 줄에 적으세요.
  `@ts-ignore` 는 쓰지 마세요 — 오류가 사라져도 아무도 모릅니다.
  `@ts-expect-error` 는 오류가 없어지면 그 자체가 실패하므로 안전합니다.

---

## 5. 테스트 — 강제 규약

러너는 **Vitest** 입니다. 테스트는 `tests/` 아래 `*.test.ts`.

### 5.1 제어 흐름 금지

**테스트 함수 안에 `if` / `for` / `while` 문을 쓰지 마세요.** `tests/style.test.ts`
가 TypeScript 컴파일러 API 로 AST 를 훑어 이 규칙을 자동으로 강제합니다 — 어기면
테스트가 빨갛게 실패합니다.

- 케이스가 여러 개면 → `it.each` / `describe.each`
- 반복 검증이 필요하면 → `filter`/`map` 으로 **위반 목록을 만들어 빈 배열과 비교**

```ts
// 나쁨 — 어떤 프로파일에서 깨졌는지 알 수 없고, 첫 실패에서 멈춤
it("build ids", () => {
  for (const profile of DEVICE_PROFILES) {
    expect(profile.buildId.startsWith(...)).toBe(true);
  }
});

// 좋음 — 위반 전부가 한 번에 드러남
it("build ids", () => {
  // when
  const bad = DEVICE_PROFILES.filter((p) => !p.buildId.startsWith(...)).map((p) => p.id);

  // then
  expect(bad).toEqual([]);
});
```

`filter`/`map`/`some`/`every` 는 값을 뽑는 **식**이라 허용합니다. 금지 대상은 제어
흐름 **문**입니다. `it.each`, `expect.soft`, `vi.spyOn`, 픽스처 등 Vitest 기능을
최대한 쓰세요.

### 5.2 Given–When–Then

**모든 테스트는 준비·실행·검증 경계를 주석으로 드러냅니다.** `tests/style.test.ts`
가 AST 로 강제합니다.

- `// when` 과 `// then` 은 **필수**입니다.
- `// given` 은 실행 전에 준비할 코드가 있을 때만 씁니다 — 준비가 없는데 빈 Given 을
  두면 잡음일 뿐입니다.
- 예외 검증처럼 실행과 검증이 한 덩어리면 `// when & then` 으로 묶습니다.
- 순서는 given → when → then. `// then` 이 `// when` 보다 앞에 오면 실패합니다.

```ts
it("법인카드 플래그를 싣는다", async () => {
  // given
  const { client, session } = korail();
  const [rsv] = await client.reservations.all();

  // when
  await client.reservations.pay(rsv, new Card({ ...CORPORATE_CARD }));

  // then
  expect(session.kwargsFor("pay").data.hidAthnDvCd1).toBe("S");
});

it("음수 할부를 거부한다", () => {
  // when & then
  expect(() => cardWith({ installment: -1 })).toThrow(/installment/);
});

it("기본은 개인카드다", () => {
  // when
  const { authType } = cardWith();

  // then
  expect(authType).toBe("J");
});
```

**when 은 "무엇을 실행했는지" 한 가지만** 담으세요. when 블록이 여러 줄이면 대개
테스트 하나가 두 가지를 검증하고 있다는 신호입니다.

### 5.3 비동기 단언은 반드시 await

**`await` 을 빠뜨린 `expect` 는 통과합니다.** 파이썬에는 없던 실패 모드이고, 이
저장소의 모든 공개 API 가 `async` 라 상시 위험입니다.

```ts
// 나쁨 — 거부를 아무도 안 보고 테스트는 초록색
expect(client.login("", "")).rejects.toThrow(LoginFailedError);

// 좋음
await expect(client.login("", "")).rejects.toThrow(LoginFailedError);
```

Biome 의 `noFloatingPromises` 가 대부분 잡지만, **`expect.assertions(n)`** 을
함께 쓰면 "단언이 실제로 실행됐는지" 까지 고정됩니다. 비동기 실패 경로를
검증하는 테스트에는 넣으세요.

### 5.4 커버리지 90% 하한

`vitest.config.ts` 의 `coverage.thresholds` 가 **lines·statements·branches·
functions 를 전부 90%** 로 잡고 있습니다. 미달이면 실패입니다. 게이트를 낮추거나
`--coverage=false` 로 우회하지 마세요 — 테스트를 쓰세요.

### 5.5 그 밖의 규약

- **네트워크 금지.** 테스트는 절대 실제 요청을 보내지 않습니다. `tests/helpers.ts` 의
  `FakeSession` 과 `korail`/`makeKorail` 픽스처를 쓰세요.
- **응답 샘플은 `tests/payloads.ts` 에.** 필드 이름은 실제 응답에서 온 것이니
  지어내지 마세요. 새 페이로드가 필요하면 여기에 추가하고 공유합니다.
- **테스트 하나에 개념 하나.** 이름은 검증하는 **행동**을 말해야 합니다.
- **경계 동작을 테스트하세요**: 필드 누락, 빈 문자열, 자정을 넘기는 시각, 매진,
  예약대기, 로그인 실패. 이 코드베이스의 버그는 대부분 거기서 나왔습니다.
- **골든 벡터를 고정하세요.** DynaPath 토큰과 AES 결과는 서버가 바이트 단위로
  검증합니다. `tests/dynapath.test.ts` 가 고정 입력에 대한 토큰 전체를 박아 둬
  리팩터링 사고를 잡습니다. 이 값이 바뀌었다면 알고리즘이 바뀐 것이고, 그건 곧
  서버 거부입니다 — 되돌리세요.
- 단언에 이유가 필요하면 메시지를 붙이세요:
  `expect(session.calls).toHaveLength(1)` 위에 주석으로 "두 번째 호출은 캐시를 써야 합니다".

---

## 6. CI/CD

- **CI** (`.github/workflows/ci.yml`) — 린트·타입 검사, Node **20 · 22 · 24** 테스트,
  빌드·설치 확인(ESM `import` 과 CJS `require` 양쪽), Trivy 스캔.
- **CodeRabbit 리뷰** (`.coderabbit.yaml`) — main 으로 가는 PR 에 리뷰 코멘트를
  답니다. GitHub App 이라 워크플로가 아니고, **필수 체크가 아닙니다**
  (`request_changes_workflow: false`). 설정에 경로별 리뷰 지침이 들어 있고,
  `knowledge_base.code_guidelines` 로 이 파일과 `CONTRIBUTING.md`·스킬을 리뷰
  기준으로 읽습니다 — **규범을 고치면 리뷰 기준도 함께 바뀝니다.**
- **Release** (`.github/workflows/release.yml`) — `v*` 태그에서 동작. 태그에서 버전을
  뽑아 주입하고, 전 버전 게이트를 다시 돌린 뒤 npm(Trusted Publishing / provenance)에
  올리고 릴리스 노트를 자동 생성합니다.

에이전트가 알아야 할 것:

- **버전은 git 태그가 유일한 출처입니다.** `package.json` 의 `version` 은
  `0.0.0` 플레이스홀더이고 **손대지 않습니다** — 릴리스 워크플로가 태그에서 읽어
  `npm version <태그> --no-git-tag-version` 으로 주입한 뒤 배포합니다.
  `git tag v0.2.0` 이 곧 0.2.0 릴리스입니다. `tests/packaging.test.ts` 가
  `version` 이 `0.0.0` 인지, 얕은 체크아웃(`fetch-depth`)이 없는지 막습니다.
- **지원 Node 버전을 바꾸면 세 곳을 맞추세요**: `package.json` 의 `engines`,
  `tsconfig.json` 의 `target`/`lib`, 그리고 두 워크플로의 매트릭스.
  `tests/packaging.test.ts` 가 앞의 둘을 강제합니다.
- **`package.json` 의 `exports` 는 테스트가 지킵니다.** 듀얼 패키지 설정이 깨지면
  JS 사용자만 실패하는데, TS 로만 개발하면 그걸 못 봅니다.
- **워크플로를 수정했으면 `actionlint` 로 검증하세요** (shellcheck 도 함께 돕니다):
  ```bash
  pnpm dlx actionlint .github/workflows/*.yml
  ```
- **Trivy 가 HIGH/CRITICAL 에서 빌드를 막습니다.** 취약점이 뜨면 의존성을 올리세요.
  무시가 정당하면 `.trivyignore` 에 **만료일과 이유**를 함께 적으세요.
- 커버리지 게이트를 CI 에서만 끄는 식의 우회를 만들지 마세요.

---

## 7. 작업 흐름

1. 고치기 전에 **읽으세요.** 이 코드베이스에는 이유 있는 이상한 코드가 많습니다.
2. 요청받은 범위만 하세요. 지나가다 본 것을 같이 "정리"하지 마세요.
3. 외부 API 동작을 바꿨다면 페이로드 불변을 증명하세요.
4. `pnpm verify` 네 개 게이트 전부 통과.
5. 무엇을 바꿨고 무엇을 검증했는지 사실대로 보고하세요. 실패는 실패라고 말하세요.

### 커밋 · PR · 브랜치 이름

커밋 요약 줄 · PR 제목 · 브랜치 이름이 **같은 접두사 하나**를 씁니다. 형식은
`<PREFIX>: <요약>` 이고 본문에는 **왜** 를 적습니다.

`ADD:` 새로 넣음 · `FIX:` 버그 수정 · `REF:` 구조 리팩터링(동작 그대로) ·
`DEL:` 제거 · `DOCS:` 문서만 · `UPT:` 의존 패키지 버전 업데이트

`ADD:`·`DEL:` 은 **코드와 의존성**에 대한 것입니다. 문서와 에이전트 설정
(`.claude/` · `.agents/` · `.cursor/` · `.opencode/`)은 추가·수정·삭제 모두
`DOCS:` 입니다. `.github/workflows/` 는 실행되므로 코드로 봅니다.

브랜치는 `<접두사 소문자>/<요약-kebab>` (`fix/midnight-arrival`).

경계가 헷갈리는 경우, 릴리스 노트 라벨 대응, 커밋 전 점검 목록은 **`commit`
스킬**(`.claude/skills/commit/SKILL.md`)에 있습니다. 커밋하거나 PR 을 열기 전에
읽으세요.

### 하지 말 것

- 코레일 서버에 실제 요청 보내기 (역 마스터 같은 공개 조회를 **의도적으로** 확인할
  때만, 그것도 명시적 동의 아래. §3 의 TLS 실측도 여기 해당합니다).
- 자격증명·카드번호를 코드·테스트·로그에 넣기.
- 커버리지 게이트나 린트 규칙 낮추기.
- 검증 없이 "고쳤습니다" 라고 보고하기.
