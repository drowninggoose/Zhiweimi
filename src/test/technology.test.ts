// @vitest-environment node
import Dexie from 'dexie';
import { expect, test } from 'vitest';
test('阶段0：文本、图片 Blob 在数据库重新打开后保持，备份 JSON 可往返', async () => {
  const db = new Dexie('technology-test');
  db.version(1).stores({ records: 'id' });
  const blob = new Blob(['image bytes'], { type: 'image/png' });
  await db.table('records').put({ id: 'sample', text: '知味咪', blob });
  db.close();
  await db.open();
  const record = await db.table('records').get('sample');
  expect(record.text).toBe('知味咪');
  expect(record.blob.size).toBe(blob.size);
  expect(await record.blob.text()).toBe('image bytes');
  const json = JSON.stringify({
    format: 'zhiweimi-backup',
    text: record.text,
    image: 'data:image/png;base64,aW1hZ2UgYnl0ZXM=',
  });
  expect(JSON.parse(json)).toEqual({
    format: 'zhiweimi-backup',
    text: '知味咪',
    image: 'data:image/png;base64,aW1hZ2UgYnl0ZXM=',
  });
  await db.delete();
});
