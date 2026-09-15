/** 로그인 수명 — 실패 경로가 전부 LoginFailedError 로 모이는지. */

import { describe, expect, it } from "vitest";
import { API_KEY, APP_VERSION, DEFAULT_HEADERS, DEVICE } from "../src/constants";
import { DEVICE_PROFILES, dalvikUserAgent } from "../src/device";
import { LoginFailedError, NoResultsError, TransportError } from "../src/errors";
import { Korail } from "../src/index";
import type { HttpSession } from "../src/transport";
import { makeKorail } from "./helpers";
import {
  CIPHER_PAYLOAD,
  cipherResponse,
  LOGIN_FAIL,
  LOGIN_OK,
  LOGIN_OK_WITHOUT_PROFILE,
  NO_RESULTS,
  NUMERIC_IDX_CIPHER_PAYLOAD,
  OK,
  PARTIAL_CIPHER_INFOS,
  UNUSABLE_CIPHER_PAYLOAD,
} from "./payloads";

const LOGIN_ROUTES = { code: CIPHER_PAYLOAD, login: LOGIN_OK, logout: OK };

describe("생성", () => {
  it("네트워크를 건드리지 않는다", () => {
    // when
    const { session } = makeKorail({});

    // then
    expect(session.calls).toEqual([]);
  });

  it("리소스를 전부 배선한다", () => {
    // when
    const { client } = makeKorail({});

    // then
    expect(
      [client.stations, client.trains, client.reservations, client.tickets].every(
        (resource) => resource !== undefined,
      ),
    ).toBe(true);
  });

  it("기본 헤더를 세션에 넘긴다", () => {
    // when
    const { session } = makeKorail({});

    // then
    expect(session.headers).toEqual({ ...DEFAULT_HEADERS });
  });

  it("기기 프로파일을 주면 User-Agent 가 그 기기를 가리킨다", () => {
    // given
    const profile = DEVICE_PROFILES[0];

    // when
    const { session } = makeKorail({}, { deviceProfile: profile });

    // then
    expect(session.headers["User-Agent"]).toBe(dalvikUserAgent(profile!));
  });

  it("기기 프로파일을 줘도 공유 기본 헤더는 오염되지 않는다", () => {
    // given
    const profile = DEVICE_PROFILES[0];

    // when
    makeKorail({}, { deviceProfile: profile });

    // then
    expect(DEFAULT_HEADERS["User-Agent"]).not.toBe(dalvikUserAgent(profile!));
  });

  it("verbose 를 켜고 끌 수 있다", () => {
    // given
    const { client } = makeKorail({});

    // when
    client.verbose = true;

    // then
    expect(client.verbose).toBe(true);
  });

  it("처음에는 로그인 상태가 아니다", () => {
    // when
    const { client } = makeKorail({});

    // then
    expect([client.logined, client.membershipNumber, client.name]).toEqual([
      false,
      undefined,
      undefined,
    ]);
  });
});

describe("login 성공", () => {
  it("계정 정보를 채운다", async () => {
    // given
    const { client } = makeKorail(LOGIN_ROUTES);

    // when
    await client.login("me@example.com", "password");

    // then
    expect([client.logined, client.membershipNumber, client.name, client.email]).toEqual([
      true,
      "1234567890",
      "홍길동",
      "me@example.com",
    ]);
  });

  it("로그인 폼 필드 집합 전체가 앱과 같다", async () => {
    // given
    const { client, session } = makeKorail(LOGIN_ROUTES);

    // when
    await client.login("me@example.com", "password");

    // then
    expect(Object.keys(session.formFor("login"))).toEqual([
      "Device",
      "Version",
      "Key",
      "txtMemberNo",
      "txtPwd",
      "txtInputFlg",
      "idx",
      "Sid",
    ]);
  });

  it("로그인만 실제 Sid 를 보낸다", async () => {
    // given
    const { client, session } = makeKorail(LOGIN_ROUTES);

    // when
    await client.login("me@example.com", "password");

    // then
    const form = session.formFor("login");
    expect(form.Sid).toMatch(/\n$/);
    expect([form.Device, form.Version, form.Key]).toEqual([DEVICE, APP_VERSION, API_KEY]);
  });

  it.each([
    ["이메일", "me@example.com", "5"],
    ["휴대폰", "010-1234-5678", "4"],
    ["회원번호", "1234567890", "2"],
  ])("%s 아이디는 조회 플래그 %s 를 쓴다", async (_label, korailId, flag) => {
    // given
    const { client, session } = makeKorail(LOGIN_ROUTES);

    // when
    await client.login(korailId, "password");

    // then
    expect(session.formFor("login").txtInputFlg).toBe(flag);
  });

  it("암호화 키 요청 폼이 앱과 같다", async () => {
    // given
    const { client, session } = makeKorail(LOGIN_ROUTES);

    // when
    await client.login("me@example.com", "password");

    // then
    expect(session.formFor("code")).toEqual({ code: "app.login.cphd" });
  });

  it("서버가 준 idx 를 문자열로 되돌려 보낸다", async () => {
    // given
    const { client, session } = makeKorail({
      ...LOGIN_ROUTES,
      code: NUMERIC_IDX_CIPHER_PAYLOAD,
    });

    // when
    await client.login("me@example.com", "password");

    // then
    expect(session.formFor("login").idx).toBe("7");
  });

  it("비밀번호를 평문으로 보내지 않는다", async () => {
    // given
    const { client, session } = makeKorail(LOGIN_ROUTES);

    // when
    await client.login("me@example.com", "hunter22");

    // then
    expect(session.formFor("login").txtPwd).not.toBe("hunter22");
  });

  it("프로필 필드가 없어도 로그인은 성공이다", async () => {
    // given
    const { client } = makeKorail({ ...LOGIN_ROUTES, login: LOGIN_OK_WITHOUT_PROFILE });

    // when
    await client.login("me@example.com", "password");

    // then
    expect([client.logined, client.name]).toEqual([true, undefined]);
  });

  it("loggedIn 은 만들자마자 로그인한다", async () => {
    // given
    const session = { closed: false };

    // when
    const client = await Korail.loggedIn("me@example.com", "password", {
      sessionFactory: () => {
        const fake = makeKorail(LOGIN_ROUTES).session;
        Object.assign(session, fake);
        return fake;
      },
    });

    // then
    expect(client.logined).toBe(true);
  });
});

describe("login 실패", () => {
  it.each([
    ["아이디가 비면", "", "password"],
    ["비밀번호가 비면", "me@example.com", ""],
    ["둘 다 비면", "", ""],
  ])("%s 요청 전에 막는다", async (_label, id, pw) => {
    // given
    const { client, session } = makeKorail(LOGIN_ROUTES);

    // when
    await expect(client.login(id, pw)).rejects.toThrow(LoginFailedError);

    // then
    expect(session.calls).toEqual([]);
  });

  it("하이픈 없는 휴대폰 번호를 요청 전에 막는다", async () => {
    // given
    const { client, session } = makeKorail(LOGIN_ROUTES);

    // when
    await expect(client.login("01012345678", "password")).rejects.toThrow(/010-1234-5678/);

    // then
    expect(session.calls).toEqual([]);
  });

  it.each(PARTIAL_CIPHER_INFOS.map((info, index) => [index, info]))(
    "암호화 키 응답이 덜 오면(%i) LoginFailedError 다",
    async (_index, cipherInfo) => {
      // given
      const { client } = makeKorail({ ...LOGIN_ROUTES, code: cipherResponse(cipherInfo) });

      // when & then
      expect.assertions(1);
      await expect(client.login("me@example.com", "password")).rejects.toThrow(LoginFailedError);
    },
  );

  it("암호화 키 발급이 실패하면 LoginFailedError 다", async () => {
    // given
    const { client } = makeKorail({ ...LOGIN_ROUTES, code: NO_RESULTS });

    // when & then
    expect.assertions(1);
    await expect(client.login("me@example.com", "password")).rejects.toThrow(
      /암호화 키를 발급받지 못했습니다/,
    );
  });

  it("쓸 수 없는 키를 받으면 LoginFailedError 다", async () => {
    // given
    const { client } = makeKorail({ ...LOGIN_ROUTES, code: UNUSABLE_CIPHER_PAYLOAD });

    // when & then
    expect.assertions(1);
    await expect(client.login("me@example.com", "password")).rejects.toThrow(/키를 쓸 수 없습니다/);
  });

  it("서버가 거부하면 그 이유를 그대로 전한다", async () => {
    // given
    const { client } = makeKorail({ ...LOGIN_ROUTES, login: LOGIN_FAIL });

    // when & then
    expect.assertions(2);
    await expect(client.login("me@example.com", "wrong")).rejects.toThrow("비밀번호가 틀렸습니다");
    expect(client.logined).toBe(false);
  });

  it("회원번호가 없으면 실패로 본다", async () => {
    // given
    const { client } = makeKorail({ ...LOGIN_ROUTES, login: { strResult: "SUCC" } });

    // when & then
    expect.assertions(1);
    await expect(client.login("me@example.com", "password")).rejects.toThrow(LoginFailedError);
  });

  it("실패 이유가 없으면 기본 메시지를 쓴다", async () => {
    // given
    const { client } = makeKorail({ ...LOGIN_ROUTES, login: { strResult: "FAIL" } });

    // when & then
    expect.assertions(1);
    await expect(client.login("me@example.com", "password")).rejects.toThrow(
      /아이디 또는 비밀번호가 올바르지 않습니다/,
    );
  });

  it("loggedIn 은 실패하면 연결을 닫는다", async () => {
    // given
    let created: HttpSession | undefined;
    const { session } = makeKorail({ ...LOGIN_ROUTES, login: LOGIN_FAIL });

    // when
    await expect(
      Korail.loggedIn("me@example.com", "wrong", {
        sessionFactory: () => {
          created = session;
          return session;
        },
      }),
    ).rejects.toThrow(LoginFailedError);

    // then
    expect((created as typeof session).closed).toBe(true);
  });
});

describe("logout · close", () => {
  it("로그아웃하면 계정 정보를 비운다", async () => {
    // given
    const { client } = makeKorail(LOGIN_ROUTES);
    await client.login("me@example.com", "password");

    // when
    await client.logout();

    // then
    expect([client.logined, client.membershipNumber, client.email, client.phoneNumber]).toEqual([
      false,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("로그아웃은 연결을 닫지 않는다", async () => {
    // given
    const { client, session } = makeKorail(LOGIN_ROUTES);
    await client.login("me@example.com", "password");

    // when
    await client.logout();

    // then
    expect(session.closed).toBe(false);
  });

  it("close 는 연결을 닫는다", async () => {
    // given
    const { client, session } = makeKorail({});

    // when
    await client.close();

    // then
    expect(session.closed).toBe(true);
  });
});

describe("세션 공유", () => {
  it("모든 요청이 같은 세션으로 나간다", async () => {
    // given
    const { client, session } = makeKorail({
      ...LOGIN_ROUTES,
      stationdata: { stns: { stn: [] } },
    });

    // when
    await client.login("me@example.com", "password");
    await client.stations.all();

    // then
    expect(session.urls()).toHaveLength(3);
  });

  it("로그인한 회원번호를 조회 리소스가 함께 본다", async () => {
    // given
    const { client, session } = makeKorail({
      ...LOGIN_ROUTES,
      stationdata: { stns: { stn: [{ stn_nm: "서울" }, { stn_nm: "부산" }] } },
      searchSchedule: NO_RESULTS,
    });
    await client.login("me@example.com", "password");

    // when
    await expect(client.trains.search("서울", "부산")).rejects.toThrow(NoResultsError);

    // then
    expect(session.formFor("searchSchedule").mbCrdNo).toBe("1234567890");
  });
});

describe("응답 해석", () => {
  it("JSON 이 아니면 TransportError 다", async () => {
    // given
    const client = new Korail({
      sessionFactory: () => ({
        get: async () => ({ text: "<html>점검 중</html>" }),
        post: async () => ({ text: "<html>점검 중</html>" }),
        close: async () => undefined,
      }),
    });

    // when & then
    expect.assertions(1);
    await expect(client.stations.all()).rejects.toThrow(TransportError);
  });

  it("객체가 아닌 JSON 이면 TransportError 다", async () => {
    // given
    const client = new Korail({
      sessionFactory: () => ({
        get: async () => ({ text: "[]" }),
        post: async () => ({ text: "[]" }),
        close: async () => undefined,
      }),
    });

    // when & then
    expect.assertions(1);
    await expect(client.stations.all()).rejects.toThrow(/객체가 아닙니다/);
  });
});
