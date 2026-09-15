/** NetFunnel 대기열 — 응답 파싱, 대기 폴링, 티켓 캐시. */

import { describe, expect, it } from "vitest";
import { NETFUNNEL_HEADERS, NETFUNNEL_URL, NetFunnelHelper } from "../src/auth/netfunnel";
import { NetFunnelError } from "../src/errors";
import type { HttpResponse, HttpSession, RequestOptions } from "../src/transport";

/** 미리 정해 둔 응답을 순서대로 돌려주는 가짜 대기열 세션. */
class FakeQueueSession implements HttpSession {
  readonly calls: RequestOptions[] = [];
  readonly headers: Record<string, string>;
  closed = false;
  #replies: string[];

  constructor(replies: string[], headers: Record<string, string> = {}) {
    this.#replies = [...replies];
    this.headers = headers;
  }

  async get(_url: string, options: RequestOptions = {}): Promise<HttpResponse> {
    this.calls.push(options);
    const next = this.#replies.shift();
    if (next === undefined) {
      throw new Error("준비된 응답이 더 없습니다");
    }
    return { text: next };
  }

  async post(): Promise<HttpResponse> {
    throw new Error("대기열은 GET 만 씁니다");
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}

function helperWith(replies: string[]): { helper: NetFunnelHelper; session: FakeQueueSession } {
  let session: FakeQueueSession | undefined;
  const helper = new NetFunnelHelper({
    pollIntervalMs: 0,
    sessionFactory: (headers) => {
      session = new FakeQueueSession(replies, { ...headers });
      return session;
    },
  });
  return { helper, session: session as FakeQueueSession };
}

const PASS = "200:key=TICKET&nwait=0";
const WAIT = "201:key=TICKET&nwait=12";
const COMPLETE = "200:key=TICKET";

describe("응답 파싱", () => {
  it("상태·키·대기인원을 뽑는다", () => {
    // when
    const parsed = NetFunnelHelper.parse("201:key=ABC&nwait=7");

    // then
    expect(parsed).toEqual({ status: "201", key: "ABC", nwait: "7" });
  });

  it("값에 = 가 들어 있어도 첫 = 에서만 자른다", () => {
    // when
    const parsed = NetFunnelHelper.parse("200:key=AB==CD");

    // then
    expect(parsed.key).toBe("AB==CD");
  });

  it.each([
    ["콜론이 없으면", "200"],
    ["파라미터가 비면", "200:"],
    ["아예 비면", ""],
  ])("%s 파싱 에러다", (_label, response) => {
    // when & then
    expect(() => NetFunnelHelper.parse(response)).toThrow(NetFunnelError);
  });
});

describe("run", () => {
  it("줄이 없으면 바로 티켓을 준다", async () => {
    // given
    const { helper } = helperWith([PASS, COMPLETE]);

    // when
    const key = await helper.run();

    // then
    expect(key).toBe("TICKET");
  });

  it("대기 중이면 통과할 때까지 다시 묻는다", async () => {
    // given
    const { helper, session } = helperWith([WAIT, WAIT, PASS, COMPLETE]);

    // when
    await helper.run();

    // then
    expect(session.calls).toHaveLength(4);
  });

  it("첫 요청은 sid·aid 를 싣는다", async () => {
    // given
    const { helper, session } = helperWith([PASS, COMPLETE]);

    // when
    await helper.run();

    // then
    expect(session.calls[0]?.params).toEqual({
      opcode: "5101",
      sid: "service_1",
      aid: "act_8",
    });
  });

  it("대기 확인 요청은 티켓과 ttl 을 싣는다", async () => {
    // given
    const { helper, session } = helperWith([WAIT, PASS, COMPLETE]);

    // when
    await helper.run();

    // then
    expect(session.calls[1]?.params).toEqual({
      opcode: "5002",
      sid: "service_1",
      aid: "act_8",
      key: "TICKET",
      ttl: "1",
    });
  });

  it("완료 요청은 티켓만 싣는다", async () => {
    // given
    const { helper, session } = helperWith([PASS, COMPLETE]);

    // when
    await helper.run();

    // then
    expect(session.calls[1]?.params).toEqual({ opcode: "5004", key: "TICKET" });
  });

  it("이미 완료된 상태(502)도 통과로 본다", async () => {
    // given
    const { helper } = helperWith([PASS, "502:key=TICKET"]);

    // when & then
    expect(await helper.run()).toBe("TICKET");
  });

  it("완료가 실패하면 NetFunnelError 다", async () => {
    // given
    const { helper } = helperWith([PASS, "999:key=TICKET"]);

    // when & then
    expect.assertions(1);
    await expect(helper.run()).rejects.toThrow(NetFunnelError);
  });

  it("전송이 실패해도 NetFunnelError 로 감싼다", async () => {
    // given
    const { helper } = helperWith([]);

    // when & then
    expect.assertions(1);
    await expect(helper.run()).rejects.toThrow(NetFunnelError);
  });

  it("실패하면 캐시를 비운다", async () => {
    // given
    const { helper, session } = helperWith([PASS, "999:key=TICKET", PASS, COMPLETE]);
    await expect(helper.run()).rejects.toThrow(NetFunnelError);

    // when
    await helper.run();

    // then
    expect(session.calls).toHaveLength(4);
  });

  it("두 번째 호출은 캐시된 티켓을 재사용한다", async () => {
    // given
    const { helper, session } = helperWith([PASS, COMPLETE]);
    await helper.run();

    // when
    const key = await helper.run();

    // then
    expect(key).toBe("TICKET");
    expect(session.calls).toHaveLength(2);
  });

  it("clear 하면 다시 받아온다", async () => {
    // given
    const { helper, session } = helperWith([PASS, COMPLETE, PASS, COMPLETE]);
    await helper.run();

    // when
    helper.clear();
    await helper.run();

    // then
    expect(session.calls).toHaveLength(4);
  });
});

describe("세션", () => {
  it("대기열 전용 헤더로 세션을 만든다", () => {
    // given
    const { session } = helperWith([]);

    // when & then
    expect(session.headers).toEqual({ ...NETFUNNEL_HEADERS });
  });

  it("close 하면 연결을 정리한다", async () => {
    // given
    const { helper, session } = helperWith([]);

    // when
    await helper.close();

    // then
    expect(session.closed).toBe(true);
  });

  it("대기열 주소는 코레일 앱 호스트가 아니다", () => {
    // when & then
    expect(NETFUNNEL_URL).toBe("http://nf.letskorail.com/ts.wseq");
  });
});
