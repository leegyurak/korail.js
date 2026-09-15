/** 역 마스터 리소스. */

import type { ApiClient } from "../api";
import { API_ENDPOINTS } from "../constants";
import { StationNotFoundError } from "../errors";
import { parseStations, type Station } from "../models/station";
import { Resource } from "./base";

/** `korail.stations` — 역 조회와 이름 검증. */
export class StationResource extends Resource {
  #cache: readonly Station[] | undefined;
  #names: ReadonlySet<string> = new Set();

  constructor(api: ApiClient) {
    super(api);
  }

  /**
   * 역 마스터 전체 (`com.korail.mobile.common.stationdata`).
   *
   * 앱과 동일하게 파라미터 없는 bodyless POST 로 호출합니다. 로그인·서명이
   * 필요 없는 공개 조회라 로그인 전에도 부를 수 있습니다.
   *
   * 역 목록은 거의 바뀌지 않고 이름 검증에도 쓰이므로 **리소스 수명 동안
   * 캐시**합니다. 새로 받아오려면 `refresh: true`.
   */
  async all(refresh = false): Promise<Station[]> {
    if (refresh || this.#cache === undefined) {
      const stations = parseStations(await this.api.post(API_ENDPOINTS.stationdata));
      this.#cache = Object.freeze(stations);
      this.#names = new Set(stations.map((station) => station.name));
    }
    // 호출부가 배열을 건드려도 캐시가 깨지지 않도록 복사본을 줍니다.
    return [...this.#cache];
  }

  /** 역 이름 집합 (캐시 사용). */
  async names(): Promise<Set<string>> {
    await this.all();
    return new Set(this.#names);
  }

  /** 이름이 정확히 일치하는 역. 없으면 `undefined`. */
  async find(name: string): Promise<Station | undefined> {
    const stations = await this.all();
    return stations.find((station) => station.name === name);
  }

  /**
   * 역 마스터에 없는 이름이면 조회를 보내기 전에 막습니다.
   *
   * 서버는 없는 역에도 그냥 빈 결과를 주기 때문에, 오타와 "그 시간대에 열차가
   * 없음"이 구분되지 않습니다. 여기서 갈라 놓습니다.
   *
   * @throws {StationNotFoundError} 하나라도 역 마스터에 없습니다.
   */
  async ensureExist(...names: string[]): Promise<void> {
    await this.all(); // 캐시 채우기
    const unknown = names.filter((name) => !this.#names.has(name));
    if (unknown.length > 0) {
      throw new StationNotFoundError(unknown, this.#names);
    }
  }
}
