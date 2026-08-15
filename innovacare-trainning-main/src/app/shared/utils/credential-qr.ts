import QRCode from 'qrcode';

/** Deep link into the public member-verification page for a given credential number. */
export function memberVerificationUrl(membershipNumber: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/verify-member/${encodeURIComponent(membershipNumber)}`;
}

/** Renders a QR code (pointing at the public verification page) as a data URL for use in an <img>. */
export async function credentialQrDataUrl(membershipNumber: string): Promise<string> {
  return QRCode.toDataURL(memberVerificationUrl(membershipNumber), {
    width: 220,
    margin: 1,
    color: { dark: '#0d2240', light: '#ffffff' },
  });
}
