/**
 * 전송 계층 — 폼 인코딩 파리티와 세션 재사용.
 *
 * 기대값은 파이썬 `urllib.parse.urlencode` 가 낸 것을 그대로 박아 둔 것입니다.
 * `~` 와 `*` 처럼 두 언어의 safe 문자 집합이 갈리는 경계를 여기서 고정합니다 —
 * 지금 나가는 값에는 안 걸리지만, 새 필드의 값에 무엇이 들어갈지는 알 수 없습니다.
 */

import { describe, expect, it, vi } from "vitest";
import { DEFAULT_HEADERS } from "../src/constants";
import type { FormValues } from "../src/transport";
import { createSession, encodeForm, withQuery } from "../src/transport";

/** [입력, 파이썬 `urlencode` 결과]. */
const PYTHON_PARITY: readonly [FormValues, string][] = [
  [{ a: "서울" }, "a=%EC%84%9C%EC%9A%B8"],
  [{ a: "b c" }, "a=b+c"],
  [{ a: "~tilde" }, "a=~tilde"],
  [{ a: "*star*" }, "a=%2Astar%2A"],
  [{ a: "quote'" }, "a=quote%27"],
  [{ a: "(paren)" }, "a=%28paren%29"],
  [{ a: "bang!" }, "a=bang%21"],
  [{ a: "plus+sign" }, "a=plus%2Bsign"],
  [{ a: "amp&eq=" }, "a=amp%26eq%3D"],
  [{ a: "slash/colon:" }, "a=slash%2Fcolon%3A"],
  [{ a: "PcEG6luXPgnzvVL6SRp8Cw==\n" }, "a=PcEG6luXPgnzvVL6SRp8Cw%3D%3D%0A"],
  [{ a: "dash-dot._under_" }, "a=dash-dot._under_"],
  [{ a: "퍼센트%" }, "a=%ED%8D%BC%EC%84%BC%ED%8A%B8%25"],
  [{ a: "", b: "x" }, "a=&b=x"],
  [
    { txtGoStart: "서울", txtGoEnd: "부산" },
    "txtGoStart=%EC%84%9C%EC%9A%B8&txtGoEnd=%EB%B6%80%EC%82%B0",
  ],
  [{ a: "emoji😀" }, "a=emoji%F0%9F%98%80"],
];

describe("encodeForm", () => {
  it.each(PYTHON_PARITY.map(([values, expected], index) => [index, values, expected]))(
    "파이썬 urlencode 와 같다 (%i)",
    (_index, values, expected) => {
      // when & then
      expect(encodeForm(values as FormValues)).toBe(expected);
    },
  );

  it.each([
    ["undefined 는 빈 값", { a: undefined }, "a="],
    ["null 은 빈 값", { a: null }, "a="],
    ["숫자는 문자열로", { a: 12 }, "a=12"],
    ["불리언도 문자열로", { a: false }, "a=false"],
  ])("%s", (_label, values, expected) => {
    // when & then
    expect(encodeForm(values as FormValues)).toBe(expected);
  });

  it("`undefined` 라는 글자가 나가지 않는다", () => {
    // when
    const encoded = encodeForm({ a: undefined, b: null });

    // then
    expect(encoded).not.toContain("undefined");
    expect(encoded).not.toContain("null");
  });

  it("키 순서를 입력 순서대로 유지한다", () => {
    // when
    const encoded = encodeForm({ z: "1", a: "2", m: "3" });

    // then
    expect(encoded).toBe("z=1&a=2&m=3");
  });

  it("키도 이스케이프한다", () => {
    // when & then
    expect(encodeForm({ "a b": "c" })).toBe("a+b=c");
  });

  it("빈 폼은 빈 문자열이다", () => {
    // when & then
    expect(encodeForm({})).toBe("");
  });
});

describe("withQuery", () => {
  it("파라미터가 있으면 쿼리스트링을 붙인다", () => {
    // when & then
    expect(withQuery("https://x/y", { a: "1" })).toBe("https://x/y?a=1");
  });

  it.each([
    ["undefined 면", undefined],
    ["빈 객체면", {}],
  ])("%s URL 을 그대로 준다", (_label, params) => {
    // when & then
    expect(withQuery("https://x/y", params)).toBe("https://x/y");
  });
});

describe("createSession", () => {
  it("헤더를 복사해 들고 있다", async () => {
    // given
    const headers: Record<string, string> = { ...DEFAULT_HEADERS };

    // when
    const session = createSession(headers);
    headers["User-Agent"] = "바뀐 값";

    // then
    await expect(session.close()).resolves.toBeUndefined();
  });

  it("요청 전에는 네이티브 세션을 만들지 않는다", async () => {
    // given
    const created: unknown[] = [];
    vi.doMock("node-tls-client", () => ({
      Session: class {
        constructor(config: unknown) {
          created.push(config);
        }
        async close(): Promise<void> {
          return undefined;
        }
      },
    }));
    const { createSession: freshCreateSession } = await import("../src/transport");

    // when
    const session = freshCreateSession({ ...DEFAULT_HEADERS });
    await session.close();

    // then
    expect(created).toEqual([]);
    vi.doUnmock("node-tls-client");
  });

  it("네이티브 모듈을 못 불러오면 fetch 로 폴백하고 크게 경고한다", async () => {
    // given
    // pykorail 이 curl_cffi 를 못 쓸 때 requests 로 내려앉는 것과 같은 자리입니다.
    vi.doMock("node-tls-client", () => {
      throw new Error("네이티브 바이너리 없음");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { headers: { "set-cookie": "SID=abc; Path=/" } }));
    const { createSession: freshCreateSession } = await import("../src/transport");

    // when
    const session = freshCreateSession({ ...DEFAULT_HEADERS });
    const response = await session.get("https://x/y");

    // then
    expect(response.text).toBe("{}");
    expect(warn.mock.calls[0]?.[0]).toContain("TLS 지문이 달라져");
    fetchMock.mockRestore();
    warn.mockRestore();
    vi.doUnmock("node-tls-client");
  });

  it("fetch 폴백이 세션 쿠키를 후속 요청에 다시 싣는다", async () => {
    // given
    // 세션 쿠키가 실리지 않으면 서버는 P058 을 주고, 그건 "로그인이 안 된다" 로
    // 오인됩니다 — fetch 는 쿠키를 자동 보관하지 않으므로 직접 모아 보냅니다.
    vi.doMock("node-tls-client", () => {
      throw new Error("네이티브 바이너리 없음");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // Response 본문은 한 번만 읽을 수 있어 호출마다 새로 만들어 줍니다.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response("{}", { headers: { "set-cookie": "SID=abc; Path=/" } }),
      );
    const { createSession: freshCreateSession } = await import("../src/transport");
    const session = freshCreateSession({ ...DEFAULT_HEADERS });
    await session.get("https://x/y");

    // when
    await session.post("https://x/z", { data: { a: "1" } });

    // then
    const second = fetchMock.mock.calls[1]?.[1] as { headers: Record<string, string> };
    expect(second.headers.Cookie).toBe("SID=abc");
    expect(second.headers.Host).toBeUndefined();
    vi.restoreAllMocks();
    vi.doUnmock("node-tls-client");
  });

  it("세션 하나가 쿠키 저장소 하나를 들고 요청마다 재사용된다", async () => {
    // given
    const created: unknown[] = [];
    const lifecycle: string[] = [];
    vi.doMock("node-tls-client", () => ({
      initTLS: async () => {
        lifecycle.push("init");
      },
      destroyTLS: async () => {
        lifecycle.push("destroy");
      },
      Session: class {
        constructor(config: unknown) {
          created.push(config);
        }
        async get(): Promise<{ body: string }> {
          return { body: "{}" };
        }
        async post(): Promise<{ body: string }> {
          return { body: "{}" };
        }
        async close(): Promise<void> {
          lifecycle.push("close");
        }
      },
    }));
    const { createSession: freshCreateSession } = await import("../src/transport");
    const session = freshCreateSession({ ...DEFAULT_HEADERS });

    // when
    await session.get("https://x/y");
    await session.post("https://x/y", { data: { a: "1" } });
    await session.close();

    // then
    expect(created).toHaveLength(1);
    // initTLS 를 빼면 첫 요청이 "Client not initialized" 로 죽고, destroyTLS 를
    // 빼면 네이티브 워커 풀이 남아 프로세스가 끝나지 않습니다.
    expect(lifecycle).toEqual(["init", "close", "destroy"]);
    vi.doUnmock("node-tls-client");
  });

  it("초기화는 세션당 한 번만 한다", async () => {
    // given
    const lifecycle: string[] = [];
    vi.doMock("node-tls-client", () => ({
      initTLS: async () => {
        lifecycle.push("init");
      },
      destroyTLS: async () => undefined,
      Session: class {
        async get(): Promise<{ body: string }> {
          return { body: "{}" };
        }
        async post(): Promise<{ body: string }> {
          return { body: "{}" };
        }
        async close(): Promise<void> {
          return undefined;
        }
      },
    }));
    const { createSession: freshCreateSession } = await import("../src/transport");
    const session = freshCreateSession({ ...DEFAULT_HEADERS });

    // when
    await session.get("https://x/y");
    await session.get("https://x/z");

    // then
    expect(lifecycle).toEqual(["init"]);
    vi.doUnmock("node-tls-client");
  });
});
