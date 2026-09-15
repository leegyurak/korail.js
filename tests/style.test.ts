/**
 * 테스트 규약을 AST 로 강제합니다 (AGENTS.md §5.1·§5.2).
 *
 * 1. 테스트 함수 본문에 `if`/`for`/`while` **문**이 없을 것 (식은 허용)
 * 2. 모든 테스트에 `// when` 과 `// then` 이 있고 given → when → then 순서일 것
 *
 * 검사기는 파일 경로가 아니라 **소스 문자열**을 받습니다 — 그래야 일부러 규약을
 * 어긴 픽스처로 "검사기가 실제로 잡는지" 를 같은 파일 안에서 증명할 수 있습니다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const TESTS_DIR = new URL(".", import.meta.url).pathname;

/** 테스트를 정의하는 전역 함수 이름. `it.each(...)(...)` 처럼 체인도 뿌리로 판정합니다. */
const TEST_ROOTS = new Set(["it", "test"]);

/** 금지된 제어 흐름 **문**. 같은 일을 하는 **식**(삼항·`filter`·`map`)은 허용됩니다. */
const CONTROL_FLOW_KINDS = new Map<ts.SyntaxKind, string>([
  [ts.SyntaxKind.IfStatement, "if"],
  [ts.SyntaxKind.ForStatement, "for"],
  [ts.SyntaxKind.ForOfStatement, "for...of"],
  [ts.SyntaxKind.ForInStatement, "for...in"],
  [ts.SyntaxKind.WhileStatement, "while"],
  [ts.SyntaxKind.DoStatement, "do...while"],
]);

const MARKER_RANK = new Map<string, number>([
  ["given", 0],
  ["when", 1],
  ["when & then", 1],
  ["then", 2],
]);

const MARKER_PATTERN = /^\s*\/\/\s*(given|when\s*&\s*then|when|then)\b/i;

function parse(fileName: string, source: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
}

/** 호출식의 뿌리 식별자 이름. `it.each([])` · `describe.only` 의 `it`·`describe`. */
function rootName(expression: ts.Expression): string | undefined {
  let node: ts.Node = expression;
  while (ts.isPropertyAccessExpression(node) || ts.isCallExpression(node)) {
    node = node.expression;
  }
  return ts.isIdentifier(node) ? node.text : undefined;
}

/** 테스트 본문(블록)들. 이름과 함께 돌려줘 위반을 어느 테스트인지로 보고합니다. */
function testBodies(source: ts.SourceFile): { name: string; body: ts.Block }[] {
  const found: { name: string; body: ts.Block }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && TEST_ROOTS.has(rootName(node.expression) ?? "")) {
      const callback = node.arguments.find(
        (argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument),
      ) as ts.ArrowFunction | ts.FunctionExpression | undefined;
      const title = node.arguments[0];
      if (callback !== undefined && callback.body !== undefined && ts.isBlock(callback.body)) {
        found.push({
          name: title !== undefined && ts.isStringLiteralLike(title) ? title.text : "<이름 없음>",
          body: callback.body,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return found;
}

/** 테스트 본문 안의 제어 흐름 문 위반 목록. */
function controlFlowViolations(fileName: string, source: string): string[] {
  const parsed = parse(fileName, source);
  const violations: string[] = [];

  testBodies(parsed).forEach(({ name, body }) => {
    const visit = (node: ts.Node): void => {
      const keyword = CONTROL_FLOW_KINDS.get(node.kind);
      if (keyword !== undefined) {
        const { line } = parsed.getLineAndCharacterOfPosition(node.getStart(parsed));
        violations.push(`${fileName}:${line + 1} "${name}" 안의 ${keyword} 문`);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
  });

  return violations;
}

/** 본문 텍스트에서 given/when/then 마커를 등장 순서대로 뽑습니다. */
function markersOf(bodyText: string): string[] {
  return bodyText
    .split("\n")
    .map((line) => MARKER_PATTERN.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => (match[1] ?? "").toLowerCase().replace(/\s*&\s*/, " & "));
}

/** Given–When–Then 규약 위반 목록. */
function gwtViolations(fileName: string, source: string): string[] {
  const parsed = parse(fileName, source);
  const violations: string[] = [];

  testBodies(parsed).forEach(({ name, body }) => {
    const { line } = parsed.getLineAndCharacterOfPosition(body.getStart(parsed));
    const where = `${fileName}:${line + 1} "${name}"`;
    const markers = markersOf(body.getFullText(parsed));
    const ranks = markers.map((marker) => MARKER_RANK.get(marker) ?? -1);
    const combined = markers.includes("when & then");

    const missingWhen = !combined && !markers.includes("when");
    const missingThen = !combined && !markers.includes("then");
    const outOfOrder = ranks.some((rank, index) => index > 0 && rank < (ranks[index - 1] ?? -1));

    violations.push(...(missingWhen ? [`${where}: // when 주석이 없습니다`] : []));
    violations.push(...(missingThen ? [`${where}: // then 주석이 없습니다`] : []));
    violations.push(
      ...(outOfOrder ? [`${where}: 마커 순서가 given → when → then 이 아닙니다`] : []),
    );
  });

  return violations;
}

function testFiles(): { name: string; source: string }[] {
  return readdirSync(TESTS_DIR, { recursive: true, encoding: "utf8" })
    .filter((entry) => entry.endsWith(".test.ts"))
    .map((entry) => ({
      name: `tests/${entry}`,
      source: readFileSync(join(TESTS_DIR, entry), "utf8"),
    }));
}

const GOOD_FIXTURE = `
it("좋은 테스트", () => {
  // given
  const value = 1;

  // when
  const doubled = value * 2;

  // then
  expect(doubled).toBe(2);
});
`;

const CONTROL_FLOW_FIXTURE = `
it("나쁜 테스트", () => {
  // when
  for (const item of items) { check(item); }

  // then
  expect(true).toBe(true);
});
`;

const MISSING_MARKER_FIXTURE = `
it("마커 없는 테스트", () => {
  expect(1).toBe(1);
});
`;

const OUT_OF_ORDER_FIXTURE = `
it("순서가 뒤집힌 테스트", () => {
  // then
  const result = run();

  // when
  expect(result).toBe(1);
});
`;

const COMBINED_FIXTURE = `
it("예외를 검증하는 테스트", () => {
  // when & then
  expect(() => run()).toThrow();
});
`;

describe("테스트 규약", () => {
  it("테스트 본문에 제어 흐름 문이 없다", () => {
    // when
    const violations = testFiles().flatMap((file) => controlFlowViolations(file.name, file.source));

    // then
    expect(violations).toEqual([]);
  });

  it("모든 테스트가 given → when → then 을 지킨다", () => {
    // when
    const violations = testFiles().flatMap((file) => gwtViolations(file.name, file.source));

    // then
    expect(violations).toEqual([]);
  });

  it("검사할 테스트 파일을 실제로 찾는다", () => {
    // when
    const files = testFiles();

    // then
    expect(files.length).toBeGreaterThan(0);
  });
});

describe("검사기 자기 테스트", () => {
  it("규약을 지킨 픽스처는 통과시킨다", () => {
    // when
    const violations = [
      ...controlFlowViolations("fixture.ts", GOOD_FIXTURE),
      ...gwtViolations("fixture.ts", GOOD_FIXTURE),
    ];

    // then
    expect(violations).toEqual([]);
  });

  it("제어 흐름 문을 잡는다", () => {
    // when
    const violations = controlFlowViolations("fixture.ts", CONTROL_FLOW_FIXTURE);

    // then
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain("for...of");
  });

  it.each([
    ["when", "// when"],
    ["then", "// then"],
  ])("마커가 없으면 %s 를 지적한다", (_label, marker) => {
    // when
    const violations = gwtViolations("fixture.ts", MISSING_MARKER_FIXTURE);

    // then
    expect(violations.join("\n")).toContain(`${marker} 주석이 없습니다`);
  });

  it("마커 순서가 뒤집히면 잡는다", () => {
    // when
    const violations = gwtViolations("fixture.ts", OUT_OF_ORDER_FIXTURE);

    // then
    expect(violations.join("\n")).toContain("마커 순서가");
  });

  it("when & then 하나로 둘 다 만족시킨다", () => {
    // when
    const violations = gwtViolations("fixture.ts", COMBINED_FIXTURE);

    // then
    expect(violations).toEqual([]);
  });
});
