import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_SCOPES, fetchBeatmapDetail, fetchDetails, searchBeatmaps } from '../src/lib/sayobot';

function mockFetch(payload: unknown) {
  const spy = vi.fn(async (..._args: unknown[]) => ({ ok: true, status: 200, json: async () => payload }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Sayobot 客户端', () => {
  it('搜索走 POST /?post，把模式、范围、分页放进 JSON body', async () => {
    const spy = mockFetch({ data: [{ sid: 1, title: 'a', artist: 'b', creator: 'c', modes: 8 }] });

    const items = await searchBeatmaps('ice rain', {
      limit: 100,
      offset: 200,
      approvedMask: 31,
      scope: SEARCH_SCOPES.creator,
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.sayobot.cn/?post');
    expect(init.method).toBe('POST');

    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      cmd: 'beatmaplist',
      type: 'search',
      keyword: 'ice rain',
      mode: 8,
      limit: 100,
      offset: 200,
      class: 31,
      subType: 4,
    });

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ sid: 1, modes: 8, creator: 'c' });
  });

  it('不限定字段时 body 里不带 subType', async () => {
    const spy = mockFetch({ data: [] });

    await searchBeatmaps('kano');

    const body = JSON.parse(String((spy.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body).not.toHaveProperty('subType');
  });

  it('status:-1 表示没有匹配结果，返回空列表而不是报错', async () => {
    mockFetch({ status: -1 });

    await expect(searchBeatmaps('zzzqqq')).resolves.toEqual([]);
  });

  it('详情只保留 mania 难度并读出键数与视频标记', async () => {
    mockFetch({
      data: {
        sid: 42,
        title: 'T',
        artist: 'A',
        creator: 'C',
        video: 1,
        bid_data: [
          { bid: 1, mode: 0, version: 'std', CS: 4 },
          { bid: 2, mode: 3, version: '6K Hard', CS: 6, length: 120 },
          { bid: 3, mode: 3, version: '6K Insane', CS: 6, length: 120 },
        ],
      },
    });

    const detail = await fetchBeatmapDetail(42);

    expect(detail?.hasVideo).toBe(true);
    expect(detail?.difficulties.map((diff) => diff.version)).toEqual(['6K Hard', '6K Insane']);
    expect(detail?.difficulties.every((diff) => diff.keys === 6)).toBe(true);
  });

  it('详情取不到数据时抛错，由 fetchDetails 统一降级为 null', async () => {
    mockFetch({ status: -1 });

    await expect(fetchBeatmapDetail(7)).rejects.toThrow(/未返回该谱面信息/);
    await expect(fetchDetails([7, 8], 2)).resolves.toEqual([null, null]);
  });
});
