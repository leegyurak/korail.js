/** 서명 대상 판정과 토큰·Sid 의 짝 맞추기. */

import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestSigner } from "../src/auth/signer";
import { API_ENDPOINTS, DEVICE, SID_KEY } from "../src/constants";
import { encryptSid } from "../src/crypto";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RequestSigner", () => {
  it.each([
    ["login", API_ENDPOINTS.login],
    ["reserve", API_ENDPOINTS.reserve],
    ["searchSchedule", API_ENDPOINTS.searchSchedule],
  ])("%s 는 서명 대상이다", (_label, url) => {
    // when
    const { headers, sid } = new RequestSigner().sign(url);

    // then
    expect(headers["x-dynapath-m-token"]).toMatch(/^bEeEP/);
    expect(sid).toBeDefined();
  });

  it.each([
    ["stationdata", API_ENDPOINTS.stationdata],
    ["pay", API_ENDPOINTS.pay],
    ["myticketlist", API_ENDPOINTS.myticketlist],
    ["logout", API_ENDPOINTS.logout],
  ])("%s 는 서명 대상이 아니다", (_label, url) => {
    // when
    const { headers, sid } = new RequestSigner().sign(url);

    // then
    expect(headers).toEqual({});
    expect(sid).toBeUndefined();
  });

  it("토큰과 Sid 를 같은 타임스탬프로 만든다", () => {
    // given
    vi.useFakeTimers();
    vi.setSystemTime(1700000001234);

    // when
    const { sid } = new RequestSigner().sign(API_ENDPOINTS.login);

    // then
    expect(sid).toBe(encryptSid(DEVICE, 1700000001234, SID_KEY));
  });

  it("같은 시각·같은 난수면 토큰이 바이트 단위로 같다", () => {
    // given
    // 시각을 고정하지 않으면 엔진 생성 시각(it=)과 요청 시각(ts=)이 달라져
    // 토큰도 달라집니다 — 논스만 고정해서는 결정적이지 않습니다.
    vi.useFakeTimers();
    vi.setSystemTime(1700000001234);
    vi.spyOn(Math, "random").mockReturnValue(0);

    // when
    const token = new RequestSigner().sign(API_ENDPOINTS.login).headers["x-dynapath-m-token"];

    // then
    expect(token).toBe(new RequestSigner().sign(API_ENDPOINTS.login).headers["x-dynapath-m-token"]);
  });

  it("논스가 요청마다 달라진다", () => {
    // given
    const signer = new RequestSigner();

    // when
    const tokens = new Set(
      Array.from(
        { length: 20 },
        () => signer.sign(API_ENDPOINTS.login).headers["x-dynapath-m-token"],
      ),
    );

    // then
    expect(tokens.size).toBeGreaterThan(1);
  });

  it("프로파일을 주면 서명이 그 기기를 가리킨다", () => {
    // given
    const profile = { model: "SM-G991N", android: "15", buildId: "AP3A.240905.015.A2" };
    vi.useFakeTimers();
    vi.setSystemTime(1700000001234);
    vi.spyOn(Math, "random").mockReturnValue(0);

    // when
    const withProfile = new RequestSigner({ profile }).sign(API_ENDPOINTS.login);

    // then
    expect(withProfile.headers["x-dynapath-m-token"]).not.toBe(
      new RequestSigner().sign(API_ENDPOINTS.login).headers["x-dynapath-m-token"],
    );
  });

  it("기기 식별자·Sid 키를 바꿔 끼울 수 있다", () => {
    // given
    vi.useFakeTimers();
    vi.setSystemTime(1700000001234);

    // when
    const { sid } = new RequestSigner({ sidKey: "0123456789abcdef", device: "IO" }).sign(
      API_ENDPOINTS.login,
    );

    // then
    expect(sid).toBe(encryptSid("IO", 1700000001234, "0123456789abcdef"));
  });
});
