/**
 * 암호 골든 벡터.
 *
 * 이중 base64 와 `Sid` 끝의 개행은 서버가 그 형태를 기대하는 것입니다 —
 * "고치면" 로그인이 조용히 막힙니다.
 */

import { describe, expect, it } from "vitest";
import { SID_KEY } from "../src/constants";
import { encryptPassword, encryptSid } from "../src/crypto";

describe("encryptSid", () => {
  it("골든 벡터를 그대로 만든다", () => {
    // when
    const sid = encryptSid("AD", 1700000001234, SID_KEY);

    // then
    expect(sid).toBe("PcEG6luXPgnzvVL6SRp8Cw==\n");
  });

  it("끝에 개행이 붙는다", () => {
    // when
    const sid = encryptSid("AD", 1700000001234, SID_KEY);

    // then
    expect(sid.endsWith("\n")).toBe(true);
  });

  it("타임스탬프가 다르면 값이 달라진다", () => {
    // when
    const sid = encryptSid("AD", 1700000001235, SID_KEY);

    // then
    expect(sid).not.toBe(encryptSid("AD", 1700000001234, SID_KEY));
  });

  it("AES 규격에 맞지 않는 키를 거부한다", () => {
    // when & then
    expect(() => encryptSid("AD", 1700000001234, "short")).toThrow(/AES 키 길이/);
  });
});

describe("encryptPassword", () => {
  it("골든 벡터를 그대로 만든다", () => {
    // when
    const encrypted = encryptPassword("hunter22", "0123456789abcdef");

    // then
    expect(encrypted).toBe("cUtweHJtRHhmSXV6T3R3ZG9JSHBidz09");
  });

  it("base64 를 두 번 씌운다", () => {
    // given
    const encrypted = encryptPassword("hunter22", "0123456789abcdef");

    // when
    const once = Buffer.from(encrypted, "base64").toString("utf8");

    // then
    expect(once).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
  });

  it.each([
    ["aes-128", "0123456789abcdef"],
    ["aes-192", "0123456789abcdef01234567"],
    ["aes-256", "0123456789abcdef0123456789abcdef"],
  ])("%s 키 길이를 지원한다", (_label, key) => {
    // when
    const encrypted = encryptPassword("hunter22", key);

    // then
    expect(encrypted.length).toBeGreaterThan(0);
  });

  it("IV 로 쓸 16바이트가 없는 키를 거부한다", () => {
    // when & then
    expect(() => encryptPassword("hunter22", "tooshort")).toThrow(/16바이트/);
  });

  it("AES 규격에 맞지 않는 길이의 키를 거부한다", () => {
    // when & then
    expect(() => encryptPassword("hunter22", "0123456789abcdef0")).toThrow(/AES 키 길이/);
  });
});
