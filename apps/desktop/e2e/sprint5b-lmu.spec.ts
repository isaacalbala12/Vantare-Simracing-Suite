import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test.describe('Sprint 5b LMU Hub smoke', () => {
  test('inspector route loads and sim list includes lmu', async () => {
    const consoleErrors: string[] = [];

    const electronApp = await electron.launch({
      args: [path.join(__dirname, '..', 'dist', 'main', 'index.js')],
    });

    const window = await electronApp.firstWindow();

    window.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    window.on('pageerror', (error) => consoleErrors.push(error.message));

    await window.getByTestId('sidebar-inspector').click();
    await expect(window.getByTestId('telemetry-inspector-page')).toBeVisible({ timeout: 10000 });

    await window.getByTestId('sim-switcher-trigger').click();
    await expect(window.getByTestId('sim-option-lmu')).toBeVisible({ timeout: 5000 });

    expect(consoleErrors).toHaveLength(0);

    await electronApp.close();
  });
});
