/**
 * DynaPath 골든 벡터.
 *
 * 서버는 토큰을 바이트 단위로 검증합니다 — 이 값이 바뀌었다면 알고리즘이 바뀐
 * 것이고, 그건 곧 서버 거부입니다. 리팩터링으로 깨졌다면 되돌리세요.
 */

import { describe, expect, it } from "vitest";
import { DynaPathMasterEngine } from "../src/auth/dynapath";

const GOLDEN_APP_START_TS = "1700000000000";
const GOLDEN_DEVICE_ID = "558a4f02041657ea";
const GOLDEN_TS = 1700000001234;
const GOLDEN_RAND = "AB12";

const GOLDEN_TOKEN =
  "bEeEPSYj1Dm5CMM4Pv4ff4GR4GR4GR4GDK3FFmJaRyn3PkmGmvPkqJaRPyD3wdPv1f5G4wMCMfmudCEaGPGGPmGldCMG41Gf513" +
  "Pff3myw5mug4CRCn9JlJC1vJdD4nnJEv4uYmRfGkgJE9JgqCMKJl44uGCMYf5d3kg4mPPvv4uCJkg4al4mPPvv4uC4133kg4mPP" +
  "vv4uC4YYyndJa133Mf5v3lJGllGPfGPfGPfGPfGPfG4j3jymknCjdGPfGPfGPfGlPC1vf5F3lJG4jPkMmknCDk4nCynDvlFa5mC" +
  "nfvkj3YKmkMPd33qq4jwf5dY1CYD5";

describe("DynaPathMasterEngine", () => {
  it("고정 입력에 대해 골든 토큰을 그대로 만든다", () => {
    // given
    const engine = new DynaPathMasterEngine({ appStartTs: GOLDEN_APP_START_TS });

    // when
    const token = engine.generateToken(GOLDEN_DEVICE_ID, GOLDEN_TS, GOLDEN_RAND);

    // then
    expect(token).toBe(GOLDEN_TOKEN);
  });

  it("같은 입력이면 항상 같은 토큰이다", () => {
    // given
    const engine = new DynaPathMasterEngine({ appStartTs: GOLDEN_APP_START_TS });

    // when
    const tokens = [1, 2].map(() => engine.generateToken(GOLDEN_DEVICE_ID, GOLDEN_TS, GOLDEN_RAND));

    // then
    expect(tokens[0]).toBe(tokens[1]);
  });

  it.each([
    ["기기 모델", { deviceModel: "SM-G991N" }],
    ["OS 버전", { osVersion: "15" }],
    ["앱 실행 시각", { appStartTs: "1700000009999" }],
  ])("%s 가 다르면 토큰도 달라진다", (_label, overrides) => {
    // given
    const base = new DynaPathMasterEngine({ appStartTs: GOLDEN_APP_START_TS });
    const changed = new DynaPathMasterEngine({ appStartTs: GOLDEN_APP_START_TS, ...overrides });

    // when
    const token = changed.generateToken(GOLDEN_DEVICE_ID, GOLDEN_TS, GOLDEN_RAND);

    // then
    expect(token).not.toBe(base.generateToken(GOLDEN_DEVICE_ID, GOLDEN_TS, GOLDEN_RAND));
  });

  it("프로파일로 만들면 모델·OS 가 프로파일을 따른다", () => {
    // given
    const profile = { model: "SM-S921N", android: "15", buildId: "AP3A.240905.015.A2" };

    // when
    const engine = DynaPathMasterEngine.fromProfile(profile);

    // then
    expect(engine.deviceModel).toBe("SM-S921N");
    expect(engine.osVersion).toBe("15");
  });

  it("프로파일이 없으면 앱 기본값을 쓴다", () => {
    // when
    const engine = DynaPathMasterEngine.fromProfile(undefined);

    // then
    expect(engine.deviceModel).toBe("SM-S928N");
    expect(engine.osVersion).toBe("13");
  });

  it("앱 실행 시각을 생략하면 현재 시각을 쓴다", () => {
    // given
    const before = Date.now();

    // when
    const engine = new DynaPathMasterEngine();

    // then
    expect(Number(engine.appStartTs)).toBeGreaterThanOrEqual(before);
  });

  it("astral 문자가 섞여도 코드포인트 단위로 접는다", () => {
    // given
    const engine = new DynaPathMasterEngine({ appStartTs: GOLDEN_APP_START_TS, deviceModel: "😀" });

    // when
    const token = engine.generateToken(GOLDEN_DEVICE_ID, GOLDEN_TS, GOLDEN_RAND);

    // then
    expect(token.startsWith("bEeEP")).toBe(true);
  });

  it("큰 누산값에서도 테이블이 무너지지 않는다", () => {
    // given
    const engine = new DynaPathMasterEngine({ appStartTs: GOLDEN_APP_START_TS });

    // when
    const token = engine.generateToken(GOLDEN_DEVICE_ID, GOLDEN_TS, "ZZZZ");

    // then
    expect(token).not.toContain(" ");
  });
});
