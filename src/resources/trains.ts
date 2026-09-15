/** 열차 조회 리소스. */

import type { ApiClient } from "../api";
import { API_ENDPOINTS, APP_VERSION, DEVICE, KST_OFFSET_HOURS } from "../constants";
import { NoResultsError, PastDepartureError } from "../errors";
import { list } from "../models/parsing";
import {
  AdultPassenger,
  ChildPassenger,
  Disability1To3Passenger,
  Disability4To6Passenger,
  Passenger,
  SeniorPassenger,
  ToddlerPassenger,
} from "../models/passenger";
import { Train } from "../models/schedule";
import type { TrainTypeCode } from "../options";
import { TrainType } from "../options";
import { Resource } from "./base";
import type { StationResource } from "./stations";

const MILLIS_PER_MINUTE = 60_000;

/**
 * 과거 판정 유예(분). 호출자가 "지금" 을 그대로 넘겨도 계산·왕복 지연 때문에
 * 걸리는 일이 없도록 조금 봐줍니다. 이보다 더 지난 시각은 열차가 이미 떠났다는
 * 뜻이라 조회할 이유가 없습니다.
 */
export const PAST_TOLERANCE_MINUTES = 1;

/** KST 기준으로 쪼갠 시각. 폼에 실을 문자열과 사람이 읽을 표시형을 함께 냅니다. */
export interface KstMoment {
  /** `YYYYMMDD` (`txtGoAbrdDt`). */
  readonly date: string;
  /** `HHMMSS` (`txtGoHour`). */
  readonly time: string;
  /** `YYYY-MM-DD HH:MM` — 에러 메시지용. */
  readonly display: string;
}

/**
 * 순간(`Date`)을 KST 벽시계로 옮깁니다.
 *
 * 코레일 API 의 모든 날짜·시각은 KST 기준이라 기준을 여기 하나로 모읍니다 —
 * 실행 머신의 로컬 타임존에 결과가 흔들리면 안 됩니다. `Date` 의 UTC 성분에
 * +9시간을 더하는 **명시적 오프셋 산술**이고, 코레일의 `YYYYMMDD`·`HHMMSS`
 * 문자열을 `Date` 생성자에 넘기는 일은 없습니다(파싱이 구현 의존입니다).
 */
export function toKst(moment: Date = new Date()): KstMoment {
  const shifted = new Date(moment.getTime() + KST_OFFSET_HOURS * 60 * MILLIS_PER_MINUTE);
  const pad = (value: number, width = 2): string => String(value).padStart(width, "0");
  const year = pad(shifted.getUTCFullYear(), 4);
  const month = pad(shifted.getUTCMonth() + 1);
  const day = pad(shifted.getUTCDate());
  const hour = pad(shifted.getUTCHours());
  const minute = pad(shifted.getUTCMinutes());
  const second = pad(shifted.getUTCSeconds());

  return {
    date: `${year}${month}${day}`,
    time: `${hour}${minute}${second}`,
    display: `${year}-${month}-${day} ${hour}:${minute}`,
  };
}

/** {@link TrainResource.search} 옵션. */
export interface TrainSearchOptions {
  /**
   * 이 시각 **이후** 출발하는 열차를 그날 하루에서 찾습니다. 생략하면 지금.
   *
   * `Date` 는 절대 시각이라 어느 타임존에서 만들었든 KST 로 환산해 보냅니다 —
   * `new Date("2026-04-01T09:00:00+09:00")` 처럼 오프셋을 명시하는 편이 안전합니다.
   */
  readonly departAfter?: Date | undefined;
  /** 열차 종별 코드. 생략하면 전체. */
  readonly trainType?: TrainTypeCode | undefined;
  /** 생략하면 어른 1명. */
  readonly passengers?: readonly Passenger[] | undefined;
  /** 매진 열차도 포함합니다. */
  readonly includeNoSeats?: boolean | undefined;
  /** 예약대기 가능 열차도 포함합니다. */
  readonly includeWaitingList?: boolean | undefined;
  /**
   * 인근역 출발·도착 열차도 함께 봅니다 (앱의 "인접역").
   *
   * `depName`/`arrName` 이 요청한 역과 달라질 수 있습니다. 결과가 더해지는 것이
   * 아니라 후보가 넓어지는 것이라 켜면 뒤쪽 직통편이 밀려날 수 있어 기본값은 꺼짐입니다.
   */
  readonly includeNearbyStations?: boolean | undefined;
}

/** `korail.trains` — 시간표 조회. */
export class TrainResource extends Resource {
  readonly #stations: StationResource;

  /** 조회 전에 역 이름을 검증할지. 끄면 오타가 "열차 없음" 으로 보입니다. */
  validateStations: boolean;

  constructor(api: ApiClient, stations: StationResource, validateStations = true) {
    super(api);
    this.#stations = stations;
    this.validateStations = validateStations;
  }

  /**
   * 열차를 조회합니다.
   *
   * @throws {StationNotFoundError} `dep`/`arr` 이 역 마스터에 없습니다.
   * @throws {PastDepartureError} `departAfter` 가 이미 지난 시각입니다.
   * @throws {NoResultsError} 조건에 맞는 열차가 없습니다.
   */
  async search(dep: string, arr: string, options: TrainSearchOptions = {}): Promise<Train[]> {
    if (this.validateStations) {
      await this.#stations.ensureExist(dep, arr);
    }

    const departAfter = options.departAfter ?? new Date();
    this.#ensureNotPast(departAfter);
    const moment = toKst(departAfter);
    const reduced = Passenger.reduce(options.passengers ?? [new AdultPassenger()]);
    const trainType = options.trainType ?? TrainType.ALL;

    const total = (type: typeof Passenger): number =>
      reduced
        .filter((passenger) => passenger instanceof type)
        .reduce((sum, passenger) => sum + passenger.count, 0);

    const url = API_ENDPOINTS.searchSchedule;
    const { headers } = this.api.sign(url);
    // 조회는 다른 엔드포인트와 달리 Key 를 싣지 않고 빈 Sid 를 보냅니다 (앱 동작 그대로).
    const data = {
      Device: DEVICE,
      Version: APP_VERSION,
      Sid: "",
      txtMenuId: "11",
      radJobId: "1",
      selGoTrain: trainType,
      txtTrnGpCd: trainType,
      txtGoStart: dep,
      txtGoEnd: arr,
      txtGoAbrdDt: moment.date,
      txtGoHour: moment.time,
      txtPsgFlg_1: total(AdultPassenger),
      txtPsgFlg_2: total(ChildPassenger) + total(ToddlerPassenger),
      txtPsgFlg_3: total(SeniorPassenger),
      txtPsgFlg_4: total(Disability1To3Passenger),
      txtPsgFlg_5: total(Disability4To6Passenger),
      txtSeatAttCd_2: "000",
      txtSeatAttCd_3: "000",
      txtSeatAttCd_4: "015",
      ebizCrossCheck: "N",
      srtCheckYn: "N", // SRT 함께 보기
      rtYn: "N", // 왕복
      adjStnScdlOfrFlg: options.includeNearbyStations === true ? "Y" : "N", // 인접역 보기
      // 로그인 전이면 비어 있습니다. pykorail 은 파이썬 urlencode 를 거쳐 리터럴
      // `None` 을 보내지만, 앱이 그럴 리 없으므로 빈 문자열로 보냅니다 (AGENTS.md §3).
      mbCrdNo: this.api.account.membershipNumber,
    };

    // 조회는 **바디 없는 POST 에 쿼리스트링**으로 나갑니다 (앱 동작 그대로).
    // GET 으로 바꾸면 같은 필드가 실려도 서버가 보는 요청이 달라집니다.
    const payload = await this.api.post(url, { params: data, headers });
    this.api.check(payload);

    const trains = list(payload.trn_infos, "trn_info")
      .map((info) => Train.fromResponse(info))
      .filter((train) =>
        TrainResource.#keep(
          train,
          options.includeNoSeats === true,
          options.includeWaitingList === true,
        ),
      );

    if (trains.length === 0) {
      throw new NoResultsError();
    }
    return trains;
  }

  /**
   * 이미 지난 시각이면 요청을 보내기 전에 막습니다.
   *
   * 서버는 과거 시각에도 빈 결과를 줄 뿐이라, 오래 도는 취소표 대기 루프가
   * 출발 시각을 넘겨도 아무 신호 없이 계속 돕니다. 여기서 끊어 줍니다.
   */
  #ensureNotPast(moment: Date): void {
    const now = new Date();
    if (moment.getTime() < now.getTime() - PAST_TOLERANCE_MINUTES * MILLIS_PER_MINUTE) {
      throw new PastDepartureError(toKst(moment).display, toKst(now).display);
    }
  }

  /** 조회 결과 필터. `includeNoSeats` 는 사실상 "전부 보기"입니다. */
  static #keep(train: Train, includeNoSeats: boolean, includeWaitingList: boolean): boolean {
    return (
      train.hasSeat() ||
      (includeNoSeats && !train.hasSeat()) ||
      (includeWaitingList && train.hasWaitingList())
    );
  }
}
