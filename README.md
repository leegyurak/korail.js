<div align="center">

# 🚄 korail.js

**TypeScript · JavaScript 로 KTX 표를 조회하고 예매합니다**

코레일 스마트 예매(코레일톡) API 를 감싼 비공식 클라이언트

[![CI](https://github.com/leegyurak/korail.js/actions/workflows/ci.yml/badge.svg)](https://github.com/leegyurak/korail.js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/korail.js?color=CB3837&logo=npm&logoColor=white&cacheSeconds=10800)](https://www.npmjs.com/package/korail.js)
[![Node](https://img.shields.io/node/v/korail.js?color=5FA04E&logo=node.js&logoColor=white&cacheSeconds=10800)](https://www.npmjs.com/package/korail.js)
[![License](https://img.shields.io/npm/l/korail.js?color=green&cacheSeconds=10800)](LICENSE)

[빠른 시작](#빠른-시작) · [할 수 있는 것](#할-수-있는-것) · [API 레퍼런스](docs/reference.md) · [기여하기](CONTRIBUTING.md)

</div>

---

## 빠른 시작

```bash
npm install korail.js      # pnpm add korail.js / yarn add korail.js
```

**TypeScript · ESM**

```ts
import { Korail } from "korail.js";

const korail = await Korail.loggedIn("me@example.com", "password");
try {
  const trains = await korail.trains.search("서울", "부산", {
    departAfter: new Date("2026-04-01T09:00:00+09:00"),
  });
  trains.forEach((train) => console.log(String(train)));
} finally {
  await korail.close();
}
```

**JavaScript · CommonJS**

```js
const { Korail } = require("korail.js");

(async () => {
  const korail = await Korail.loggedIn("me@example.com", "password");
  try {
    const trains = await korail.trains.search("서울", "부산");
    trains.forEach((train) => console.log(String(train)));
  } finally {
    await korail.close();
  }
})();
```

```text
[KTX 101]  04/01 09:00~12:30  서울~부산  특실 가능, 일반실 가능 (3시간 30분)
[KTX 103]  04/01 10:00~13:30  서울~부산  특실 매진, 일반실 가능 (3시간 30분)
[KTX 105]  04/01 11:00~14:35  서울~부산  특실 가능, 일반실 매진 (3시간 35분)
```

타입 선언(`.d.ts`)이 패키지에 들어 있어 **TypeScript 사용자는 별도 `@types` 설치가
필요 없습니다.** ESM(`import`)과 CJS(`require`)를 모두 지원합니다.

> [!WARNING]
> 코레일과 아무 관련 없는 **비공식** 라이브러리입니다. 문서화되지 않은 앱 API 를 쓰기
> 때문에 코레일이 앱을 바꾸면 예고 없이 멈출 수 있습니다. 이용 약관과 관련 법령을
> 지키는 것은 사용자 책임이며, 과도한 자동 요청은 계정 제재로 이어질 수 있습니다.

> [!CAUTION]
> **Node.js 전용입니다.** 브라우저에서는 동작하지 않습니다 — CORS 로 막히고, TLS
> 지문을 맞출 수 없으며, 무엇보다 **자격증명이 사용자에게 그대로 노출**됩니다.
> 네이티브 바이너리에 의존하므로 Cloudflare Workers · Deno Deploy 같은 엣지
> 런타임에서도 쓸 수 없습니다.

---

## 할 수 있는 것

### 표 예매하고 결제하기

```ts
import { AdultPassenger, Card, ChildPassenger } from "korail.js";

const trains = await korail.trains.search("서울", "부산", {
  departAfter: new Date("2026-04-01T09:00:00+09:00"),
  passengers: [new AdultPassenger(2), new ChildPassenger(1)],
});

const reservation = await korail.reservations.create(trains[0]);
console.log(String(reservation));
// [KTX 101] … 119600원(3석), 구입기한 4월 1일 09:20

await korail.reservations.pay(
  reservation,
  new Card({ number: "1234567812345678", password: "12", verifyNumber: "900101", expire: "2812" }),
);
```

<details>
<summary><b>취소표 기다리기</b></summary>

```ts
import { NoResultsError, PastDepartureError } from "korail.js";

const departAfter = new Date("2026-04-01T09:00:00+09:00");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

while (true) {
  try {
    const trains = await korail.trains.search("서울", "부산", { departAfter });
    await korail.reservations.create(trains[0]);
    break;
  } catch (error) {
    if (error instanceof NoResultsError) {
      await sleep(30_000); // 서버에 부담 주지 않게 넉넉히 쉬세요
      continue;
    }
    if (error instanceof PastDepartureError) break; // 열차가 이미 떠났습니다
    throw error;
  }
}
```

</details>

<details>
<summary><b>매진일 때 예약대기 걸기</b></summary>

```ts
const trains = await korail.trains.search("서울", "부산", { includeWaitingList: true });
const waitable = trains.filter((t) => !t.hasSeat() && t.hasWaitingList());

const reservation = await korail.reservations.create(waitable[0]);
console.log(reservation.isWaiting); // true
```

</details>

<details>
<summary><b>인근역에서 출발·도착하는 열차까지 보기</b></summary>

앱의 "인접역" 옵션입니다. 용산 → 대전을 찾으면 서울 → 대전 · 용산 → 서대전 편도
함께 나옵니다. 직통이 없는 구간은 이걸 켜지 않으면 조회할 방법이 없습니다.

```ts
const trains = await korail.trains.search("용산", "대전", { includeNearbyStations: true });

trains.forEach((t) => console.log(t.depName, "→", t.arrName));
// 서울 → 대전 / 용산 → 서대전 / 서울 → 서대전 …

// 출발은 용산에서만 하고 싶다면 결과에서 고르면 됩니다
const fromYongsan = trains.filter((t) => t.depName === "용산");
```

결과가 **더해지는** 것이 아니라 후보가 넓어지는 것이라, 켜면 인근역 편이 시간순으로
끼어들며 뒤쪽 직통편을 밀어낼 수 있습니다. 그래서 기본값은 꺼짐입니다.

</details>

<details>
<summary><b>내 예약·승차권 보기</b></summary>

```ts
for (const reservation of await korail.reservations.all()) {
  console.log(reservation.train.depName, "→", reservation.train.arrName, reservation.price);
}

for (const ticket of await korail.tickets.all()) {
  console.log(ticket.ticketNo, ticket.carNo, ticket.seatNo);
  await korail.tickets.refund(ticket); // 환불
}
```

</details>

<details>
<summary><b>기기 프로파일 고정하기</b> — 여러 번 실행한다면</summary>

실행할 때마다 다른 기기인 척하면 오히려 부자연스럽습니다. 한 번 뽑아 `id` 를
저장해 두고 계속 쓰세요.

```ts
import { Korail, profileById, randomProfile } from "korail.js";

const profile = profileById(savedId) ?? randomProfile();
const korail = new Korail({ deviceProfile: profile });
```

</details>

---

## 알아두면 좋은 것

|                     |                                                                             |
| ------------------- | --------------------------------------------------------------------------- |
| **전부 `async`**     | 모든 공개 메서드가 `Promise` 를 돌려줍니다. `await` 을 빠뜨리지 마세요.         |
| **역은 이름으로**     | `"서울역"` 이 아니라 `"서울"`. 오타면 요청 전에 막고 비슷한 역을 알려줍니다.      |
| **시각은 항상 KST**   | 실행 머신의 타임존과 무관하게 한국시간으로 해석·표시됩니다.                      |
| **지난 시각은 거부**   | 서버가 과거에도 빈 결과만 줘서 "떠난 열차"와 "열차 없음"이 구분되지 않습니다.      |
| **실패는 예외로**     | `cancel()` · `pay()` 는 성공 시 아무것도 반환하지 않습니다.                    |
| **응답 모델은 불변**   | `Object.freeze` 돼 있습니다. 고치려 들면 strict 모드에서 예외가 납니다.         |

```ts
import { KorailApiError, SoldOutError } from "korail.js";

try {
  await korail.reservations.create(train);
} catch (error) {
  if (error instanceof SoldOutError) {
    // 매진 — 다음 열차로
  } else if (error instanceof KorailApiError) {
    console.log(error.message, error.code); // 코레일이 준 메시지와 코드
  } else {
    throw error;
  }
}
```

에러 계층은 최상위가 `KorailError`, 서버가 실패로 응답한 것이 `KorailApiError`
입니다. 라이브러리에서 난 실패를 전부 잡으려면 `KorailError` 로 잡으세요.

---

## 문서

|                                                       |                                              |
| ----------------------------------------------------- | -------------------------------------------- |
| 📖 [**API 레퍼런스**](docs/reference.md)                  | 전체 메서드 · 모델 · 옵션 · 에러                        |
| 🤝 [기여 가이드](CONTRIBUTING.md)                          | 개발 환경, 테스트 규칙, PR 절차                         |
| 🏛 [아키텍처 규약](AGENTS.md)                               | 계층 구조, 외부 API 불변식                             |
| 🤖 [에이전트 설정](.agents/README.md)                       | Codex · Claude Code · Pi · Cursor · OpenCode |
| 🐍 [pykorail](https://github.com/leegyurak/pykorail)  | 파이썬용 자매 프로젝트                                  |
| 🔐 [보안 정책](SECURITY.md) · [행동 강령](CODE_OF_CONDUCT.md) |                                              |

---

## 자주 묻는 것

<details>
<summary><b>pykorail 과 무슨 관계인가요?</b></summary>

korail.js 는 [pykorail](https://github.com/leegyurak/pykorail) 과 같은 코레일
스마트 앱 API 를 감싸는 자매 프로젝트입니다. 파이썬을 쓰신다면 그쪽을 보세요.

**두 패키지는 각자 유지보수됩니다.** 코레일이 앱을 바꾸면 양쪽에 각각 반영되며,
버전과 기능 범위가 항상 같지는 않습니다. API 모양도 각 언어의 관용을 따릅니다:

| | pykorail | korail.js |
| --- | --- | --- |
| 호출 방식 | 동기 | 전부 `async` |
| 에러 최상위 | `PykorailError` | `KorailError` |
| 서버 실패 에러 | `KorailError` | `KorailApiError` |
| 네이밍 | `snake_case` | `camelCase` |

</details>

<details>
<summary><b>로그인이 안 됩니다</b></summary>

휴대폰 번호로 로그인한다면 **하이픈을 넣어야 합니다** (`010-1234-5678`).
빠뜨리면 회원번호로 조회돼 엉뚱하게 실패합니다.

코레일은 TLS 지문을 볼 수 있습니다. 이 패키지는 그것을 맞추기 위해 네이티브
바이너리를 쓰는데, 그걸 불러오지 못하면 내장 `fetch` 로 폴백하면서 경고를 남깁니다.
콘솔에 그 경고가 찍혔는지 확인해 주세요. (2026-09 실측 기준 **조회**는 양쪽 다
통과하지만, 로그인 경로는 확인되지 않았습니다.)

</details>

<details>
<summary><b>브라우저에서 쓸 수 있나요?</b></summary>

아니요. CORS 로 막히고, TLS 지문을 맞출 수 없으며, **자격증명이 사용자에게 그대로
노출됩니다.** 서버 사이드에서만 쓰세요. 같은 이유로 Cloudflare Workers ·
Deno Deploy 같은 엣지 런타임에서도 동작하지 않습니다.

</details>

<details>
<summary><b>SRT 도 되나요?</b></summary>

아니요. SRT(수서고속철도)는 다른 회사의 다른 시스템입니다.

</details>

<details>
<summary><b>어제까지 되던 게 오늘 안 됩니다</b></summary>

코레일이 서버를 바꿨을 수 있습니다.
[API 변경 이슈](https://github.com/leegyurak/korail.js/issues/new?template=external_api_change.yml)
로 알려주시면 대응하겠습니다. **가장 도움이 되는 기여입니다.**

</details>

<details>
<summary><b>예매가 확실히 되나요?</b></summary>

이 라이브러리는 앱과 같은 요청을 보낼 뿐이고, 좌석 배정은 코레일 서버가 합니다.
명절 예매처럼 경쟁이 심한 상황에서 성공을 보장하지 않습니다.

</details>

---

## 개발

Node 20.19 이상 (20 · 22 · 24 에서 테스트합니다). 패키지 매니저는 **pnpm** 입니다.

```bash
pnpm install
pnpm verify      # format → lint → typecheck → test+coverage
```

네 개를 전부 통과해야 합니다. 커버리지 하한 90%.

기여를 환영합니다 — [`CONTRIBUTING.md`](CONTRIBUTING.md) 부터 보세요. 새 엔드포인트는
**공식 코레일톡+ APK 를 디컴파일해 경로와 폼 필드를 확인한 뒤에만** 추가합니다.

### 릴리스

버전의 유일한 출처는 **git 태그**입니다. `package.json` 의 `version` 은 `0.0.0`
플레이스홀더이고 손대지 않습니다.

```bash
git tag v0.2.0 && git push origin v0.2.0
```

태그를 밀면 버전 주입 → 전 버전 게이트 → 보안 스캔 → 빌드 → npm 업로드
(provenance 포함) → 릴리스 노트 생성이 자동으로 돕니다.

---

<div align="center">

<sub>MIT License · 코레일과 무관한 비공식 프로젝트</sub>

</div>
