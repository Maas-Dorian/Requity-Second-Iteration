import QRCode from "qrcode";

/**
 * REQUITY QR code generation.
 *
 * Vercel-safe: uses only the pure-JS `qrcode` package (which renders PNGs via
 * `pngjs`). No `canvas`, no `sharp`, and no Node native image dependencies, so
 * it runs unchanged in serverless functions.
 *
 * QR codes encode an agent's public assessment link. Clients who scan the code
 * attach directly to that agent (source `qr`) and never enter the reviewer queue.
 */

/** REQUITY brand orange used for the QR foreground. */
export const REQUITY_ORANGE = "#ea580c";

const QR_OPTIONS = {
  width: 400,
  margin: 2,
  errorCorrectionLevel: "H" as const,
  color: {
    dark: REQUITY_ORANGE,
    light: "#ffffff",
  },
};

/** PNG data URL (`data:image/png;base64,...`) for the given URL. */
export async function generateAgentAssessmentQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, QR_OPTIONS);
}

/** Raw PNG buffer for the given URL (for image/png downloads). */
export async function generateAgentAssessmentQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { ...QR_OPTIONS, type: "png" });
}
