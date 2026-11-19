import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

test('历史图片迁移可预检、重复引用只上传一次，遇到已有不同内容不覆盖', async () => {
  const root = await mkdtemp(join(tmpdir(), 'junyang-media-'));
  try {
    await mkdir(join(root, 'staff', 'image'), { recursive: true });
    await writeFile(join(root, 'staff', 'image', 'test.png'), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const env = { ...process.env, NODE_NO_WARNINGS: '1', NODE_OPTIONS: `--loader=${resolve('test/fixtures/media-migration-loader.mjs')}`, JUNYANG_MYSQL_URL: 'mysql://test', ALI_KEY_ID: 'test', ALI_SECRECT: 'test', ALI_OOS_BUCKET_NAME: 'junyang-files-hangzhou', JUNYANG_LEGACY_MEDIA_DIR: root };
    function run(args, extra = {}) {
      const result = spawnSync(process.execPath, ['scripts/migrate-personnel-media.mjs', ...args], { env: { ...env, ...extra }, encoding: 'utf8' });
      assert.equal(result.stderr, '');
      return { status: result.status, ...JSON.parse(result.stdout) };
    }
    assert.deepEqual(run([]), { status: 0, mode: 'dry-run', records: 2, invalidPaths: 0 });
    assert.deepEqual(run(['--apply']), { status: 0, mode: 'apply', records: 2, updated: 2, failed: 0 });
    assert.deepEqual(run(['--apply'], { TEST_CONFLICT: '1' }), { status: 1, mode: 'apply', records: 2, updated: 0, failed: 2 });
  } finally { await rm(root, { recursive: true, force: true }); }
});
