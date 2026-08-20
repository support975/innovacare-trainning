const PRODUCTION_CANONICAL_ORIGIN = 'https://innovacaretrainning.com';
const PRODUCTION_FIREBASE_HOSTS = ['innovacare-training.web.app', 'innovacare-training.firebaseapp.com'];

/**
 * The origin to use for any link meant to be opened outside the current
 * browsing session — a candidate exam-login link, a certificate
 * verification QR code, a social-media share — never the raw Firebase
 * Hosting URL a signed-in staff member might happen to be browsing from.
 * Dev/staging keep using window.location.origin unchanged so testing in
 * those environments still produces working links.
 */
export function publicAppOrigin(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  try {
    const host = new URL(origin).hostname;
    if (PRODUCTION_FIREBASE_HOSTS.includes(host)) {
      return PRODUCTION_CANONICAL_ORIGIN;
    }
  } catch {
    // Fall through to origin below.
  }
  return origin;
}
