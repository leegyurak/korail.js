/**
 * 역 마스터.
 *
 * 응답 모양(2026-09 실측):
 *
 * ```json
 * { "stns": { "stn": [
 *   { "stn_cd": "0115", "stn_nm": "강릉", "longitude": "128.898851",
 *     "latitude": "37.764108", "group": "1", "major": "28",
 *     "popupType": "0", "popupMessage": "" }
 * ] } }
 * ```
 *
 * 281개 역이 내려오고, 그중 45개에만 `major` 가 붙습니다.
 */

import { field, floating, isResponseData, text } from "./parsing";

/** {@link Station} 생성자 인자. */
export interface StationFields {
  readonly code: string;
  readonly name: string;
  readonly latitude: number | undefined;
  readonly longitude: number | undefined;
  readonly group: string;
  readonly major: string;
  readonly popupType: string;
  readonly popupMessage: string;
}

/**
 * 역 하나.
 *
 * 조회 API 는 역 **이름**을 받으므로(`txtGoStart`), 보통은 {@link name} 을 그대로
 * 넘깁니다. 나머지는 부가 정보입니다.
 */
export class Station implements StationFields {
  readonly code: string;
  readonly name: string;
  readonly latitude: number | undefined;
  readonly longitude: number | undefined;
  /** 노선 그룹 코드. 같은 값이면 같은 노선군입니다. */
  readonly group: string;
  /** 주요역 정렬 순번. 주요역이 아니면 빈 문자열입니다. */
  readonly major: string;
  /** 역 선택 시 앱이 띄우는 안내 종류. `"0"` 이면 안내 없음. */
  readonly popupType: string;
  readonly popupMessage: string;

  constructor(fields: StationFields) {
    this.code = fields.code;
    this.name = fields.name;
    this.latitude = fields.latitude;
    this.longitude = fields.longitude;
    this.group = fields.group;
    this.major = fields.major;
    this.popupType = fields.popupType;
    this.popupMessage = fields.popupMessage;
    Object.freeze(this);
  }

  static fromResponse(data: unknown): Station {
    return new Station({
      code: text(data, "stn_cd"),
      name: text(data, "stn_nm"),
      latitude: floating(data, "latitude"),
      longitude: floating(data, "longitude"),
      group: text(data, "group"),
      major: text(data, "major"),
      popupType: text(data, "popupType"),
      popupMessage: text(data, "popupMessage"),
    });
  }

  /** 주요역(앱 상단에 먼저 노출되는 역)인지. */
  get isMajor(): boolean {
    return this.major !== "";
  }

  toString(): string {
    return `${this.name}(${this.code})`;
  }
}

/** `stationdata` 응답에서 역 목록을 뽑습니다. */
export function parseStations(payload: unknown): Station[] {
  const stns = field(payload, "stns");
  const stn = isResponseData(stns) ? stns.stn : undefined;
  return Array.isArray(stn) ? stn.map((entry) => Station.fromResponse(entry)) : [];
}
