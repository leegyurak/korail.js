/**
 * 기기 프로파일 카탈로그.
 *
 * **한 프로파일 = 폰 한 대.** 개별 User-Agent 문자열을 나열하는 대신, 아래 정합성
 * 제약을 만족하는 (모델 × 안드로이드 버전) 조합을 결정적으로 전개합니다.
 *
 * 정합성 제약:
 *   1. 안드로이드 버전 ↔ 빌드ID 프리픽스 (13→T, 14→U, 15→A, 16→B) — {@link BUILD_ID} 로 강제
 *   2. 모델 ↔ 유효 버전 범위 (출시 OS ~ 검증된 최대 지원) — `MODELS` 로 강제
 *
 * 모든 모델은 소스로 확인된 **한국 자급제(SM-…N)** 만 씁니다. TLS 임퍼소네이션이
 * 안드로이드 크롬 계열이라 지문과도 일치합니다 — 아이폰·통신사 전용(S/K/L 접미사)
 * 모델을 넣지 마세요.
 *
 * 카탈로그는 결정적입니다(`Math.random` 없음). 무작위로 하나 뽑고 싶으면
 * {@link randomProfile} 을 쓰되, **한 번 뽑은 프로파일은 계속 재사용하세요** —
 * 실행마다 다른 폰인 척하는 것이 오히려 부자연스럽습니다.
 */

import type { DeviceProfile } from "./profile";

/** 카탈로그에 전개할 프로파일 수. */
export const CATALOG_SIZE = 100;

/**
 * 안드로이드 버전 → 구글 정식 릴리스 빌드ID. 삼성폰도 `ro.build.id` 로 이 값을
 * 그대로 씁니다. 랜덤 날짜/증분을 굴리면 오히려 비현실적이라 버전당 하나로 고정합니다.
 */
export const BUILD_ID: Readonly<Record<number, string>> = Object.freeze({
  13: "TP1A.220624.014",
  14: "UP1A.231005.007",
  15: "AP3A.240905.015.A2",
  16: "BP2A.250605.031",
});

/**
 * (마케팅명, 모델, 유효 안드로이드 버전). 전부 소스 검증된 한국 자급제 N 모델.
 * 최고버전 신뢰가 낮은 경우는 보수적으로 뺐습니다 (A33→14, A15 LTE→15).
 */
const MODELS: readonly (readonly [string, string, readonly number[]])[] = [
  ["Galaxy S20", "SM-G981N", [13]],
  ["Galaxy S20+", "SM-G986N", [13]],
  ["Galaxy S20 Ultra", "SM-G988N", [13]],
  ["Galaxy S20 FE 5G", "SM-G781N", [13]],
  ["Galaxy S21", "SM-G991N", [13, 14, 15]],
  ["Galaxy S21+", "SM-G996N", [13, 14, 15]],
  ["Galaxy S21 Ultra", "SM-G998N", [13, 14, 15]],
  ["Galaxy S22", "SM-S901N", [13, 14, 15, 16]],
  ["Galaxy S22+", "SM-S906N", [13, 14, 15, 16]],
  ["Galaxy S22 Ultra", "SM-S908N", [13, 14, 15, 16]],
  ["Galaxy S23", "SM-S911N", [13, 14, 15, 16]],
  ["Galaxy S23+", "SM-S916N", [13, 14, 15, 16]],
  ["Galaxy S23 Ultra", "SM-S918N", [13, 14, 15, 16]],
  ["Galaxy S24", "SM-S921N", [14, 15, 16]],
  ["Galaxy S24+", "SM-S926N", [14, 15, 16]],
  ["Galaxy S24 Ultra", "SM-S928N", [14, 15, 16]],
  ["Galaxy S25", "SM-S931N", [15, 16]],
  ["Galaxy S25+", "SM-S936N", [15, 16]],
  ["Galaxy S25 Ultra", "SM-S938N", [15, 16]],
  ["Galaxy Note20", "SM-N981N", [13]],
  ["Galaxy Note20 Ultra", "SM-N986N", [13]],
  ["Galaxy Z Fold3", "SM-F926N", [13, 14, 15]],
  ["Galaxy Z Fold4", "SM-F936N", [13, 14, 15, 16]],
  ["Galaxy Z Fold5", "SM-F946N", [13, 14, 15, 16]],
  ["Galaxy Z Fold6", "SM-F956N", [14, 15, 16]],
  ["Galaxy Z Flip3", "SM-F711N", [13, 14, 15]],
  ["Galaxy Z Flip4", "SM-F721N", [13, 14, 15, 16]],
  ["Galaxy Z Flip5", "SM-F731N", [13, 14, 15, 16]],
  ["Galaxy Z Flip6", "SM-F741N", [14, 15, 16]],
  ["Galaxy A52s 5G", "SM-A528N", [13, 14]],
  ["Galaxy A53 5G", "SM-A536N", [13, 14, 15]],
  ["Galaxy A33 5G", "SM-A336N", [13, 14]],
  ["Galaxy A34 5G", "SM-A346N", [13, 14, 15, 16]],
  ["Galaxy A35 5G", "SM-A356N", [14, 15, 16]],
  ["Galaxy A55 5G", "SM-A556N", [14, 15, 16]],
  ["Galaxy A24", "SM-A245N", [13, 14, 15, 16]],
  ["Galaxy A25 5G", "SM-A256N", [14, 15, 16]],
  ["Galaxy A15 LTE", "SM-A155N", [14, 15]],
];

function slug(marketing: string): string {
  return marketing
    .toLowerCase()
    .replace("galaxy ", "")
    .replaceAll(" 5g", "5g")
    .replaceAll(" lte", "lte")
    .replaceAll(" ", "")
    .replaceAll("+", "plus");
}

/**
 * 모델 간 라운드로빈으로 최대 {@link CATALOG_SIZE} 개의 (모델, 버전) 조합을 고릅니다.
 *
 * 각 모델의 최신 OS 부터 한 개씩 순회하므로 모든 모델이 최소 1개씩 대표되고,
 * 잘려 나가는 것은 버전이 많은 모델의 구형 OS 조합뿐이라 다양성이 유지됩니다.
 */
function selectDevices(): [string, string, number][] {
  const pools = MODELS.map(([marketing, model, versions]) =>
    [...versions]
      .sort((a, b) => b - a)
      .map((version): [string, string, number] => [marketing, model, version]),
  );
  const selected: [string, string, number][] = [];
  let depth = 0;

  while (selected.length < CATALOG_SIZE && pools.some((pool) => depth < pool.length)) {
    for (const pool of pools) {
      const candidate = pool[depth];
      if (candidate !== undefined) {
        selected.push(candidate);
        if (selected.length === CATALOG_SIZE) {
          break;
        }
      }
    }
    depth += 1;
  }
  return selected;
}

function buildCatalog(): readonly DeviceProfile[] {
  return Object.freeze(
    selectDevices().map(([marketing, model, version]) =>
      Object.freeze({
        id: `${slug(marketing)}-a${version}`,
        marketing,
        model,
        android: String(version),
        buildId: BUILD_ID[version] ?? "",
      }),
    ),
  );
}

/** 전개된 카탈로그. 순서는 실행 간 안정적입니다. */
export const DEVICE_PROFILES: readonly DeviceProfile[] = buildCatalog();

/** `id` 로 찾기 위한 인덱스. */
export const PROFILES_BY_ID: ReadonlyMap<string, DeviceProfile> = new Map(
  DEVICE_PROFILES.map((profile) => [profile.id, profile]),
);

/** 저장해 둔 `id` 로 프로파일을 찾습니다. 없거나 카탈로그에서 사라졌으면 `undefined`. */
export function profileById(profileId: string | null | undefined): DeviceProfile | undefined {
  if (profileId === null || profileId === undefined) {
    return undefined;
  }
  return PROFILES_BY_ID.get(profileId);
}

/**
 * 카탈로그에서 프로파일 하나를 무작위로 뽑습니다.
 *
 * 최초 1회만 뽑아 `profile.id` 를 저장해 두고, 그 뒤로는 {@link profileById} 로
 * 같은 프로파일을 복원해 쓰세요. `random` 을 넘기면 재현 가능한 선택이 됩니다(테스트용).
 */
export function randomProfile(random: () => number = Math.random): DeviceProfile {
  const index = Math.floor(random() * DEVICE_PROFILES.length);
  const profile = DEVICE_PROFILES[Math.min(index, DEVICE_PROFILES.length - 1)];
  if (profile === undefined) {
    throw new Error("기기 프로파일 카탈로그가 비어 있습니다");
  }
  return profile;
}
