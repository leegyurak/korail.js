/** 요청 서명 — 어떤 경로에 어떤 인증 재료를 붙일지 결정합니다. */

import { DEVICE, DEVICE_ID, DYNAPATH_PATHS, SID_KEY } from "../constants";
import { encryptSid } from "../crypto";
import type { DeviceProfileLike } from "../device/profile";
import { DynaPathMasterEngine } from "./dynapath";

const NONCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const NONCE_LENGTH = 4;

/** 서명 결과. 서명 대상이 아닌 경로면 헤더가 비고 `sid` 가 `undefined` 입니다. */
export interface Signature {
  readonly headers: Record<string, string>;
  readonly sid: string | undefined;
}

/** {@link RequestSigner} 생성 옵션. */
export interface RequestSignerOptions {
  profile?: DeviceProfileLike | undefined;
  device?: string;
  deviceId?: string;
  sidKey?: string;
}

function nonce(): string {
  return Array.from(
    { length: NONCE_LENGTH },
    () => NONCE_ALPHABET[Math.floor(Math.random() * NONCE_ALPHABET.length)] ?? "A",
  ).join("");
}

/**
 * DynaPath 서명이 필요한 요청에 헤더와 `Sid` 를 만들어 줍니다.
 *
 * 엔진 인스턴스를 들고 있으므로 클라이언트당 하나만 두고 재사용하세요 —
 * 엔진 생성 시각이 서명에 들어갑니다.
 */
export class RequestSigner {
  readonly #engine: DynaPathMasterEngine;
  readonly #device: string;
  readonly #deviceId: string;
  readonly #sidKey: string;

  constructor(options: RequestSignerOptions = {}) {
    this.#engine = DynaPathMasterEngine.fromProfile(options.profile);
    this.#device = options.device ?? DEVICE;
    this.#deviceId = options.deviceId ?? DEVICE_ID;
    this.#sidKey = options.sidKey ?? SID_KEY;
  }

  /**
   * `url` 에 필요한 헤더와 `Sid` 를 만듭니다.
   *
   * 서명 대상이 아닌 경로면 빈 헤더와 `undefined` 를 돌려줍니다. 토큰과 `Sid` 는
   * **같은 타임스탬프**로 만들어야 서버가 짝을 맞춰 검증할 수 있습니다.
   */
  sign(url: string): Signature {
    if (!DYNAPATH_PATHS.some((path) => url.includes(path))) {
      return { headers: {}, sid: undefined };
    }

    const ts = Date.now();
    const token = this.#engine.generateToken(this.#deviceId, ts, nonce());
    return {
      headers: { "x-dynapath-m-token": token },
      sid: encryptSid(this.#device, ts, this.#sidKey),
    };
  }
}
