/** Store / APK download targets for the CampusOS landing page. */

export const APP_VERSION = "1.0.5";
export const APP_VERSION_CODE = 10;

/**
 * Direct APK link. Defaults to the latest EAS build artifact so the 50 MB
 * APK is not committed to git. Override with NEXT_PUBLIC_APK_URL.
 */
export const APK_HREF =
  process.env.NEXT_PUBLIC_APK_URL?.trim() ||
  "https://expo.dev/artifacts/eas/qoqIoGRFhIF3e-yu0-rpgAzSTjDa7c08Iw2w6piX-6w.apk";

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

/** CampusOS Portal (businesses, lecturers, schools). Set NEXT_PUBLIC_PORTAL_URL on Vercel. */
export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL?.trim() || "";

export const PLAY_STORE_READY = PLAY_STORE_HREF.length > 0;
export const APP_STORE_READY = APP_STORE_HREF.length > 0;
