/** 요청을 보내기 전에 클라이언트가 잡아내는 입력 오류. */

import { KorailError } from "./base";
import { closeMatches } from "./similarity";

/** 오타 제안에 쓸 유사도 하한. 낮추면 엉뚱한 역을 권하게 됩니다. */
const SUGGESTION_CUTOFF = 0.6;
const MAX_SUGGESTIONS = 3;

function describe(name: string, candidates: readonly string[]): string {
  if (candidates.length === 0) {
    return JSON.stringify(name);
  }
  const listed = candidates.map((candidate) => JSON.stringify(candidate)).join(", ");
  return `${JSON.stringify(name)} (혹시 ${listed}?)`;
}

/**
 * 역 마스터에 없는 역 이름입니다.
 *
 * 조회를 보내 봐야 빈 결과만 돌아오므로, 요청 전에 막고 오타 후보를 함께 알려
 * 줍니다. 서버 응답이 아니라 클라이언트 검증이라 {@link KorailApiError} 가 아닌
 * 형제 타입입니다.
 */
export class StationNotFoundError extends KorailError {
  /** 찾지 못한 역 이름들. 출발·도착이 둘 다 틀렸으면 둘 다 담깁니다. */
  readonly names: readonly string[];

  /** 이름별 오타 후보. */
  readonly suggestions: ReadonlyMap<string, readonly string[]>;

  constructor(names: readonly string[], known: Iterable<string> = []) {
    const knownNames = [...known];
    const suggestions = new Map<string, readonly string[]>(
      names.map((name) => [
        name,
        Object.freeze(closeMatches(name, knownNames, MAX_SUGGESTIONS, SUGGESTION_CUTOFF)),
      ]),
    );
    const listed = names.map((name) => describe(name, suggestions.get(name) ?? [])).join(", ");
    super(`존재하지 않는 역입니다: ${listed}`);

    this.names = Object.freeze([...names]);
    this.suggestions = suggestions;
  }
}

/**
 * 이미 지난 시각으로 열차를 조회했습니다.
 *
 * 서버는 과거 시각에도 그냥 빈 결과를 주기 때문에, "이미 떠난 열차" 와 "그 시간대에
 * 열차가 없음" 이 구분되지 않습니다. 취소표를 기다리는 루프가 출발 시각을 넘겨도
 * 조용히 계속 도는 상황을 막으려고 요청 전에 걸러냅니다.
 */
export class PastDepartureError extends KorailError {
  /** 호출자가 요청한 출발 시각 (KST 표시 문자열). */
  readonly requested: string;
  /** 판정 기준이 된 현재 시각 (KST 표시 문자열). */
  readonly now: string;

  constructor(requested: string, now: string) {
    super(`이미 지난 시각으로는 조회할 수 없습니다: 요청 ${requested} · 현재 ${now} (KST)`);
    this.requested = requested;
    this.now = now;
  }
}
