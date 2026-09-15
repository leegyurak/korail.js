/**
 * 조회·예매 옵션 코드.
 *
 * `enum` 이 아니라 `as const` 객체인 것은 의도적입니다 — 이 값들은 폼 필드에 그대로
 * 실려 나가는데, `enum` 은 런타임 객체를 만들어 트리셰이킹을 막고 숫자 enum 은
 * 역매핑 키까지 만듭니다. 유니온 타입 별칭으로 오타를 정적으로 잡습니다 —
 * `trainType: "999"` 는 타입 검사에서 걸립니다.
 */

/**
 * `selGoTrain`/`txtTrnGpCd` 열차 종별 코드.
 *
 * KTX 와 KTX-산천은 같은 코드(`100`)를 씁니다 — 별칭이지 오타가 아닙니다.
 */
export const TrainType = {
  KTX: "100",
  KTX_SANCHEON: "100",
  SAEMAEUL: "101",
  ITX_SAEMAEUL: "101",
  MUGUNGHWA: "102",
  NURIRO: "102",
  TONGGUEN: "103",
  ITX_CHEONGCHUN: "104",
  AIRPORT: "105",
  ALL: "109",
} as const;

/** 유효한 열차 종별 코드. */
export type TrainTypeCode = (typeof TrainType)[keyof typeof TrainType];

/** 특실/일반실 선택 전략. */
export const ReserveOption = {
  GENERAL_FIRST: "GENERAL_FIRST",
  GENERAL_ONLY: "GENERAL_ONLY",
  SPECIAL_FIRST: "SPECIAL_FIRST",
  SPECIAL_ONLY: "SPECIAL_ONLY",
} as const;

/** 유효한 특실/일반실 선택 전략. */
export type ReserveOptionCode = (typeof ReserveOption)[keyof typeof ReserveOption];
