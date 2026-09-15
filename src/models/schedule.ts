/**
 * 열차 시간표와 좌석 가용 정보.
 *
 * 모든 응답 모델은 **불변**이고 `fromResponse` 로만 만듭니다. 생성자는 순수한
 * 값 조립이고 응답 해석은 전부 `fromResponse` 안에 있어서, "반쯤 채워진 객체"가
 * 돌아다닐 여지가 없습니다.
 */

import { hhmm, integer, mmdd, text } from "./parsing";

/**
 * `h_wait_rsv_flg` 가 없을 때 쓰는 값. "예약대기라는 개념이 적용되지 않는 열차"를
 * 뜻하며, 앱의 음수 관례를 그대로 따릅니다.
 */
export const WAITING_NOT_APPLICABLE = -1;

const SEAT_AVAILABLE = "11";
const WAITING_LIST_OPEN = 9;

/** `HHMMSS` → 자정 기준 분. 못 읽으면 `undefined`. */
function minutesOf(value: string): number | undefined {
  if (value.length < 4 || !/^\d{4}/.test(value)) {
    return undefined;
  }
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(2, 4));
}

/**
 * 소요 시간(분)을 읽기 쉬운 한국어로.
 *
 * `355` 처럼 큰 값을 그냥 "355분" 으로 보여주면 몇 시간짜리인지 바로 안 들어옵니다.
 * 한 시간이 넘으면 시간 단위로 끊고, 딱 떨어지면 "분" 을 생략합니다.
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${remainder}분`;
  }
  if (remainder === 0) {
    return `${hours}시간`;
  }
  return `${hours}시간 ${remainder}분`;
}

/** {@link Schedule} 생성자 인자. */
export interface ScheduleFields {
  readonly trainType: string;
  readonly trainTypeName: string;
  readonly trainGroup: string;
  readonly trainNo: string;
  readonly delayTime: string;
  readonly depName: string;
  readonly depCode: string;
  readonly depDate: string;
  readonly depTime: string;
  readonly arrName: string;
  readonly arrCode: string;
  readonly arrDate: string;
  readonly arrTime: string;
  readonly runDate: string;
}

/** 응답 → {@link ScheduleFields}. 하위 타입이 자기 필드를 얹어 확장합니다. */
export function scheduleFieldsFrom(data: unknown): ScheduleFields {
  return {
    trainType: text(data, "h_trn_clsf_cd"),
    trainTypeName: text(data, "h_trn_clsf_nm"),
    trainGroup: text(data, "h_trn_gp_cd"),
    trainNo: text(data, "h_trn_no"),
    delayTime: text(data, "h_expct_dlay_hr"),
    depName: text(data, "h_dpt_rs_stn_nm"),
    depCode: text(data, "h_dpt_rs_stn_cd"),
    depDate: text(data, "h_dpt_dt"),
    depTime: text(data, "h_dpt_tm"),
    arrName: text(data, "h_arv_rs_stn_nm"),
    arrCode: text(data, "h_arv_rs_stn_cd"),
    arrDate: text(data, "h_arv_dt"),
    arrTime: text(data, "h_arv_tm"),
    runDate: text(data, "h_run_dt"),
  };
}

/** 열차 운행 한 건 — 어디서 몇 시에 떠나 어디에 몇 시에 닿는지. */
export class Schedule implements ScheduleFields {
  readonly trainType: string;
  readonly trainTypeName: string;
  readonly trainGroup: string;
  readonly trainNo: string;
  readonly delayTime: string;
  readonly depName: string;
  readonly depCode: string;
  readonly depDate: string;
  readonly depTime: string;
  readonly arrName: string;
  readonly arrCode: string;
  readonly arrDate: string;
  readonly arrTime: string;
  readonly runDate: string;

  constructor(fields: ScheduleFields) {
    this.trainType = fields.trainType;
    this.trainTypeName = fields.trainTypeName;
    this.trainGroup = fields.trainGroup;
    this.trainNo = fields.trainNo;
    this.delayTime = fields.delayTime;
    this.depName = fields.depName;
    this.depCode = fields.depCode;
    this.depDate = fields.depDate;
    this.depTime = fields.depTime;
    this.arrName = fields.arrName;
    this.arrCode = fields.arrCode;
    this.arrDate = fields.arrDate;
    this.arrTime = fields.arrTime;
    this.runDate = fields.runDate;
    // 하위 타입(Train)이 자기 필드를 채울 수 있도록, 동결은 **가장 파생된**
    // 생성자에서만 합니다. 여기서 무조건 얼리면 Train 의 필드 대입이 터집니다.
    if (new.target === Schedule) {
      Object.freeze(this);
    }
  }

  static fromResponse(data: unknown): Schedule {
    return new Schedule(scheduleFieldsFrom(data));
  }

  /** 출발~도착 소요 시간(분). 자정을 넘기면 하루를 더해 보정합니다. */
  get durationMinutes(): number | undefined {
    const departure = minutesOf(this.depTime);
    const arrival = minutesOf(this.arrTime);
    if (departure === undefined || arrival === undefined) {
      return undefined;
    }
    const elapsed = arrival - departure;
    return elapsed < 0 ? elapsed + 24 * 60 : elapsed;
  }

  /** 소요 시간을 "3시간 30분" 형태로. 시각을 못 읽으면 `undefined`. */
  get durationText(): string | undefined {
    const minutes = this.durationMinutes;
    return minutes === undefined ? undefined : formatDuration(minutes);
  }

  /**
   * `[KTX 101] 04/01 09:00~12:30  서울~부산` 형태의 한 줄 요약.
   *
   * 좌석 가용 여부가 의미 없는 맥락(승차권 등)에서 이 부분만 재사용합니다.
   */
  summary(): string {
    const trainLine = `[${this.trainTypeName.slice(0, 3)} ${this.trainNo}]`;
    return (
      `${trainLine.padEnd(11, " ")}${mmdd(this.depDate)} ` +
      `${hhmm(this.depTime)}~${hhmm(this.arrTime)}  ${this.depName}~${this.arrName}`
    );
  }

  toString(): string {
    return this.summary();
  }
}

/** {@link Train} 생성자 인자. */
export interface TrainFields extends ScheduleFields {
  readonly reservePossible: string;
  readonly reservePossibleName: string;
  readonly specialSeat: string;
  readonly generalSeat: string;
  readonly waitReserveFlag: number;
}

/** 응답 → {@link TrainFields}. */
export function trainFieldsFrom(data: unknown): TrainFields {
  return {
    ...scheduleFieldsFrom(data),
    reservePossible: text(data, "h_rsv_psb_flg"),
    reservePossibleName: text(data, "h_rsv_psb_nm"),
    specialSeat: text(data, "h_spe_rsv_cd"),
    generalSeat: text(data, "h_gen_rsv_cd"),
    // 필드가 비어 오면 "예약대기 미적용"으로 봅니다 — undefined 를 그대로 두면
    // 비교 연산(`< 0`)이 조용히 false 가 됩니다.
    waitReserveFlag: integer(data, "h_wait_rsv_flg", WAITING_NOT_APPLICABLE),
  };
}

/** 좌석 가용 정보가 붙은 열차 시간표. */
export class Train extends Schedule implements TrainFields {
  readonly reservePossible: string;
  readonly reservePossibleName: string;
  readonly specialSeat: string;
  readonly generalSeat: string;
  readonly waitReserveFlag: number;

  constructor(fields: TrainFields) {
    super(fields);
    this.reservePossible = fields.reservePossible;
    this.reservePossibleName = fields.reservePossibleName;
    this.specialSeat = fields.specialSeat;
    this.generalSeat = fields.generalSeat;
    this.waitReserveFlag = fields.waitReserveFlag;
    if (new.target === Train) {
      Object.freeze(this);
    }
  }

  static override fromResponse(data: unknown): Train {
    return new Train(trainFieldsFrom(data));
  }

  hasSpecialSeat(): boolean {
    return this.specialSeat === SEAT_AVAILABLE;
  }

  hasGeneralSeat(): boolean {
    return this.generalSeat === SEAT_AVAILABLE;
  }

  hasSeat(): boolean {
    return this.hasGeneralSeat() || this.hasSpecialSeat();
  }

  hasGeneralWaitingList(): boolean {
    return this.waitReserveFlag === WAITING_LIST_OPEN;
  }

  hasWaitingList(): boolean {
    return this.hasGeneralWaitingList();
  }

  override toString(): string {
    const parts = [this.summary()];

    if (this.reservePossibleName !== "") {
      parts.push(`  특실 ${this.hasSpecialSeat() ? "가능" : "매진"}`);
      parts.push(`, 일반실 ${this.hasGeneralSeat() ? "가능" : "매진"}`);
      parts.push(
        ...(this.waitReserveFlag >= 0
          ? [`, 예약대기 ${this.hasGeneralWaitingList() ? "가능" : "매진"}`]
          : []),
      );
    }

    const duration = this.durationText;
    parts.push(duration === undefined ? " (?분)" : ` (${duration})`);
    return parts.join("");
  }
}
