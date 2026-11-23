import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APK_LOCAL_BUILD_COMMANDS,
  buildWhatsAppShareUrl,
  FALLBACK_PUBLIC_APP_URL,
  isRunningInEmbeddedFrame,
  resolveShareableAppUrl,
} from './installHelpers';

test('Install Helpers', async (t) => {
  await t.test('rewrites private ais-dev origin to public ais-pre URL', () => {
    const url = resolveShareableAppUrl(
      'https://ais-dev-7zoo3wamcrhjykbqkhnd6g-892439407753.us-east1.run.app'
    );
    assert.equal(
      url,
      'https://ais-pre-7zoo3wamcrhjykbqkhnd6g-892439407753.us-east1.run.app'
    );
  });

  await t.test('falls back to default public URL when empty', () => {
    assert.equal(resolveShareableAppUrl(''), FALLBACK_PUBLIC_APP_URL);
    assert.equal(resolveShareableAppUrl(undefined), FALLBACK_PUBLIC_APP_URL);
  });

  await t.test('builds valid WhatsApp share deep link with encoded app URL', () => {
    const wa = buildWhatsAppShareUrl(FALLBACK_PUBLIC_APP_URL);
    assert.ok(wa.startsWith('https://wa.me/?text='));
    assert.ok(wa.includes(encodeURIComponent(FALLBACK_PUBLIC_APP_URL)));
  });

  await t.test('detects iframe embedding safely', () => {
    const topWin = {};
    assert.equal(
      isRunningInEmbeddedFrame({ self: topWin, top: topWin }),
      false
    );
    const childWin = {};
    assert.equal(
      isRunningInEmbeddedFrame({ self: childWin, top: topWin }),
      true
    );
  });

  await t.test('provides complete Capacitor APK build commands', () => {
    assert.ok(APK_LOCAL_BUILD_COMMANDS.includes('npm run build'));
    assert.ok(APK_LOCAL_BUILD_COMMANDS.includes('npx cap sync android'));
    assert.ok(APK_LOCAL_BUILD_COMMANDS.includes('assembleDebug'));
  });
});
