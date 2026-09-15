/** 전송 계층·대기열(NetFunnel) 관련 에러. */

import { KorailError } from "./base";

/**
 * NetFunnel 대기열 티켓을 얻지 못했습니다.
 *
 * 코레일 응답이 아니라 대기열 게이트(`nf.letskorail.com`) 유래이므로
 * {@link KorailApiError} 가 아닌 형제 타입입니다.
 */
export class NetFunnelError extends KorailError {}

/** HTTP 세션을 만들 수 없거나 응답이 JSON 이 아닙니다. */
export class TransportError extends KorailError {}
