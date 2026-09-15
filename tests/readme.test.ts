/**
 * README · 레퍼런스가 실제 API 와 맞는지.
 *
 * 문서의 예제는 사용자가 가장 먼저 복사해 가는 코드입니다. 구현이 바뀌었는데
 * 문서만 남으면 "설치했더니 안 된다" 가 되므로, 문서에 나오는 이름과 옵션 키를
 * 실제 export 와 대조합니다.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as korailModule from "../src/index";

const README = readFileSync("README.md", "utf8");
const REFERENCE = readFileSync("docs/reference.md", "utf8");

/** ```ts / ```js 코드 블록 본문들. */
function codeBlocks(markdown: string): string[] {
  return [...markdown.matchAll(/```(?:ts|js)\n([\s\S]*?)```/g)].map((match) => match[1] ?? "");
}

/** `import { A, B } from "korail.js"` · `require("korail.js")` 에서 가져오는 이름들. */
function importedNames(markdown: string): string[] {
  const patterns = [
    /import\s*\{([^}]+)\}\s*from\s*"korail\.js"/g,
    /const\s*\{([^}]+)\}\s*=\s*require\("korail\.js"\)/g,
  ];
  return patterns
    .flatMap((pattern) => [...markdown.matchAll(pattern)])
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((name) => name.trim())
    .filter((name) => name !== "");
}

const EXPORTED = new Set(Object.keys(korailModule));

describe("README", () => {
  it("개발 중 배너가 남아 있지 않다", () => {
    // when & then
    expect(README).not.toContain("개발 중입니다");
    expect(README).not.toContain("목표 API");
  });

  it("코드 블록이 있다", () => {
    // when & then
    expect(codeBlocks(README).length).toBeGreaterThan(5);
  });

  it("가져오는 이름이 전부 실제 export 다", () => {
    // when
    const missing = importedNames(README).filter((name) => !EXPORTED.has(name));

    // then
    expect(missing).toEqual([]);
  });

  it.each([
    ["Korail.loggedIn", "Korail.loggedIn("],
    ["trains.search", "korail.trains.search("],
    ["reservations.create", "korail.reservations.create("],
    ["reservations.pay", "korail.reservations.pay("],
    ["tickets.refund", "korail.tickets.refund("],
    ["close", "korail.close()"],
  ])("%s 예제가 실제 메서드를 부른다", (_label, snippet) => {
    // when & then
    expect(README).toContain(snippet);
  });

  it("예제가 전부 await 을 붙인다", () => {
    // when
    const floating = codeBlocks(README)
      .flatMap((block) => block.split("\n"))
      .filter((line) => /^\s*korail\.(trains|reservations|tickets|stations)\./.test(line))
      .filter((line) => !line.includes("await"));

    // then
    expect(floating).toEqual([]);
  });

  it("레퍼런스로 가는 링크가 있다", () => {
    // when & then
    expect(README).toContain("docs/reference.md");
  });
});

describe("docs/reference.md", () => {
  it("아직 작성되지 않았다는 안내가 없다", () => {
    // when & then
    expect(REFERENCE).not.toContain("아직 작성되지 않았습니다");
  });

  it("가져오는 이름이 전부 실제 export 다", () => {
    // when
    const missing = importedNames(REFERENCE).filter((name) => !EXPORTED.has(name));

    // then
    expect(missing).toEqual([]);
  });

  it.each([
    ["Korail", "### `Korail`"],
    ["stations", "## `korail.stations`"],
    ["trains", "## `korail.trains`"],
    ["reservations", "## `korail.reservations`"],
    ["tickets", "## `korail.tickets`"],
    ["모델", "## 모델"],
    ["승객", "## 승객"],
    ["옵션", "## 옵션"],
    ["에러", "## 에러"],
    ["기기 프로파일", "## 기기 프로파일"],
    ["NetFunnel", "## NetFunnel 대기열"],
  ])("%s 절이 있다", (_label, heading) => {
    // when & then
    expect(REFERENCE).toContain(heading);
  });

  it("리소스의 공개 메서드가 전부 문서화돼 있다", () => {
    // given
    const methods = [
      "all(",
      "names(",
      "find(",
      "ensureExist(",
      "search(",
      "seats(",
      "create(",
      "pay(",
      "cancel(",
      "refundFee(",
      "refund(",
      "login(",
      "logout(",
      "close(",
      "loggedIn(",
    ];

    // when
    const undocumented = methods.filter((method) => !REFERENCE.includes(method));

    // then
    expect(undocumented).toEqual([]);
  });

  it("아직 검증되지 않은 것(로그인 경로)을 숨기지 않는다", () => {
    // when & then
    // 조회 경로는 2026-09-15 실측으로 통과가 확인됐지만 로그인 경로는 아닙니다.
    // "다 됩니다" 로 읽히게 두면 사용자가 배포하고 나서 알게 됩니다.
    expect(REFERENCE).toContain("로그인 엔드포인트는 아직 미검증입니다");
  });

  it("네이티브 바이너리가 프로세스를 죽일 수 있다는 것을 알린다", () => {
    // when & then
    // 우리 폴백이 못 잡는 실패 모드라 문서가 유일한 경고 지점입니다.
    expect(REFERENCE).toContain("process.exit(1)");
  });

  it("TS 시그니처와 JS 예제를 함께 싣는다", () => {
    // when
    const tsBlocks = [...REFERENCE.matchAll(/```ts\n/g)];
    const jsBlocks = [...REFERENCE.matchAll(/```js\n/g)];

    // then
    expect(tsBlocks.length).toBeGreaterThan(10);
    expect(jsBlocks.length).toBeGreaterThan(0);
  });
});
