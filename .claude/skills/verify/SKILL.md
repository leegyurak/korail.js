---
name: verify
description: korail.js 의 전체 품질 게이트를 순서대로 실행하고 실패를 진단합니다. 작업을 끝내기 전, 커밋 전, 또는 "검증해줘"·"게이트 돌려줘"·"통과하는지 봐줘" 라고 할 때 사용하세요. 포맷 → 린트 → 타입 검사 → 테스트+커버리지 순서로 돌리고 각 실패의 흔한 원인을 알려줍니다.
---

# 게이트 실행

**네 개를 전부 통과해야 작업이 끝난 것입니다.** 순서가 중요합니다 — 포매터가 먼저
돌아야 린터가 포맷 문제를 중복 보고하지 않습니다.

```bash
pnpm format      # biome format --write
pnpm lint        # biome check --write
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest run --coverage
```

한 번에 돌리려면:

```bash
pnpm verify
```

실패하면 **거기서 멈추고 고친 뒤 처음부터 다시** 돌리세요. 앞 단계의 수정이 뒤
단계 결과를 바꿉니다.

## 실패 진단

### `pnpm lint` (Biome) 실패

- `lint/suspicious/noExplicitAny` — 서버 응답은 `any` 가 아니라 **`unknown`** 으로
  받고 `models/parsing.ts` 헬퍼로 좁히세요. `JSON.parse` 가 `any` 를 돌려주므로
  여기서 막지 않으면 타입 안전성이 전체로 샙니다.
- `lint/nursery/noFloatingPromises` — `await` 을 빠뜨렸습니다. **테스트에서 나면
  특히 중요합니다** — `await` 없는 `expect(...).rejects` 는 통과해 버립니다.
- `lint/style/useConst`, import 정렬 — `--write` 가 처리합니다.
- `lint/complexity/noBannedTypes`, `enum` 사용 — 이 저장소는 `enum` 을 쓰지
  않습니다. `as const` 객체 + 유니온 타입으로 바꾸세요 (`options.ts` 참고).
- 규칙을 통째로 끄지 마세요. 정말 필요하면 `biome.json` 의 `overrides` 에 경로
  단위로, 이유와 함께 추가하세요.

### `pnpm typecheck` (tsc) 실패

- `Object is possibly 'undefined'` — `noUncheckedIndexedAccess` 때문입니다.
  배열 인덱싱 결과는 항상 `T | undefined` 입니다. **이건 실제 버그를 잡는
  규칙이니 `!` 로 덮지 말고** 없을 때의 동작을 정하세요 (파싱 헬퍼의 기본값 등).
- `Type 'undefined' is not assignable` (선택 속성) — `exactOptionalPropertyTypes`
  때문입니다. 속성을 **빼는 것**과 `undefined` 를 **넣는 것**이 다릅니다.
  폼 조립에서는 이 구분이 곧 와이어 차이입니다 (`undefined` 값 필드는 요청에서
  사라집니다).
- 테스트에서 **일부러** 잘못된 타입을 넘길 때 나는 오류 — `as unknown as T` 로
  의도를 명시하고 왜인지 주석을 남기세요. 런타임 가드 테스트를 지우지 마세요.
- `@ts-ignore` 를 쓰지 마세요. `@ts-expect-error` 는 오류가 없어지면 그 자체가
  실패하므로 안전합니다 — 그쪽을 쓰고 같은 줄에 이유를 적으세요.

### `pnpm test` (Vitest) 실패

- `ERROR: Coverage for lines (…) does not meet threshold (90%)` — **게이트를
  낮추지 말고 테스트를 쓰세요.** `Uncovered Line #s` 열이 안 덮인 줄을 알려 줍니다.
  `test-author` 서브에이전트가 있다면 위임하세요.
- `모든 테스트에 // when 과 // then 이 있어야 합니다` — `tests/style.test.ts` 가
  잡은 것입니다. 준비 코드가 있으면 `// given` 도 필요합니다. 예외 검증처럼 실행과
  검증이 한 덩어리면 `// when & then` 으로 묶으세요.
- `테스트에 제어 흐름 문이 있습니다` — 테스트에 `if`/`for`/`while` **문**이
  들어갔습니다. `it.each` 로 펼치거나, `filter`/`map` 으로 위반 목록을 만들어
  `toEqual([])` 과 비교하세요.
- `고정 입력에 대한 토큰` (dynapath) — DynaPath 서명이 바뀌었습니다. **심각**:
  서버가 로그인을 거부하게 됩니다. BigInt 가 `Number` 로 바뀌지 않았는지 먼저
  보세요 — 큰 입력에서만 조용히 틀립니다. 인코딩 알고리즘을 되돌리세요.
- `예상하지 못한 요청: <url>` — `FakeSession` 에 라우트가 없습니다. 픽스처의
  `routes` 에 해당 엔드포인트를 추가하세요.
- **테스트가 통과했는데 뭔가 이상하다면 `await` 부터 의심하세요.** `await` 없는
  `expect(...).rejects` 는 아무것도 검증하지 않고 초록색이 됩니다.

### `pnpm build` 실패 / 배포물이 이상할 때

게이트에는 없지만 릴리스 전에는 돌려야 합니다.

```bash
pnpm build
node -e "import('./dist/index.mjs').then(m => console.log(Object.keys(m)))"   # ESM
node -e "console.log(Object.keys(require('./dist/index.cjs')))"               # CJS
```

**두 경로를 다 확인하세요.** TS 로만 개발하면 JS 사용자 경로가 깨져도 못 봅니다.
`tests/packaging.test.ts` 가 `exports` 맵을 지키지만, 실제 로드는 위로 봅니다.

## 커버리지 자세히 보기

```bash
pnpm test --coverage.reporter=html && open coverage/index.html
```

특정 파일만:

```bash
pnpm vitest run tests/trains.test.ts --coverage.include='src/resources/trains.ts'
```

## 마지막

게이트가 통과했다면 무엇을 돌렸고 결과가 무엇인지 사실대로 보고하세요.
**통과하지 않았는데 통과했다고 하지 마세요.** 일부만 돌렸으면 일부만 돌렸다고
말하세요.
