import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LMURestClient } from '../lmu-rest-client';

describe('LMURestClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('polls brake wear, weather, and strategy on start', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/rest/garage/UIScreen/RepairAndRefuel')) {
        return {
          ok: true,
          json: async () => ({ wearables: { brakes: [0.1, 0.2, 0.3, 0.4] } }),
        } as Response;
      }
      if (url.includes('/rest/sessions/weather')) {
        return {
          ok: true,
          json: async () => ({ raining: 0.25, ambientTemp: 18 }),
        } as Response;
      }
      if (url.includes('/rest/strategy/usage')) {
        return {
          ok: true,
          json: async () => ({ fuelRemaining: 42 }),
        } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });

    const client = new LMURestClient('http://localhost:6397');
    client.start();

    await vi.waitFor(() => {
      expect(client.getBrakeWear()).toEqual([0.1, 0.2, 0.3, 0.4]);
    });

    expect(client.getWeather()).toMatchObject({ raining: 0.25, ambientTemp: 18 });
    expect(client.getStrategyUsage()).toMatchObject({ fuelRemaining: 42 });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:6397/rest/garage/UIScreen/RepairAndRefuel',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:6397/rest/sessions/weather',
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:6397/rest/strategy/usage',
      expect.any(Object),
    );

    client.stop();
  });

  it('ignores failed HTTP responses without throwing', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('connection refused'));

    const client = new LMURestClient('http://localhost:6397');
    client.start();

    await vi.waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(client.getBrakeWear()).toEqual([]);
    expect(client.getWeather()).toEqual({});
    expect(client.getStrategyUsage()).toEqual({});

    client.stop();
  });
});
