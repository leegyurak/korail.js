/**
 * 앱이 쓰는 대칭키 원시연산.
 *
 * 전부 앱 동작을 그대로 옮긴 것입니다 — 이중 base64 나 개행 접미사처럼 어색해
 * 보이는 부분도 서버가 그 형태를 기대하므로 손대지 마세요.
 *
 * 외부 의존성 없이 `node:crypto` 만 씁니다.
 */

import { Buffer } from "node:buffer";
import { createCipheriv } from "node:crypto";

/** 키 길이(바이트) → AES-CBC 알고리즘 이름. */
const CIPHER_BY_KEY_LENGTH = new Map<number, string>([
  [16, "aes-128-cbc"],
  [24, "aes-192-cbc"],
  [32, "aes-256-cbc"],
]);

function cipherFor(key: Buffer): string {
  const algorithm = CIPHER_BY_KEY_LENGTH.get(key.length);
  if (algorithm === undefined) {
    throw new Error(`AES 키 길이가 16·24·32바이트가 아닙니다: ${key.length}바이트`);
  }
  return algorithm;
}

/**
 * `Sid` 폼 필드 값을 만듭니다.
 *
 * 키를 IV 로 재사용하는 AES-CBC 입니다(앱과 동일). 결과 끝의 개행도 앱이 보내는
 * 그대로이므로 유지합니다.
 */
export function encryptSid(device: string, ts: number, key: string): string {
  const keyBytes = Buffer.from(key, "utf8");
  const cipher = createCipheriv(cipherFor(keyBytes), keyBytes, keyBytes);
  const ciphertext = Buffer.concat([cipher.update(`${device}${ts}`, "utf8"), cipher.final()]);
  return `${ciphertext.toString("base64")}\n`;
}

/**
 * 로그인 비밀번호를 서버가 발급한 1회용 키로 암호화합니다.
 *
 * 키 문자열이 그대로 AES 키이고 그 앞 16바이트가 IV 입니다. base64 를 두 번
 * 씌우는 것도 앱 동작 그대로입니다.
 */
export function encryptPassword(password: string, key: string): string {
  const keyBytes = Buffer.from(key, "utf8");
  const iv = keyBytes.subarray(0, 16);
  if (iv.length !== 16) {
    throw new Error(`AES IV 로 쓸 16바이트가 없습니다: 키가 ${keyBytes.length}바이트입니다`);
  }
  const cipher = createCipheriv(cipherFor(keyBytes), keyBytes, iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return Buffer.from(ciphertext.toString("base64"), "utf8").toString("base64");
}
