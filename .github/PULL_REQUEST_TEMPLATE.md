<!--
고맙습니다! 아래는 리뷰를 빠르게 하기 위한 것이지, 시험이 아닙니다.
해당 없는 항목은 지우거나 "해당 없음" 이라고 적어 주세요.

⚠️ 아이디·비밀번호·카드번호·예약번호를 붙여넣지 마세요. 로그와 응답 본문에
   개인정보가 섞여 있습니다. 올리기 전에 *** 로 가려 주세요.

릴리스 노트는 PR **라벨**로 분류됩니다 (.github/release.yml):
breaking · feature · bug · security · external-api · dependencies · documentation · refactor
권한이 없으면 그냥 두세요 — 메인테이너가 붙입니다.
-->

## 무엇을 왜 바꿨나요

<!-- 한두 문장. "왜" 가 코드에서 안 드러난다면 그 이유를 꼭 적어 주세요. -->

Closes #

## 종류

- [ ] 🐛 버그 수정
- [ ] ✨ 새 기능
- [ ] 🚄 코레일 API 변화 대응 (`external-api`)
- [ ] 🧹 리팩터링 / 내부 정리
- [ ] 📝 문서
- [ ] ⚙️ 개발 환경 (CI · 린트 · 빌드 · 테스트)

## 어떻게 확인했나요

<!--
무엇을 어떻게 검증했는지 사실대로 적어 주세요.
실제 코레일 서버로 시험했다면 그 사실과 범위를 밝혀 주세요 — 계정이 필요한 동작은
리뷰어가 재현할 수 없습니다. 못 해 본 것이 있으면 그것도 적어 주세요.
-->

## 체크리스트

- [ ] `pnpm verify` 통과 (format · lint · typecheck · test)
- [ ] 커버리지 90% 하한 유지
- [ ] 테스트에 `// given` / `// when` / `// then` 주석을 넣었습니다
- [ ] 테스트에 `if` / `for` / `while` **문**이 없습니다 (`it.each` 사용)
- [ ] **비동기 단언에 `await` 을 빠뜨리지 않았습니다** (`await expect(p).rejects…`)
- [ ] 공개 API 를 바꿨다면 [`docs/reference.md`](../blob/main/docs/reference.md) 를 갱신했습니다
- [ ] `package.json` 의 `version` 을 건드리지 않았습니다 (버전은 git 태그에서 옵니다)

## 아키텍처 규약

<!-- AGENTS.md §2. 해당 없으면 이 절을 지우세요. -->

- [ ] 새 엔드포인트를 `Korail` 본체가 아니라 **리소스**에 넣었습니다
- [ ] HTTP 는 `ApiClient` 를 통해서만 호출합니다 (`#session` 직접 접근 없음)
- [ ] 새 모델은 `readonly` + `Object.freeze(this)` + `static fromResponse()` 이고,
      **배열·객체 필드는 복사해서 함께 동결**했습니다 (얕은 freeze 주의)
- [ ] 응답 파싱에 `models/parsing.ts` 헬퍼를 썼습니다 (날로 인덱싱하지 않음)
- [ ] 상태를 바꾸는 메서드는 `Promise<void>` 이고 실패 시 throw 합니다
- [ ] 새 에러 클래스를 만들었다면 `CODED_ERRORS` 에 등록했습니다

## TypeScript / 패키징

<!-- 타입이나 배포물에 영향이 있다면. 없으면 이 절을 지우세요. -->

- [ ] 서버 응답을 `any` 가 아니라 `unknown` 으로 받았습니다
- [ ] `@ts-ignore` 를 쓰지 않았습니다 (`@ts-expect-error` + 이유는 괜찮습니다)
- [ ] **ESM `import` 과 CJS `require` 양쪽**에서 동작을 확인했습니다

## ⚠️ 외부 API 영향

<!--
constants.ts · auth/ · crypto.ts · transport.ts · 리소스의 폼 필드를 건드렸다면
답해 주세요. 해당 없으면 "해당 없음" 이라고 적고 체크박스는 지우세요.

여기서의 실수는 테스트를 통과하고도 운영에서 조용히 로그인이 막히는 형태로
나타납니다. 그래서 따로 묻습니다.
-->

- [ ] 서버로 나가는 **요청 페이로드가 그대로**임을 확인했습니다
- [ ] 앱 신원값(`USER_AGENT` · `APP_VERSION` · `API_KEY` · `SID_KEY` · `DEVICE_ID`)을
      바꾸지 않았습니다
- [ ] 폼 키를 camelCase 로 "정리"하지 않았습니다 (`txtGoAbrdDt` 는 서버가 정한 철자입니다)
- [ ] 폼 값에 `undefined` 가 들어가지 않습니다 (들어가면 그 필드는 요청에서 사라집니다)
- [ ] DynaPath 서명 골든 테스트가 통과합니다 (`tests/dynapath.test.ts`)
- [ ] `BigInt` 를 `Number` 로 바꾸지 않았습니다 (큰 입력에서만 조용히 틀립니다)

### `transport.ts` 를 바꿨다면 — 실측 근거

<!--
TLS 지문은 이 저장소에서 유일하게 실서버 검증이 끝나지 않은 영역입니다.
JA3 나 ClientIdentifier 를 바꿨다면 **무엇을 어떻게 확인했는지** 적어 주세요.
추측으로 바꾼 값은 되돌립니다.
-->

### 새 엔드포인트라면 — APK 근거

<!--
추측한 필드 이름은 에러가 아니라 조용한 빈 값이 됩니다. 공식 코레일톡+ APK 에서
확인한 내용을 그대로 붙여 주세요. 확인 못 한 항목이 있으면 "모름" 이라고 적어
주세요 — 추측으로 채우는 것보다 훨씬 낫습니다.

APK: com.korail.talk versionName 7.0.1 (2026-08 추출)
경로: com.korail.mobile.transfer.TransferView
요청: Device, Version, Key, txtTrnNo, txtDptDt
응답: {"trsf_infos": {"trsf_info": [{"h_trsf_stn_nm", "h_trsf_wait_tm"}]}}
서명: DynaPath 대상 아님
-->
