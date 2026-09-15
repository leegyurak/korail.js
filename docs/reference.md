# API 레퍼런스

korail.js 의 공개 표면 전체입니다. **모든 공개 메서드는 `async`** 이고 `Promise` 를
돌려줍니다 — `await` 을 빠뜨리지 마세요.

각 항목에 TypeScript 시그니처와 JavaScript(CommonJS) 예제를 함께 실었습니다.
타입 선언(`.d.ts`)이 패키지에 들어 있어 TS 사용자는 별도 `@types` 설치가 필요 없습니다.

> **비공식 라이브러리입니다.** 문서화되지 않은 앱 API 를 쓰기 때문에 코레일이 앱을
> 바꾸면 예고 없이 멈출 수 있습니다.

---

## 목차

- [클라이언트](#클라이언트) — `Korail`
- [`korail.stations`](#korailstations) — 역 마스터 조회 · 이름 검증
- [`korail.trains`](#korailtrains) — 시간표 조회
- [`korail.reservations`](#korailreservations) — 예매 · 결제 · 취소
- [`korail.tickets`](#korailtickets) — 승차권 조회 · 환불
- [모델](#모델) — `Train` · `Reservation` · `Ticket` · `Seat` · `Station` · `RefundFee` · `Card`
- [승객](#승객)
- [옵션](#옵션) — `TrainType` · `ReserveOption`
- [에러](#에러)
- [기기 프로파일](#기기-프로파일)
- [NetFunnel 대기열](#netfunnel-대기열)
- [전송 계층 갈아끼우기](#전송-계층-갈아끼우기)

---

## 클라이언트

### `Korail`

```ts
class Korail {
  constructor(options?: KorailOptions);

  static loggedIn(korailId: string, korailPw: string, options?: KorailOptions): Promise<Korail>;

  login(korailId: string, korailPw: string): Promise<void>;
  logout(): Promise<void>;
  close(): Promise<void>;

  readonly stations: StationResource;
  readonly trains: TrainResource;
  readonly reservations: ReservationResource;
  readonly tickets: TicketResource;

  readonly deviceProfile: DeviceProfileLike | undefined;
  get logined(): boolean;
  get membershipNumber(): string | undefined;
  get name(): string | undefined;
  get email(): string | undefined;
  get phoneNumber(): string | undefined;
  verbose: boolean;
}

interface KorailOptions {
  verbose?: boolean;              // 응답 본문을 console.debug 로 흘립니다 (개발용)
  deviceProfile?: DeviceProfileLike;
  validateStations?: boolean;     // 기본 true
  sessionFactory?: SessionFactory; // 전송 구현 교체 (테스트·고급 용도)
}
```

**생성자는 네트워크를 건드리지 않습니다.** 객체를 만드는 일과 로그인하는 일은
별개입니다. 한 줄로 끝내려면 `Korail.loggedIn()` 을 쓰세요 — 로그인에 실패하면
연결을 닫고 에러를 다시 올리므로, 로그인 못 한 클라이언트가 소켓만 붙든 채
돌아다니지 않습니다.

```ts
import { Korail } from "@devgyurak/korail.js";

const korail = await Korail.loggedIn("me@example.com", "password");
try {
  const trains = await korail.trains.search("서울", "부산");
} finally {
  await korail.close();
}
```

```js
const { Korail } = require("@devgyurak/korail.js");

(async () => {
  const korail = new Korail();
  await korail.login("me@example.com", "password");
  try {
    console.log(korail.name, korail.membershipNumber);
  } finally {
    await korail.close();
  }
})();
```

#### `login(korailId, korailPw)`

아이디는 **이메일 · 휴대폰 번호 · 회원번호** 셋 다 됩니다. 휴대폰 번호는
**하이픈이 필요합니다** (`010-1234-5678`) — 빠뜨리면 회원번호로 조회돼 "비밀번호가
틀렸다"는 엉뚱한 응답이 오므로 요청 전에 막습니다.

**실패는 전부 예외입니다 — 성공 여부를 반환하지 않습니다.** 빈 자격증명, 하이픈 없는
번호, 암호화 키 발급 실패, 서버의 자격증명 거부가 모두 `LoginFailedError` 하나로
올라옵니다.

던지는 에러: `LoginFailedError`

#### `logout()` · `close()`

`logout()` 은 **서버 세션**을 끊고, `close()` 는 **HTTP 연결**을 정리합니다. 수명이
다릅니다 — 같은 클라이언트로 다른 계정에 다시 로그인하려면 연결이 살아 있어야
하므로 `logout()` 은 연결을 닫지 않습니다.

---

## `korail.stations`

```ts
class StationResource {
  all(refresh?: boolean): Promise<Station[]>;
  names(): Promise<Set<string>>;
  find(name: string): Promise<Station | undefined>;
  ensureExist(...names: string[]): Promise<void>;
}
```

역 목록은 거의 바뀌지 않고 이름 검증에도 쓰이므로 **리소스 수명 동안 캐시**합니다.
로그인 없이도 부를 수 있는 공개 조회입니다.

```ts
const stations = await korail.stations.all();
console.log(stations.slice(0, 3).map(String));
// ['서울(0001)', '용산(0104)', '광명(0111)']

const seoul = await korail.stations.find("서울");
console.log(seoul?.code, seoul?.isMajor); // '0001' true
```

`ensureExist()` 는 역 마스터에 없는 이름이면 요청 전에 막고 **오타 후보**를 함께
알려 줍니다. 서버는 없는 역에도 그냥 빈 결과를 주기 때문에, 그러지 않으면 오타와
"그 시간대에 열차가 없음" 이 구분되지 않습니다.

던지는 에러: `StationNotFoundError`

---

## `korail.trains`

```ts
class TrainResource {
  search(dep: string, arr: string, options?: TrainSearchOptions): Promise<Train[]>;
  validateStations: boolean;
}

interface TrainSearchOptions {
  departAfter?: Date;              // 생략하면 지금
  trainType?: TrainTypeCode;       // 생략하면 TrainType.ALL
  passengers?: readonly Passenger[]; // 생략하면 어른 1명
  includeNoSeats?: boolean;        // 매진 열차도 포함
  includeWaitingList?: boolean;    // 예약대기 가능 열차도 포함
  includeNearbyStations?: boolean; // 앱의 "인접역"
}
```

역은 **이름**으로 지정합니다 (`"서울역"` 이 아니라 `"서울"`).

`departAfter` 는 절대 시각(`Date`)입니다. 실행 머신의 타임존과 무관하게 **KST 로
환산해** 보내므로, 오프셋을 명시하는 편이 안전합니다:
`new Date("2026-04-01T09:00:00+09:00")`.

```ts
import { AdultPassenger, ChildPassenger, TrainType } from "@devgyurak/korail.js";

const trains = await korail.trains.search("서울", "부산", {
  departAfter: new Date("2026-04-01T09:00:00+09:00"),
  passengers: [new AdultPassenger(2), new ChildPassenger(1)],
});
trains.forEach((train) => console.log(String(train)));

// KTX 만, 매진 포함해서 전부
await korail.trains.search("서울", "부산", {
  trainType: TrainType.KTX,
  includeNoSeats: true,
});

// 예약대기라도 잡고 싶을 때
await korail.trains.search("서울", "부산", { includeWaitingList: true });
```

```js
const { Korail, AdultPassenger } = require("@devgyurak/korail.js");

(async () => {
  const korail = await Korail.loggedIn("me@example.com", "password");
  const trains = await korail.trains.search("서울", "부산", {
    passengers: [new AdultPassenger(2)],
  });
  console.log(trains.length);
  await korail.close();
})();
```

### 인근역 포함 조회

`includeNearbyStations: true` 는 앱의 "인접역" 옵션입니다. 용산 → 대전을 찾으면
서울 → 대전 · 용산 → 서대전 도 함께 나옵니다. 직통이 없는 구간은 이걸 켜지 않으면
조회할 방법이 없습니다.

결과가 **더해지는** 것이 아니라 후보가 넓어지는 것이라, 켜면 인근역 편이 시간순으로
끼어들며 뒤쪽 직통편을 밀어낼 수 있습니다. 그래서 기본값은 꺼짐입니다.

```ts
const trains = await korail.trains.search("용산", "대전", { includeNearbyStations: true });
const fromYongsan = trains.filter((train) => train.depName === "용산");
```

### 지난 시각은 거부합니다

서버는 과거 시각에도 그냥 빈 결과를 줘서 "이미 떠난 열차" 와 "그 시간대에 열차가
없음" 이 구분되지 않습니다. 취소표를 기다리는 루프가 출발 시각을 넘겨도 조용히 계속
도는 상황을 막으려고 요청 전에 걸러냅니다 (1분 유예).

던지는 에러: `StationNotFoundError` · `PastDepartureError` · `NoResultsError`

---

## `korail.reservations`

```ts
class ReservationResource {
  all(): Promise<Reservation[]>;
  find(rsvId: string | undefined): Promise<Reservation | undefined>;
  seats(rsvId?: string): Promise<{ seats: Seat[]; wctNo: string | undefined }>;
  create(
    train: Train,
    passengers?: readonly Passenger[],
    option?: ReserveOptionCode,
  ): Promise<Reservation>;
  pay(reservation: Reservation, card: Card): Promise<void>;
  cancel(reservation: Reservation): Promise<void>;
}
```

`create()` 는 좌석이 없고 예약대기가 열려 있는 열차면 **대기를 겁니다.**
`pay()` · `cancel()` 은 성공 시 아무것도 반환하지 않고, 실패하면 던집니다.

```ts
import { Card, ReserveOption } from "@devgyurak/korail.js";

const reservation = await korail.reservations.create(trains[0], undefined, ReserveOption.SPECIAL_FIRST);
console.log(String(reservation));
// [KTX 101]  04/01 09:00~12:30  서울~부산 …, 119600원(3석), 구입기한 3월 25일 14:30

await korail.reservations.pay(
  reservation,
  new Card({ number: "1234567812345678", password: "12", verifyNumber: "900101", expire: "2812" }),
);
```

```js
(async () => {
  for (const reservation of await korail.reservations.all()) {
    console.log(reservation.rsvId, reservation.price, reservation.isWaiting);
    await korail.reservations.cancel(reservation);
  }
})();
```

`all()` 은 각 예약의 좌석 상세까지 채워서 돌려주므로 예약 수만큼 추가 요청이
나갑니다. 하나만 필요하면 `find()` 를 쓰세요 — 그쪽은 요청 2회로 끝납니다.

던지는 에러: `KorailApiError`(`SoldOutError` 등) · `TypeError`(잘못된 인자 타입)

---

## `korail.tickets`

```ts
class TicketResource {
  all(): Promise<Ticket[]>;
  refundFee(ticket: Ticket): Promise<RefundFee>;
  refund(ticket: Ticket): Promise<void>;
}
```

목록 응답에는 실제 좌석번호가 없어 승차권마다 상세를 한 번 더 조회하고, **좌석까지
확정한 뒤** 승차권 객체를 만듭니다.

```ts
for (const ticket of await korail.tickets.all()) {
  console.log(ticket.ticketNo, ticket.carNo, ticket.seatNo);

  const fee = await korail.tickets.refundFee(ticket); // 조회만 합니다
  if (fee.refundable) {
    console.log(String(fee)); // '53,400원 환불 (수수료 5,600원)'
    await korail.tickets.refund(ticket);
  }
}
```

`refundFee()` 는 **조회일 뿐 환불하지 않습니다.** 수수료는 출발 시각까지 남은
시간에 따라 달라지므로 조회한 값과 실제 환불 시점의 값이 다를 수 있습니다.

던지는 에러: `KorailApiError`

---

## 모델

응답 모델은 전부 **불변**입니다 — `Object.freeze` 돼 있어 고치려 들면 strict 모드에서
예외가 납니다. 만드는 길은 `fromResponse()` 하나뿐이고, 좌석 같은 부속 데이터는
생성 시점에 이미 채워져 있습니다. 반쯤 채워진 객체는 존재하지 않습니다.

`Ticket` 과 `Reservation` 은 열차를 **상속하지 않고 참조**합니다
(`ticket.train.depName`).

### `Train` (← `Schedule`)

```ts
class Schedule {
  readonly trainType: string;      // h_trn_clsf_cd
  readonly trainTypeName: string;  // 'KTX'
  readonly trainGroup: string;
  readonly trainNo: string;
  readonly delayTime: string;
  readonly depName: string;
  readonly depCode: string;
  readonly depDate: string;        // 'YYYYMMDD'
  readonly depTime: string;        // 'HHMMSS'
  readonly arrName: string;
  readonly arrCode: string;
  readonly arrDate: string;
  readonly arrTime: string;
  readonly runDate: string;

  get durationMinutes(): number | undefined; // 자정을 넘기면 보정합니다
  get durationText(): string | undefined;    // '3시간 30분'
  summary(): string;
}

class Train extends Schedule {
  readonly reservePossible: string;
  readonly reservePossibleName: string;
  readonly specialSeat: string;
  readonly generalSeat: string;
  readonly waitReserveFlag: number; // -1 이면 예약대기 미적용

  hasSpecialSeat(): boolean;
  hasGeneralSeat(): boolean;
  hasSeat(): boolean;
  hasWaitingList(): boolean;
}
```

날짜·시각은 코레일이 주는 **문자열 그대로**입니다 (`Date` 로 바꾸지 않습니다 —
`new Date("20260401")` 의 파싱은 구현 의존이라 조용히 틀립니다).

### `Reservation`

```ts
class Reservation {
  readonly train: Train;
  readonly rsvId: string;
  readonly seatNoCount: number;
  readonly buyLimitDate: string;
  readonly buyLimitTime: string;
  readonly price: number;
  readonly journeyNo: string;
  readonly journeyCnt: string;
  readonly rsvChgNo: string;
  readonly seats: readonly Seat[];
  readonly wctNo: string | undefined;

  get isWaiting(): boolean; // 실좌석이 아니라 예약대기
}
```

### `Ticket`

```ts
class Ticket {
  readonly train: Train;
  readonly seatNo: string;
  readonly seatNoEnd: string | undefined;
  readonly seatNoCount: number;
  readonly carNo: string;
  readonly buyerName: string;
  readonly saleDate: string;
  readonly pnrNo: string;
  readonly price: number;
  readonly saleInfo1: string; // 환불에 되돌려 줘야 하는 원권 식별자 4종
  readonly saleInfo2: string;
  readonly saleInfo3: string;
  readonly saleInfo4: string;

  get ticketNo(): string; // 네 식별자를 하이픈으로 이은 승차권번호
}
```

### `Seat`

```ts
class Seat {
  readonly car: string;
  readonly seat: string;
  readonly seatType: string;      // '일반실' · '특실'
  readonly passengerType: string; // '어른' · '어린이'
  readonly price: number;
  readonly originalPrice: number;
  readonly discount: number;

  get isWaiting(): boolean; // 좌석번호가 비면 예약대기 자리
}
```

### `Station`

```ts
class Station {
  readonly code: string;
  readonly name: string;
  readonly latitude: number | undefined;
  readonly longitude: number | undefined;
  readonly group: string;
  readonly major: string;
  readonly popupType: string;
  readonly popupMessage: string;

  get isMajor(): boolean;
}
```

### `RefundFee`

```ts
class RefundFee {
  readonly fee: number;           // 환불 수수료(원)
  readonly amount: number;        // 실제로 돌려받는 금액(원)
  readonly usableMileage: number;
  readonly refundable: boolean;   // false 면 amount 는 의미가 없습니다
  readonly periodCode: string;    // tk_ret_tms_dv_cd
}
```

### `Card`

```ts
class Card {
  constructor(fields: {
    number: string;       // 하이픈 없이
    password: string;     // 앞 2자리
    verifyNumber: string; // 개인=생년월일 YYMMDD · 법인=사업자등록번호
    expire: string;       // YYMM
    installment?: number; // 0 = 일시불
    isCorporate?: boolean;
  });

  get authType(): string; // 'J'=개인 · 'S'=법인
}
```

`expire` 와 `verifyNumber` 는 앞자리 0 이 의미를 가지므로 **문자열**입니다
(`"0412"` 를 숫자로 넘기면 `412` 가 됩니다).

**카드번호는 뒤 4자리만 노출됩니다.** `console.log(card)` 와
`JSON.stringify(card)` 양쪽에서 마스킹되므로 로그·스택트레이스에 전체가 찍히지
않습니다.

```ts
const card = new Card({ number: "1234567812345678", password: "12", verifyNumber: "900101", expire: "2812" });
console.log(String(card));
// Card(number="****5678", installment=0, isCorporate=false)
```

---

## 승객

```ts
class Passenger {
  constructor(count?: number, options?: {
    discountType?: string;
    card?: string;
    cardNo?: string;
    cardPw?: string;
  });

  readonly count: number;
  readonly discountType: string;
  get typeCode(): string;

  static reduce(passengers: readonly Passenger[]): Passenger[];
}
```

| 클래스 | 유형 코드 | 기본 할인 |
| --- | --- | --- |
| `AdultPassenger` | `1` | `000` |
| `ChildPassenger` | `3` | `000` |
| `ToddlerPassenger` | `3` | `321` |
| `SeniorPassenger` | `1` | `131` |
| `Disability1To3Passenger` | `1` | `111` |
| `Disability4To6Passenger` | `1` | `112` |

"유형 + 할인 + 등록카드" 가 같은 승객은 하나로 합쳐 보냅니다 — 코레일 폼이 승객
블록을 인덱스로 받기 때문에, 같은 조건을 두 블록으로 쪼개 보낼 이유가 없습니다.

```ts
import { AdultPassenger, ChildPassenger, Passenger } from "@devgyurak/korail.js";

const merged = Passenger.reduce([new AdultPassenger(2), new ChildPassenger(1), new AdultPassenger(1)]);
console.log(merged.map(String));
// ['AdultPassenger(count=3, discountType="000")', 'ChildPassenger(count=1, discountType="000")']
```

인원이 0 이하인 항목은 버려집니다.

---

## 옵션

`enum` 이 아니라 `as const` 객체 + 유니온 타입입니다 — 이 값들은 폼에 그대로 실려
나가는데 `enum` 은 런타임 객체를 만들어 트리셰이킹을 막습니다.

### `TrainType`

```ts
const TrainType = {
  KTX: "100",
  KTX_SANCHEON: "100",  // KTX 와 같은 코드 — 별칭이지 오타가 아닙니다
  SAEMAEUL: "101",
  ITX_SAEMAEUL: "101",
  MUGUNGHWA: "102",
  NURIRO: "102",
  TONGGUEN: "103",
  ITX_CHEONGCHUN: "104",
  AIRPORT: "105",
  ALL: "109",
} as const;

type TrainTypeCode = (typeof TrainType)[keyof typeof TrainType];
```

### `ReserveOption`

```ts
const ReserveOption = {
  GENERAL_FIRST: "GENERAL_FIRST",   // 기본값 — 일반실 우선, 없으면 특실
  GENERAL_ONLY: "GENERAL_ONLY",
  SPECIAL_FIRST: "SPECIAL_FIRST",
  SPECIAL_ONLY: "SPECIAL_ONLY",
} as const;
```

---

## 에러

```text
KorailError                  라이브러리 유래 실패 전부
├── KorailApiError           코레일이 strResult=FAIL 로 응답 (code 를 갖습니다)
│   ├── NeedToLoginError     P058
│   ├── NoResultsError       P100, WRG000000, WRD000061, WRT300005
│   ├── SoldOutError         IRT010110, ERR211161
│   └── LoginFailedError     로그인 실패 전부 (코드 매핑 없음)
├── NetFunnelError           대기열 게이트 실패
├── StationNotFoundError     요청 전 클라이언트 검증 실패
├── PastDepartureError       이미 지난 시각으로 조회
└── TransportError           세션 생성 실패 / 비 JSON 응답
```

라이브러리에서 난 실패를 전부 잡으려면 `KorailError` 로 잡으세요. 서버가 준 코드가
필요하면 `KorailApiError` 의 `code` 를 보세요.

```ts
import { KorailApiError, NoResultsError, SoldOutError } from "@devgyurak/korail.js";

try {
  await korail.reservations.create(train);
} catch (error) {
  if (error instanceof SoldOutError) {
    // 매진 — 다음 열차로
  } else if (error instanceof KorailApiError) {
    console.log(error.message, error.code);
  } else {
    throw error;
  }
}
```

`StationNotFoundError` 는 오타 후보를 함께 담습니다:

```ts
try {
  await korail.trains.search("서울역", "부산");
} catch (error) {
  console.log(error.message);
  // 존재하지 않는 역입니다: "서울역" (혹시 "서울"?)
}
```

---

## 기기 프로파일

```ts
function profileById(profileId: string | null | undefined): DeviceProfile | undefined;
function randomProfile(random?: () => number): DeviceProfile;
function dalvikUserAgent(profile: DeviceProfileLike): string;

const DEVICE_PROFILES: readonly DeviceProfile[]; // 100개
```

프로파일을 주입하면 User-Agent 와 DynaPath 서명이 **같은 기기**를 가리키도록 함께
바뀝니다. 둘 중 하나만 바꾸면 그 불일치가 곧 탐지 신호입니다.

**한 번 뽑은 프로파일은 계속 재사용하세요** — 실행마다 다른 폰인 척하는 것이 오히려
부자연스럽습니다.

```ts
import { Korail, profileById, randomProfile } from "@devgyurak/korail.js";

const profile = profileById(savedId) ?? randomProfile(); // id 를 저장해 두고 복원
const korail = new Korail({ deviceProfile: profile });

console.log(profile);
// { id: 's25ultra-a16', marketing: 'Galaxy S25 Ultra', model: 'SM-S938N',
//   android: '16', buildId: 'BP2A.250605.031' }
```

직접 만든 객체도 `model` · `android` · `buildId` 세 필드만 있으면 넘길 수 있습니다
(`DeviceProfileLike`). 다만 실재하지 않는 조합은 그 자체가 탐지 신호가 될 수 있습니다.

---

## NetFunnel 대기열

```ts
class NetFunnelHelper {
  constructor(options?: { sessionFactory?: SessionFactory; pollIntervalMs?: number });
  run(): Promise<string | undefined>;
  clear(): void;
  close(): Promise<void>;
}
```

접속 폭주 때 코레일 앞단에 서는 대기열(`nf.letskorail.com`)입니다.

**`Korail` 은 이것을 쓰지 않습니다 — 의도된 것입니다.** 대기열은 코레일 **웹
프런트**가 통과하는 관문이고, 이 패키지가 쓰는 스마트 앱 엔드포인트
(`smart.letskorail.com`)는 대기열 뒤에 있지 않습니다. 명절 예매처럼 앱 경로에도
대기열이 붙는 상황을 만나면 직접 꺼내 쓸 수 있도록 공개 유틸리티로 남겨 둡니다.

```ts
import { NetFunnelHelper } from "@devgyurak/korail.js";

const helper = new NetFunnelHelper();
const key = await helper.run(); // 통과할 때까지 폴링합니다
await helper.close();
```

던지는 에러: `NetFunnelError`

---

## 전송 계층 갈아끼우기

```ts
type SessionFactory = (headers: Readonly<Record<string, string>>) => HttpSession;

interface HttpSession {
  get(url: string, options?: RequestOptions): Promise<HttpResponse>;
  post(url: string, options?: RequestOptions): Promise<HttpResponse>;
  close(): Promise<void>;
}
```

기본 전송은 `node-tls-client` 입니다. 코레일 서버가 TLS 지문을 보기 때문에 네이티브
바이너리를 쓰는 구현이 필요합니다.

> [!NOTE]
> **2026-09-15 실측: 조회 경로는 통과합니다.** 공개 조회(`stationdata`)와 DynaPath
> 서명 경로(`ScheduleView`) 둘 다 실서버가 받아들였습니다. 같은 요청이 Node 기본
> 지문(`fetch`)으로도 통과해, 이 엔드포인트들은 지문으로 막고 있지 않습니다.
>
> **로그인 엔드포인트는 아직 미검증입니다** — 자격증명이 필요해 확인하지 못했습니다.
> 조회가 되니 로그인도 된다고 단정하지 마세요. 자세한 것은 [`AGENTS.md` §3](../AGENTS.md).

`node-tls-client` 를 불러오지 못하면 **내장 `fetch` 로 폴백하고 크게 경고합니다.**
pykorail 이 `curl_cffi` 를 못 쓸 때 `requests` 로 내려앉는 것과 같은 자리입니다.
실측상 **조회는 폴백으로도 통과**하지만(2026-09-15), 로그인은 확인되지 않았습니다.

### 네이티브 바이너리 — 배포 전에 알아 둘 것

`node-tls-client` 는 설치 시점이 아니라 **첫 요청에** 12MB 짜리 공유 라이브러리를
GitHub 릴리스에서 `os.tmpdir()` 로 내려받습니다.

> [!WARNING]
> **내려받기에 실패하면 그 라이브러리가 `process.exit(1)` 로 프로세스를 종료합니다.**
> korail.js 의 `fetch` 폴백은 *모듈 임포트* 실패만 막아 주므로 이 경우는 잡을 수
> 없습니다. 오프라인·에어갭 환경이라면 배포 이미지에 파일을 미리 넣거나, 배포
> 단계에서 요청을 한 번 흘려 워밍업하세요.

임시 디렉터리가 비워지면 다시 받습니다 — 서버리스나 매번 새로 뜨는 CI 러너에서는
실행마다 내려받는다는 뜻입니다.

`sessionFactory` 로 다른 구현을 끼울 수 있습니다 — 테스트에서 네트워크 없이 돌리거나,
프록시를 태우거나, 다른 TLS 라이브러리로 바꿀 때 씁니다.

```ts
const korail = new Korail({
  sessionFactory: (headers) => ({
    async get(url, options) { /* ... */ return { text: "{}" }; },
    async post(url, options) { /* ... */ return { text: "{}" }; },
    async close() {},
  }),
});
```

폼 인코딩은 파이썬 `urllib.parse.urlencode` 와 **바이트 단위로 같습니다**
(`encodeForm`). `~` 와 `*` 처럼 두 언어의 safe 문자 집합이 갈리는 경계를 테스트로
고정해 두었습니다.

---

<sub>MIT License · 코레일과 무관한 비공식 프로젝트</sub>
