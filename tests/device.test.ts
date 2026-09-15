/** 기기 프로파일 카탈로그의 정합성 제약. */

import { describe, expect, it } from "vitest";
import {
  BUILD_ID,
  CATALOG_SIZE,
  DEVICE_PROFILES,
  dalvikUserAgent,
  PROFILES_BY_ID,
  profileById,
  randomProfile,
} from "../src/device";

/** 안드로이드 버전 → 빌드ID 프리픽스. 13→T · 14→U · 15→A · 16→B. */
const BUILD_PREFIX: Record<string, string> = { "13": "T", "14": "U", "15": "A", "16": "B" };

describe("카탈로그", () => {
  it("정확히 CATALOG_SIZE 개를 전개한다", () => {
    // when & then
    expect(DEVICE_PROFILES).toHaveLength(CATALOG_SIZE);
  });

  it("빌드ID 프리픽스가 안드로이드 버전과 맞는다", () => {
    // when
    const bad = DEVICE_PROFILES.filter(
      (profile) => !profile.buildId.startsWith(BUILD_PREFIX[profile.android] ?? "?"),
    ).map((profile) => profile.id);

    // then
    expect(bad).toEqual([]);
  });

  it("빌드ID 가 버전별 표준값과 같다", () => {
    // when
    const bad = DEVICE_PROFILES.filter(
      (profile) => profile.buildId !== BUILD_ID[Number(profile.android)],
    ).map((profile) => profile.id);

    // then
    expect(bad).toEqual([]);
  });

  it("모든 모델이 한국 자급제(SM-…N)다", () => {
    // when
    const bad = DEVICE_PROFILES.filter((profile) => !/^SM-[A-Z]\d{3}N$/.test(profile.model)).map(
      (profile) => profile.model,
    );

    // then
    expect(bad).toEqual([]);
  });

  it("id 가 중복되지 않는다", () => {
    // when
    const unique = new Set(DEVICE_PROFILES.map((profile) => profile.id));

    // then
    expect(unique.size).toBe(DEVICE_PROFILES.length);
  });

  it("모든 모델이 최소 한 번은 대표된다", () => {
    // when
    const models = new Set(DEVICE_PROFILES.map((profile) => profile.model));

    // then
    expect(models.size).toBe(38);
  });

  it.each([
    ["첫 번째", 0, ["s20-a13", "Galaxy S20", "SM-G981N", "13", "TP1A.220624.014"]],
    ["두 번째", 1, ["s20plus-a13", "Galaxy S20+", "SM-G986N", "13", "TP1A.220624.014"]],
    ["마지막", -1, ["s23-a13", "Galaxy S23", "SM-S911N", "13", "TP1A.220624.014"]],
  ])("%s 프로파일이 pykorail 카탈로그와 같다", (_label, index, expected) => {
    // when
    const profile =
      index < 0 ? DEVICE_PROFILES[DEVICE_PROFILES.length + index] : DEVICE_PROFILES[index];

    // then
    // 라운드로빈 전개 순서가 pykorail 과 같아야 같은 id 가 같은 폰을 가리킵니다.
    expect([
      profile?.id,
      profile?.marketing,
      profile?.model,
      profile?.android,
      profile?.buildId,
    ]).toEqual(expected);
  });

  it("프로파일은 불변이다", () => {
    // when
    const [profile] = DEVICE_PROFILES;

    // then
    expect(Object.isFrozen(profile)).toBe(true);
  });

  it("인덱스가 카탈로그 전체를 담는다", () => {
    // when & then
    expect(PROFILES_BY_ID.size).toBe(DEVICE_PROFILES.length);
  });
});

describe("profileById", () => {
  it("저장해 둔 id 로 같은 프로파일을 복원한다", () => {
    // given
    const saved = DEVICE_PROFILES[7];

    // when
    const restored = profileById(saved?.id);

    // then
    expect(restored).toBe(saved);
  });

  it.each([
    ["없는 id", "존재하지-않음"],
    ["null", null],
    ["undefined", undefined],
  ])("%s 이면 undefined 다", (_label, value) => {
    // when & then
    expect(profileById(value)).toBeUndefined();
  });
});

describe("randomProfile", () => {
  it("난수원을 주면 재현 가능하게 고른다", () => {
    // when
    const picked = randomProfile(() => 0);

    // then
    expect(picked).toBe(DEVICE_PROFILES[0]);
  });

  it("난수가 상한에 닿아도 범위를 넘지 않는다", () => {
    // when
    const picked = randomProfile(() => 0.999999999);

    // then
    expect(picked).toBe(DEVICE_PROFILES[DEVICE_PROFILES.length - 1]);
  });

  it("기본 난수원으로도 카탈로그 안의 프로파일을 준다", () => {
    // when
    const picked = randomProfile();

    // then
    expect(DEVICE_PROFILES).toContain(picked);
  });
});

describe("dalvikUserAgent", () => {
  it("프로파일을 Dalvik UA 로 렌더한다", () => {
    // given
    const profile = { model: "SM-S928N", android: "14", buildId: "UP1A.231005.007" };

    // when
    const ua = dalvikUserAgent(profile);

    // then
    expect(ua).toBe("Dalvik/2.1.0 (Linux; U; Android 14; SM-S928N Build/UP1A.231005.007)");
  });

  it("카탈로그의 모든 프로파일이 같은 형태로 렌더된다", () => {
    // when
    const bad = DEVICE_PROFILES.filter(
      (profile) =>
        !/^Dalvik\/2\.1\.0 \(Linux; U; Android \d+; SM-[A-Z]\d{3}N Build\/[A-Z]{2}\d[A-Z]\./.test(
          dalvikUserAgent(profile),
        ),
    ).map((profile) => profile.id);

    // then
    expect(bad).toEqual([]);
  });
});
