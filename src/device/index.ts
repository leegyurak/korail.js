/**
 * 기기 프로파일 — 클라이언트에 주입해 User-Agent 와 DynaPath 서명을 함께 바꿉니다.
 *
 * ```ts
 * import { Korail, profileById, randomProfile } from "korail.js";
 *
 * const profile = profileById(savedId) ?? randomProfile(); // 최초 1회만 뽑고 id 를 저장
 * const korail = new Korail({ deviceProfile: profile });
 * ```
 */

export {
  BUILD_ID,
  CATALOG_SIZE,
  DEVICE_PROFILES,
  PROFILES_BY_ID,
  profileById,
  randomProfile,
} from "./catalog";
export type { DeviceProfile, DeviceProfileLike } from "./profile";
export { dalvikUserAgent } from "./profile";
