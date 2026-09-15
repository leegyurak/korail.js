/**
 * 승객 유형과 할인 구분.
 *
 * 승객은 "유형 + 할인 + 등록카드"가 같으면 하나로 합쳐 보냅니다 — 코레일 폼이
 * 승객 블록을 인덱스로 받기 때문에, 같은 조건을 두 블록으로 쪼개 보낼 이유가
 * 없습니다. {@link Passenger.reduce} 가 그 합치기를 합니다.
 */

/** {@link Passenger} 생성 옵션. */
export interface PassengerOptions {
  /** 할인 코드(`txtDiscKndCd`). 생략하면 유형별 기본값. */
  discountType?: string;
  /** 등록카드 종류(`txtCardCode_`). */
  card?: string;
  /** 등록카드 번호(`txtCardNo_`). */
  cardNo?: string;
  /** 등록카드 비밀번호(`txtCardPw_`). */
  cardPw?: string;
}

/** 예매 폼에 실리는 인덱스별 승객 필드. */
export type PassengerFormFields = Record<string, string | number>;

/**
 * 승객 묶음 한 종류. 직접 쓰지 말고 하위 타입을 쓰세요.
 *
 * 하위 타입은 `TYPE_CODE` 와 `DEFAULT_DISCOUNT` 정적 필드만 채웁니다 — 생성자
 * 시그니처가 계층 전체에서 같아야 {@link Passenger.reduce} 가 합칠 때 같은
 * 방식으로 다시 만들 수 있습니다.
 */
export class Passenger {
  /** 코레일 승객 유형 코드 (`txtPsgTpCd`). 1=어른, 3=어린이 계열. */
  static readonly TYPE_CODE: string = "1";
  /** 유형별 기본 할인 코드 (`txtDiscKndCd`). */
  static readonly DEFAULT_DISCOUNT: string = "000";

  readonly count: number;
  readonly discountType: string;
  readonly card: string;
  readonly cardNo: string;
  readonly cardPw: string;

  constructor(count = 1, options: PassengerOptions = {}) {
    const ctor = new.target as typeof Passenger;
    this.count = count;
    this.discountType = options.discountType ?? ctor.DEFAULT_DISCOUNT;
    this.card = options.card ?? "";
    this.cardNo = options.cardNo ?? "";
    this.cardPw = options.cardPw ?? "";
    Object.freeze(this);
  }

  /** 이 승객의 유형 코드. */
  get typeCode(): string {
    return (this.constructor as typeof Passenger).TYPE_CODE;
  }

  /** 합칠 수 있는 승객끼리 같아지는 키. */
  groupKey(): string {
    return `${this.typeCode}_${this.discountType}_${this.card}_${this.cardNo}_${this.cardPw}`;
  }

  /**
   * 같은 조건의 승객을 합치고, 인원이 0 이하인 항목은 버립니다.
   *
   * 그룹 키로 **정렬한 뒤** 합칩니다 — 정렬 없이 등장 순서대로 묶으면
   * `[어른, 어린이, 어른]` 이 어른 블록 두 개로 나가 버립니다. 정렬 순서는 그대로
   * 폼의 승객 블록 인덱스가 되므로 pykorail 과 같은 순서를 유지합니다.
   */
  static reduce(passengers: readonly Passenger[]): Passenger[] {
    const invalid = passengers.filter((passenger) => !(passenger instanceof Passenger));
    if (invalid.length > 0) {
      throw new TypeError("Passengers must be based on Passenger");
    }

    const merged = new Map<string, Passenger>();
    [...passengers]
      .sort((a, b) => (a.groupKey() < b.groupKey() ? -1 : a.groupKey() > b.groupKey() ? 1 : 0))
      .forEach((passenger) => {
        const key = passenger.groupKey();
        const existing = merged.get(key);
        merged.set(key, existing === undefined ? passenger : existing.add(passenger));
      });

    return [...merged.values()].filter((passenger) => passenger.count > 0);
  }

  /** 같은 그룹의 승객 둘을 하나로 합칩니다. */
  add(other: Passenger): Passenger {
    if (other.constructor !== this.constructor) {
      throw new TypeError("Cannot add different passenger types");
    }
    if (this.groupKey() !== other.groupKey()) {
      throw new TypeError(
        `Cannot add passengers with different group keys: ${this.groupKey()} vs ${other.groupKey()}`,
      );
    }
    const Ctor = this.constructor as new (count: number, options: PassengerOptions) => Passenger;
    return new Ctor(this.count + other.count, {
      discountType: this.discountType,
      card: this.card,
      cardNo: this.cardNo,
      cardPw: this.cardPw,
    });
  }

  /** 예매 폼에 실을 인덱스별 승객 필드. */
  toFormFields(index: number): PassengerFormFields {
    return {
      [`txtPsgTpCd${index}`]: this.typeCode,
      [`txtDiscKndCd${index}`]: this.discountType,
      [`txtCompaCnt${index}`]: this.count,
      [`txtCardCode_${index}`]: this.card,
      [`txtCardNo_${index}`]: this.cardNo,
      [`txtCardPw_${index}`]: this.cardPw,
    };
  }

  toString(): string {
    return `${this.constructor.name}(count=${this.count}, discountType="${this.discountType}")`;
  }
}

/** 어른. */
export class AdultPassenger extends Passenger {
  static override readonly TYPE_CODE = "1";
  static override readonly DEFAULT_DISCOUNT = "000";
}

/** 어린이. */
export class ChildPassenger extends Passenger {
  static override readonly TYPE_CODE = "3";
  static override readonly DEFAULT_DISCOUNT = "000";
}

/** 유아. */
export class ToddlerPassenger extends Passenger {
  static override readonly TYPE_CODE = "3";
  static override readonly DEFAULT_DISCOUNT = "321";
}

/** 경로. */
export class SeniorPassenger extends Passenger {
  static override readonly TYPE_CODE = "1";
  static override readonly DEFAULT_DISCOUNT = "131";
}

/** 중증 장애인 (1~3급). */
export class Disability1To3Passenger extends Passenger {
  static override readonly TYPE_CODE = "1";
  static override readonly DEFAULT_DISCOUNT = "111";
}

/** 경증 장애인 (4~6급). */
export class Disability4To6Passenger extends Passenger {
  static override readonly TYPE_CODE = "1";
  static override readonly DEFAULT_DISCOUNT = "112";
}
