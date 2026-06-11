import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test.describe('Sprint 8 — Manual Verification', () => {
  test('launch app and verify all features work', async () => {
    test.setTimeout(120_000);
    const errors: string[] = [];

    // 1. Launch app
    const electronApp = await electron.launch({
      args: [path.join(__dirname, '..', 'dist', 'main', 'index.js')],
      env: { ...process.env, E2E_TEST: '1' },
    });

    const window = await electronApp.firstWindow();
    window.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    window.on('pageerror', (err) => errors.push(err.message));
    await window.waitForLoadState('domcontentloaded');

    // 2. Take screenshot
    await window.screenshot({ path: 'sprint8-hub-ui.png', type: 'png' });

    // 3. Verify IPC bridge works
    const version = await window.evaluate(() => window.vantare.getVersion());
    console.log('App version (via IPC):', version);
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);

    // 4. Test settings IPC
    const settings = await window.evaluate(() => window.vantare.getSettings());
    expect(settings).toBeDefined();
    expect(typeof settings).toBe('object');
    console.log('Settings returned:', Object.keys(settings).join(', '));

    // 5. Test themes IPC
    const themes = await window.evaluate(() => window.vantare.getThemes());
    expect(themes.length).toBeGreaterThanOrEqual(3);
    console.log('Themes available:', themes.map((t: any) => t.id).join(', '));

    const activeTheme = await window.evaluate(() => window.vantare.getActiveTheme());
    expect(activeTheme).toBeDefined();
    console.log('Active theme:', activeTheme.id);

    // 6. Test auth IPC (mock mode)
    const license = await window.evaluate(() => window.vantare.getLicenseStatus());
    expect(license).toHaveProperty('tier');
    expect(license).toHaveProperty('isValid');
    console.log('License status:', license.tier, '- Valid:', license.isValid);

    // 7. Test overlay IPC
    const overlays = await window.evaluate(() => window.vantare.getOverlayWindows());
    expect(Array.isArray(overlays)).toBe(true);
    console.log('Overlay windows:', overlays.length);

    // 8. Live test: toggle overlay visibility via IPC
    const toggleResult = await window.evaluate(() => window.vantare.toggleOverlayVisibility());
    console.log('Toggle overlay visibility:', toggleResult);

    // 9. Test minimize to tray
    await window.evaluate(() => window.vantare.minimizeToTray());
    const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0]?.isVisible();
    });
    console.log('Window visible after minimize:', isVisible);
    expect(isVisible).toBe(false);

    // 10. Test recording IPC
    const isRecording = await window.evaluate(() => window.vantare.isRecording());
    console.log('Is recording:', isRecording);
    expect(typeof isRecording).toBe('boolean');

    // 11. Test inspector data
    const inspectorData = await window.evaluate(() => window.vantare.getInspectorData());
    console.log('Inspector data:', inspectorData ? 'available' : 'null');

    // 12. Check no console errors
    console.log('Total console errors:', errors.length);
    expect(errors.length).toBe(0);
    errors.forEach((e) => console.log('  Error:', e));

    await electronApp.close();
    console.log('ALL TESTS PASSED ✅');
  });
});
