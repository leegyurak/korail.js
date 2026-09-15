/**
 * 응답 모델과 요청 파라미터 객체.
 *
 * 응답 모델({@link Schedule}·{@link Train}·{@link Ticket}·{@link Reservation}·
 * {@link Seat}·{@link Station})은 모두 **불변**이고 `fromResponse` 로만 만듭니다.
 * 생성자는 값 조립, 응답 해석은 `fromResponse` 로 일관되게 갈라져 있습니다.
 *
 * {@link Ticket} 과 {@link Reservation} 은 열차를 **상속하지 않고 참조**합니다
 * (`ticket.train.depName`). 예약이 `hasSeat()` 같은 메서드를 물려받는 건 말이
 * 안 되기 때문입니다.
 */

export type { CardFields } from "./card";
export { Card } from "./card";
export type { PassengerFormFields, PassengerOptions } from "./passenger";
export {
  AdultPassenger,
  ChildPassenger,
  Disability1To3Passenger,
  Disability4To6Passenger,
  Passenger,
  SeniorPassenger,
  ToddlerPassenger,
} from "./passenger";
export type { RefundFeeFields } from "./refund";
export { RefundFee } from "./refund";
export type { ReservationExtras, ReservationFields } from "./reservation";
export { Reservation } from "./reservation";
export type { ScheduleFields, TrainFields } from "./schedule";
export { formatDuration, Schedule, Train, WAITING_NOT_APPLICABLE } from "./schedule";
export type { SeatFields } from "./seat";
export { Seat } from "./seat";
export type { StationFields } from "./station";
export { parseStations, Station } from "./station";
export type { TicketFields } from "./ticket";
export { Ticket, TRAIN_INFO_PATH, trainInfoOf } from "./ticket";
