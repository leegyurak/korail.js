/**
 * 리소스 — 엔드포인트를 도메인별로 묶은 API 표면.
 *
 * {@link Korail} 이 하나씩 들고 있고, 전부 같은 {@link ApiClient} 를 공유해
 * 세션·서명·로그인 상태를 나눠 씁니다.
 *
 * ```ts
 * await korail.stations.all();
 * await korail.trains.search("서울", "부산");
 * await korail.reservations.create(train);
 * await korail.tickets.all();
 * ```
 */

export { Resource } from "./base";
export type { ReservationSeats } from "./reservations";
export { ReservationResource } from "./reservations";
export { StationResource } from "./stations";
export { TicketResource } from "./tickets";
export type { KstMoment, TrainSearchOptions } from "./trains";
export { PAST_TOLERANCE_MINUTES, TrainResource, toKst } from "./trains";
