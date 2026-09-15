/**
 * 역 이름 오타 제안에 쓰는 유사도 — 파이썬 `difflib` 과 같은 값을 냅니다.
 *
 * pykorail 은 `difflib.get_close_matches` 로 후보를 고릅니다. 두 구현이 다른
 * 후보를 내놓으면 같은 오타에 서로 다른 안내가 나가므로, 알고리즘(가장 긴
 * 일치 블록을 재귀로 쪼개며 세는 `SequenceMatcher.ratio`)을 그대로 옮깁니다.
 *
 * 파이썬의 `autojunk`(길이 200 이상인 시퀀스에서 빈출 원소를 무시하는 휴리스틱)는
 * 넣지 않았습니다 — 역 이름은 길어야 예닐곱 자라 절대 발동하지 않습니다.
 */

/** 문자 → 등장 인덱스 목록. */
function indexMap(chars: readonly string[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  chars.forEach((char, index) => {
    const bucket = map.get(char);
    if (bucket === undefined) {
      map.set(char, [index]);
    } else {
      bucket.push(index);
    }
  });
  return map;
}

/** `a[alo:ahi]` 와 `b[blo:bhi]` 의 가장 긴 공통 블록 `[i, j, size]`. */
function longestMatch(
  a: readonly string[],
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
  b2j: Map<string, number[]>,
): [number, number, number] {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let j2len = new Map<number, number>();

  for (let i = alo; i < ahi; i += 1) {
    const newj2len = new Map<number, number>();
    for (const j of b2j.get(a[i] ?? "") ?? []) {
      if (j < blo) {
        continue;
      }
      if (j >= bhi) {
        break;
      }
      const k = (j2len.get(j - 1) ?? 0) + 1;
      newj2len.set(j, k);
      if (k > bestsize) {
        besti = i - k + 1;
        bestj = j - k + 1;
        bestsize = k;
      }
    }
    j2len = newj2len;
  }

  return [besti, bestj, bestsize];
}

/** 두 문자열의 `difflib.SequenceMatcher(None, a, b).ratio()`. */
export function similarity(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  const total = left.length + right.length;
  if (total === 0) {
    return 1;
  }

  const b2j = indexMap(right);
  let matches = 0;
  const queue: [number, number, number, number][] = [[0, left.length, 0, right.length]];

  while (queue.length > 0) {
    const region = queue.pop();
    if (region === undefined) {
      break;
    }
    const [alo, ahi, blo, bhi] = region;
    const [i, j, size] = longestMatch(left, alo, ahi, blo, bhi, b2j);
    if (size === 0) {
      continue;
    }
    matches += size;
    if (alo < i && blo < j) {
      queue.push([alo, i, blo, j]);
    }
    if (i + size < ahi && j + size < bhi) {
      queue.push([i + size, ahi, j + size, bhi]);
    }
  }

  return (2 * matches) / total;
}

/**
 * `word` 와 가장 비슷한 후보 최대 `n` 개. `difflib.get_close_matches` 와 같습니다.
 *
 * 동점은 문자열 내림차순으로 끊습니다 — 파이썬의 `heapq.nlargest` 가 `(비율, 값)`
 * 튜플을 비교하는 동작을 그대로 옮긴 것이라, 두 구현이 같은 후보를 같은 순서로 냅니다.
 */
export function closeMatches(
  word: string,
  possibilities: Iterable<string>,
  n = 3,
  cutoff = 0.6,
): string[] {
  return [...possibilities]
    .map((candidate) => ({ candidate, score: similarity(word, candidate) }))
    .filter(({ score }) => score >= cutoff)
    .sort((x, y) => y.score - x.score || (x.candidate < y.candidate ? 1 : -1))
    .slice(0, n)
    .map(({ candidate }) => candidate);
}
