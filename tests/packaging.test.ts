/**
 * 패키징 계약.
 *
 * 듀얼 패키지 설정이 깨지면 **JS 사용자만** 실패하는데, TS 로만 개발하면 그걸
 * 못 봅니다. 버전·exports·files·지원 Node 버전을 여기서 고정합니다.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import * as korailModule from "../src/index";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as Record<string, any>;
const tsconfig = JSON.parse(
  readFileSync("tsconfig.json", "utf8").replace(/^\s*\/\/.*$/gm, ""),
) as Record<string, any>;
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf8");

describe("버전", () => {
  it("package.json 의 version 은 플레이스홀더다", () => {
    // when & then
    // 버전의 유일한 출처는 git 태그입니다 — 릴리스 워크플로가 주입합니다.
    expect(packageJson.version).toBe("0.0.0");
  });

  it("릴리스가 태그에서 버전을 주입한다", () => {
    // when & then
    expect(releaseWorkflow).toContain("npm version");
    expect(releaseWorkflow).toContain("--no-git-tag-version");
  });

  it("릴리스 체크아웃이 얕지 않다", () => {
    // given
    const withoutComments = releaseWorkflow.replaceAll(/^\s*#.*$/gm, "");

    // when
    const fetchDepth = /fetch-depth:\s*(\d+)/.exec(withoutComments)?.[1];

    // then
    expect(fetchDepth).toBe("0");
  });

  it("릴리스가 provenance 와 함께 올린다", () => {
    // when & then
    expect(releaseWorkflow).toContain("--provenance");
    expect(releaseWorkflow).toContain("id-token: write");
  });

  it("게이트가 버전 주입보다 먼저 돈다", () => {
    // when
    const gates = releaseWorkflow.indexOf("name: 전 게이트 재실행");
    const inject = releaseWorkflow.indexOf("name: 태그에서 버전 주입");

    // then
    // 주입을 먼저 하면 위의 "version 은 플레이스홀더다" 테스트가 주입된 버전을
    // 보고 실패해, 릴리스가 배포 직전에 멈춥니다. 실제로 v0.1.0 에서 그렇게
    // 멈췄습니다 — 순서가 곧 계약입니다.
    expect(gates).toBeGreaterThan(-1);
    expect(inject).toBeGreaterThan(gates);
  });

  it("빌드와 배포는 버전 주입 뒤에 온다", () => {
    // when
    const inject = releaseWorkflow.indexOf("name: 태그에서 버전 주입");
    const build = releaseWorkflow.indexOf("run: pnpm build");
    const publish = releaseWorkflow.indexOf("npm publish");

    // then
    expect(build).toBeGreaterThan(inject);
    expect(publish).toBeGreaterThan(inject);
  });

  it("릴리스가 배포 전에 전 게이트를 다시 돌린다", () => {
    // when
    const gates = ["biome ci", "pnpm typecheck", "pnpm test"].filter(
      (gate) => !releaseWorkflow.includes(gate),
    );

    // then
    expect(gates).toEqual([]);
  });
});

describe("exports", () => {
  it("types → import → require 순서다", () => {
    // when
    const keys = Object.keys(packageJson.exports["."]);

    // then
    expect(keys).toEqual(["types", "import", "require"]);
  });

  it("ESM 과 CJS 가 서로 다른 파일을 가리킨다", () => {
    // when
    const entry = packageJson.exports["."];

    // then
    expect(entry.import.default).toBe("./dist/index.mjs");
    expect(entry.require.default).toBe("./dist/index.cjs");
  });

  it("CJS 조건이 자기 타입 선언을 가리킨다", () => {
    // when & then
    expect(packageJson.exports["."].require.types).toBe("./dist/index.d.cts");
  });

  it("package.json 을 노출한다", () => {
    // when & then
    expect(packageJson.exports["./package.json"]).toBe("./package.json");
  });

  it("최상위 main·module·types 가 exports 와 어긋나지 않는다", () => {
    // when
    const entry = packageJson.exports["."];

    // then
    expect([packageJson.main, packageJson.module, packageJson.types]).toEqual([
      entry.require.default,
      entry.import.default,
      entry.types,
    ]);
  });
});

describe("files", () => {
  it("dist 만 배포한다", () => {
    // when & then
    expect(packageJson.files).toEqual(["dist"]);
  });

  it("소스·테스트를 배포하지 않는다", () => {
    // when
    const leaked = (packageJson.files as string[]).filter((entry) =>
      ["src", "tests", "."].includes(entry),
    );

    // then
    expect(leaked).toEqual([]);
  });
});

describe("지원 Node 버전", () => {
  it("engines 하한이 20.19.0 이다", () => {
    // when & then
    expect(packageJson.engines.node).toBe(">=20.19.0");
  });

  it("tsconfig target 이 ES2022 다", () => {
    // when & then
    expect(tsconfig.compilerOptions.target).toBe("ES2022");
  });

  it("tsconfig lib 이 target 과 같다", () => {
    // when & then
    expect(tsconfig.compilerOptions.lib).toEqual(["ES2022"]);
  });

  it("CI 매트릭스가 engines 하한을 포함한다", () => {
    // when
    const matrix = /node:\s*\[([^\]]+)\]/.exec(ciWorkflow)?.[1] ?? "";
    const versions = matrix.split(",").map((value) => value.trim().replaceAll('"', ""));

    // then
    expect(versions).toEqual(["20", "22", "24"]);
  });

  it("릴리스 잡이 Trusted Publishing 최소 Node 버전을 만족한다", () => {
    // given
    const declared = /node-version:\s*"([^"]+)"/.exec(releaseWorkflow)?.[1] ?? "";

    // when
    const [major = 0, minor = 0] = declared.split(".").map(Number);

    // then
    // npm Trusted Publishing(OIDC)은 npm >= 11.5.1 · Node >= 22.14 를 요구합니다.
    // Node 20.19 에 동봉된 npm 은 10.8.2 라, 낮추면 토큰 없는 배포로 전환할 수
    // 없게 됩니다 — 그때 가서야 드러나므로 여기서 막습니다.
    expect(major * 1000 + minor).toBeGreaterThanOrEqual(22 * 1000 + 14);
  });

  it("CI 가 ESM·CJS 를 둘 다 불러 본다", () => {
    // when & then
    expect(ciWorkflow).toContain("dist/index.mjs");
    expect(ciWorkflow).toContain("dist/index.cjs");
  });

  it("필수 체크를 ci-ok 하나로 모은다", () => {
    // when & then
    expect(ciWorkflow).toContain("name: ci-ok");
    expect(ciWorkflow).toContain("needs: [lint, test, build, security]");
  });

  it("CI 가 Trivy 로 HIGH·CRITICAL 을 막는다", () => {
    // when & then
    expect(ciWorkflow).toContain("trivy-action");
    expect(ciWorkflow).toContain("HIGH,CRITICAL");
  });
});

describe("엄격 설정", () => {
  it.each([
    ["strict", true],
    ["noUncheckedIndexedAccess", true],
    ["exactOptionalPropertyTypes", true],
    ["verbatimModuleSyntax", true],
  ])("%s 가 켜져 있다", (option, expected) => {
    // when & then
    expect(tsconfig.compilerOptions[option]).toBe(expected);
  });

  it("타입만 있는 패키지가 아니라 런타임 의존을 명시한다", () => {
    // when & then
    expect(Object.keys(packageJson.dependencies)).toEqual(["node-tls-client"]);
  });

  it("패키지 매니저가 pnpm 으로 고정돼 있다", () => {
    // when & then
    expect(packageJson.packageManager).toMatch(/^pnpm@/);
  });

  it("verify 가 네 게이트를 순서대로 돌린다", () => {
    // when & then
    expect(packageJson.scripts.verify).toBe(
      "pnpm format && pnpm lint && pnpm typecheck && pnpm test",
    );
  });
});

describe("pykorail 표면 파리티", () => {
  /**
   * pykorail 의 `__all__` 에 대응하는 이름들.
   *
   * 타입만 있는 것(`DeviceProfile` 등)은 런타임 export 가 없는 것이 정상이라 뺐고,
   * 이름이 갈린 둘은 korail.js 쪽 이름으로 적었습니다:
   * `PykorailError` → `KorailError`, `KorailError` → `KorailApiError`.
   */
  const EXPECTED = [
    "AdultPassenger",
    "Card",
    "ChildPassenger",
    "Disability1To3Passenger",
    "Disability4To6Passenger",
    "Korail",
    "KorailApiError",
    "KorailError",
    "LoginFailedError",
    "NeedToLoginError",
    "NetFunnelError",
    "NetFunnelHelper",
    "NoResultsError",
    "Passenger",
    "PastDepartureError",
    "RefundFee",
    "Reservation",
    "ReserveOption",
    "Schedule",
    "Seat",
    "SeniorPassenger",
    "SoldOutError",
    "Station",
    "StationNotFoundError",
    "Ticket",
    "ToddlerPassenger",
    "Train",
    "TrainType",
    "TransportError",
    "profileById",
    "randomProfile",
  ];

  it("pykorail 이 공개하는 것을 전부 공개한다", () => {
    // when
    const exported = new Set(Object.keys(korailModule));
    const missing = EXPECTED.filter((name) => !exported.has(name));

    // then
    expect(missing).toEqual([]);
  });

  it("버전은 코드가 아니라 package.json 으로 노출한다", () => {
    // when & then
    // pykorail 은 `__version__` 을 export 하지만, JS 에서는 소스에 버전을 박으면
    // 태그(유일한 출처)와 어긋납니다. 대신 package.json 을 exports 로 엽니다.
    expect("version" in korailModule).toBe(false);
    expect(packageJson.exports["./package.json"]).toBe("./package.json");
  });
});

/** `git check-ignore` 기준으로 무시되는 경로인지. */
function isIgnored(path: string): boolean {
  return spawnSync("git", ["check-ignore", "-q", path]).status === 0;
}

describe("에이전트 설정 커밋 가능성", () => {
  /**
   * 개발자 **전역** gitignore 에 `.claude/` 를 넣어 두는 경우가 흔합니다. 그러면
   * 서브에이전트와 스킬이 조용히 빠진 채 클론되고, `.agents/skills` 심볼릭 링크까지
   * 끊깁니다 — 저장소에서는 아무 에러도 안 나므로 클론한 사람만 겪습니다.
   */
  it.each([
    [".claude/agents/architecture-guard.md"],
    [".claude/agents/wire-parity-auditor.md"],
    [".claude/agents/test-author.md"],
    [".claude/skills/verify/SKILL.md"],
    [".claude/skills/commit/SKILL.md"],
    [".claude/skills/add-endpoint/SKILL.md"],
    [".claude/skills/add-error-code/SKILL.md"],
    [".agents/README.md"],
    [".cursor"],
    [".opencode"],
  ])("%s 가 커밋 대상이다", (path) => {
    // when & then
    expect(isIgnored(path)).toBe(false);
  });

  it.each([[".claude/settings.local.json"], [".claude/local/anything"]])(
    "%s 는 개인 로컬 설정이라 제외된다",
    (path) => {
      // when & then
      expect(isIgnored(path)).toBe(true);
    },
  );

  it(".agents/skills 심볼릭 링크가 실재하는 대상을 가리킨다", () => {
    // when
    const target = readlinkSync(".agents/skills");

    // then
    // 링크 대상이 gitignore 로 빠지면 클론한 쪽에서 이 링크가 끊깁니다.
    expect(existsSync(join(dirname(".agents/skills"), target))).toBe(true);
    expect(isIgnored(".claude/skills")).toBe(false);
  });

  it("CLAUDE.md 가 가리키는 스킬 파일이 전부 있다", () => {
    // given
    const claudeMd = readFileSync("CLAUDE.md", "utf8");

    // when
    const referenced = [...claudeMd.matchAll(/`(\.claude\/[^`]+\.md)`/g)].map((match) => match[1]);
    const broken = referenced.filter((path) => path !== undefined && !existsSync(path));

    // then
    expect(broken).toEqual([]);
  });
});
