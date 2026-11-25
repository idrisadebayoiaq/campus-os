/** Store / APK download targets for the CampusOS landing page. */

export const APP_VERSION = "1.0.4";
export const APP_VERSION_CODE = 9;

/** Direct APK (also mirrored as CampusOS-1.0.3-vc8.apk). */
export const APK_HREF =
  process.env.NEXT_PUBLIC_APK_URL?.trim() ||
  "/downloads/CampusOS-latest.apk";

/**
 * Set when the listing goes live, e.g.
 * https://play.google.com/store/apps/details?id=com.campusos.app
 */
export const PLAY_STORE_HREF =
  process.env.NEXT_PUBLIC_PLAY_STORE_URL?.trim() || "";

/**
 * Set when the listing goes live, e.g.
 * https://apps.apple.com/app/idXXXXXXXX
 */
export const APP_STORE_HREF =
  process.env.NEXT_PUBLIC_APP_STORE_URL?.trim() || "";

export const PLAY_STORE_READY = PLAY_STORE_HREF.length > 0;
export const APP_STORE_READY = APP_STORE_HREF.length > 0;
