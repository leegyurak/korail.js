/**
 * DynaPath 요청 서명 (`x-dynapath-m-token`).
 *
 * 코레일 앱이 예매 계열 엔드포인트에 붙이는 무결성 토큰을 재현합니다. 알고리즘은
 * 앱에서 그대로 옮긴 것이라 **바이트 단위로 같아야** 서버가 받아 줍니다 — 변수
 * 이름은 읽기 좋게 바꿨지만 연산 순서·상수는 손대지 마세요.
 *
 * 토큰이 광고하는 기기(`os=`·`dm=`)는 User-Agent 가 광고하는 기기와 반드시
 * 같아야 합니다. {@link Korail} 이 같은 프로파일로 둘 다 채웁니다.
 */

import type { DeviceProfileLike } from "../device/profile";

/** 인코딩 알파벳. 순서가 곧 알고리즘의 일부입니다. */
const TABLE = "3FE9jgRD4KdCyuawklqGJYmvfMn15P7US8XbxeLQtWT6OicBAopINs2Vh0HZrz";

const RADIX = 161; // 청크를 하나의 정수로 접을 때의 진법
const MODULUS = 30; // 출력 자릿수 진법 (= 커스텀 테이블 길이)
const CHUNK = 2; // 한 번에 접는 코드포인트 수

const APP_ID = "com.korail.talk";
const AS_VALUE = "%5B38ff229cb34c7dda8e28220a2d750cce%5D";
const DEVICE_MODEL = "SM-S928N";
const OS_VERSION = "13";
const OS_TYPE = "Android";
const SDK_VERSION = "v1";

/** {@link DynaPathMasterEngine} 생성 옵션. */
export interface DynaPathEngineOptions {
  /** 기기 모델명. 생략하면 앱 기본값(`SM-S928N`). */
  deviceModel?: string;
  /** 안드로이드 메이저 버전. 생략하면 앱 기본값(`13`). */
  osVersion?: string;
  /**
   * "앱 실행 시각"(epoch 밀리초 문자열). 서명의 `it=` 필드로 들어갑니다.
   * 생략하면 엔진을 만든 시각입니다 — 골든 벡터 테스트에서만 주입하세요.
   */
  appStartTs?: string;
}

/**
 * 문자열을 앱 고유의 가변길이 7비트 코드 유닛으로 펼칩니다.
 *
 * UTF-8 이 아닙니다 — 연속 바이트가 7비트를 쓰고 선행 바이트의 상위 비트
 * 패턴도 다릅니다. 서로게이트(0xD800~0xDFFF)는 앱과 마찬가지로 버립니다.
 *
 * `for...of` 는 코드포인트 단위로 순회합니다 — 인덱스 순회(UTF-16 코드 유닛)로
 * 바꾸면 astral 문자에서 결과가 달라집니다.
 */
function toCodeUnits(data: string): number[] {
  const result: number[] = [];
  for (const char of data) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 128) {
      result.push(cp);
    } else if (cp < 2048) {
      result.push(128 | ((cp >> 7) & 15), cp & 127);
    } else if (cp >= 262144) {
      result.push(160, (cp >> 14) & 127, (cp >> 7) & 127, cp & 127);
    } else if ((63488 & cp) !== 55296) {
      result.push(((cp >> 14) & 15) | 144, (cp >> 7) & 127, cp & 127);
    }
  }
  return result;
}

/**
 * 키 문자열을 커스텀 테이블 셔플에 쓸 큰 정수로 접습니다.
 *
 * 각 문자마다 최상위 세트 비트를 찾아 그 두 배를 진법으로 삼습니다.
 * 코드포인트가 0 이면 16 회 탐색이 모두 실패해 진법이 0 이 되고 누산값이
 * 초기화되는데, 앱과 동작을 맞추기 위해 그대로 둡니다.
 *
 * 누산값은 문자 수에 따라 2^53 을 훌쩍 넘습니다 — `number` 로 하면 **큰 입력에서만
 * 조용히 틀리므로** `bigint` 여야 합니다.
 */
function deriveKey(keyStr: string): bigint {
  let accumulator = 0n;
  for (const char of keyStr) {
    const cp = char.codePointAt(0) ?? 0;
    let highBit = 32768;
    for (let i = 0; i < 16; i += 1) {
      if ((highBit & cp) !== 0) {
        break;
      }
      highBit >>= 1;
    }
    accumulator = accumulator * BigInt(highBit << 1) + BigInt(cp);
  }
  return accumulator;
}

/** `used` 에 아직 없는 문자 중 `position` 번째를 고릅니다. */
function pickUnusedChar(baseTable: string, position: number, used: string): string {
  let seen = 0;
  for (const char of baseTable) {
    if (!used.includes(char)) {
      if (seen === position) {
        return char;
      }
      seen += 1;
    }
  }
  return " ";
}

/**
 * `seed` 로 `baseTable` 에서 길이 `size` 의 커스텀 알파벳을 뽑습니다.
 *
 * 팩토리얼 진법(Lehmer code) 방식이라 같은 seed 는 항상 같은 알파벳을 냅니다.
 * 나눗셈은 seed 와 같은 `bigint` 여야 합니다 — `Number` 로 내리면 정밀도가 깨져
 * 알파벳이 통째로 달라집니다.
 */
function buildTable(seed: bigint, size: number, baseTable: string): string {
  let picked = "";
  let remaining = seed;
  for (let i = 0; i < size; i += 1) {
    const divisor = BigInt(size - i);
    picked += pickUnusedChar(baseTable, Number(remaining % divisor), picked);
    remaining /= divisor;
  }
  return picked;
}

/** 코드 유닛을 `CHUNK` 개씩 묶어 `MODULUS` 진수 자릿수로 펼칩니다. */
function encode(data: string, table: string): string {
  const units = toCodeUnits(data);
  const out: string[] = [];
  const digits = new Array<number>(CHUNK + 1).fill(0);

  let idx = 0;
  const tail = units.length % CHUNK;
  const bodyEnd = units.length - tail;

  const fold = (width: number): void => {
    let value = 0;
    for (let i = 0; i < width; i += 1) {
      value = value * RADIX + (units[idx] ?? 0);
      idx += 1;
    }
    for (let i = 0; i <= width; i += 1) {
      digits[i] = value % MODULUS;
      value = Math.floor(value / MODULUS);
    }
    for (let i = width; i >= 0; i -= 1) {
      out.push(table[digits[i] ?? 0] ?? "");
    }
  };

  while (idx < bodyEnd) {
    fold(CHUNK);
  }
  if (tail > 0) {
    fold(tail);
  }

  return out.join("");
}

/**
 * DynaPath 토큰 생성기.
 *
 * 인스턴스 하나가 "앱 실행 한 번"에 대응합니다 — 생성 시각을 `it=` 필드로
 * 서명에 담기 때문에, 요청마다 새로 만들지 말고 클라이언트와 수명을 맞추세요.
 */
export class DynaPathMasterEngine {
  /** "앱 실행 시각" (epoch 밀리초 문자열). 서명의 `it=` 필드입니다. */
  readonly appStartTs: string;
  readonly deviceModel: string;
  readonly osVersion: string;

  constructor(options: DynaPathEngineOptions = {}) {
    this.appStartTs = options.appStartTs ?? String(Date.now());
    // 기본값을 앱 상수와 같게 둬 미주입 시 서명이 바이트 단위로 동일합니다.
    this.deviceModel = options.deviceModel ?? DEVICE_MODEL;
    this.osVersion = options.osVersion ?? OS_VERSION;
  }

  /** 기기 프로파일로 엔진을 만듭니다. 프로파일이 없으면 앱 기본값을 씁니다. */
  static fromProfile(profile?: DeviceProfileLike | undefined): DynaPathMasterEngine {
    if (profile === undefined) {
      return new DynaPathMasterEngine();
    }
    return new DynaPathMasterEngine({ deviceModel: profile.model, osVersion: profile.android });
  }

  /**
   * `x-dynapath-m-token` 헤더 값을 만듭니다.
   *
   * @param deviceId 앱이 들고 다니는 기기 식별자.
   * @param ts 요청 시각 (epoch 밀리초).
   * @param rand 요청마다 새로 뽑는 4자 영대문자·숫자 논스.
   */
  generateToken(deviceId: string, ts: number, rand: string): string {
    const payload =
      `ai=${APP_ID}&di=${deviceId}&as=${AS_VALUE}&` +
      `su=false&dbg=false&emu=false&hk=false&it=${this.appStartTs}&` +
      `ts=${ts}&rt=0&os=${this.osVersion}&dm=${this.deviceModel}&st=${OS_TYPE}&sv=${SDK_VERSION}`;

    const dynKey = `${SDK_VERSION}+${rand}+${ts}`;
    const keyPart = encode(dynKey, TABLE);
    const customTable = buildTable(deriveKey(dynKey), MODULUS, TABLE);
    const bodyPart = encode(payload, customTable);
    return `bEeEP${TABLE[keyPart.length] ?? ""}${keyPart}${bodyPart}`;
  }
}
