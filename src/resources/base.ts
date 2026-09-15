/** 리소스 공통 기반. */

import type { ApiClient } from "../api";

/**
 * 엔드포인트 묶음 하나.
 *
 * 리소스는 상태를 거의 갖지 않고 {@link ApiClient} 를 통해서만 통신합니다.
 * 클라이언트 하나가 만든 리소스들은 세션·서명·로그인 상태를 공유합니다.
 */
export abstract class Resource {
  protected readonly api: ApiClient;

  constructor(api: ApiClient) {
    this.api = api;
  }
}
