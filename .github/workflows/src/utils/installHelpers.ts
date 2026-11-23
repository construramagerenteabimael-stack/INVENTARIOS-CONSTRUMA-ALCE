export const FALLBACK_PUBLIC_APP_URL =
  'https://ais-pre-7zoo3wamcrhjykbqkhnd6g-892439407753.us-east1.run.app';

/**
 * Converts private `ais-dev-*` preview origins into public `ais-pre-*` URLs
 * so coworkers and other phones can open and install the app directly.
 */
export function resolveShareableAppUrl(rawOrigin?: string): string {
  const trimmed = (rawOrigin || '').trim();
  if (!trimmed) return FALLBACK_PUBLIC_APP_URL;
  if (trimmed.includes('ais-dev-')) {
    return trimmed.replace('ais-dev-', 'ais-pre-');
  }
  return trimmed;
}

/**
 * Builds a WhatsApp share deep link containing the store app installation URL.
 */
export function buildWhatsAppShareUrl(appUrl: string): string {
  const cleanUrl = resolveShareableAppUrl(appUrl);
  const message =
    `📲 Instala la app *Inventarios Construrama Alce* en tu teléfono o pistola Android:\n\n` +
    `1. Abre este enlace en Google Chrome (o Safari en iPhone):\n${cleanUrl}\n\n` +
    `2. Toca "Instalar aplicación" en el menú (⋮) para usarla sin internet en bodega.`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/**
 * Detects whether the web app is running nested inside an iframe (such as AI Studio preview),
 * where Chromium suppresses the native `beforeinstallprompt` install banner.
 */
export function isRunningInEmbeddedFrame(win?: { self?: unknown; top?: unknown }): boolean {
  const target = win ?? (typeof window !== 'undefined' ? window : undefined);
  if (!target) return false;
  try {
    return target.self !== target.top;
  } catch {
    return true;
  }
}

export const APK_LOCAL_BUILD_COMMANDS = [
  'npm install',
  'npm run build',
  'npx cap sync android',
  'cd android && ./gradlew assembleDebug',
].join('\n');
