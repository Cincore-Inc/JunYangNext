import nextEnv from '@next/env';
import mysql from 'mysql2/promise';
import OSS from 'ali-oss';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileType } from '../lib/upload-file.mjs';

nextEnv.loadEnvConfig(process.cwd());
const apply = process.argv.includes('--apply');
const sourceDir = process.env.JUNYANG_LEGACY_MEDIA_DIR;
const sourceUrl = process.env.JUNYANG_LEGACY_MEDIA_URL;
const maxSize = 10 * 1024 * 1024;
const validPath = /^(?:staff|company)\/image\/(?!\.{1,2}$)[\w.-]+$/;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

async function readSource(path) {
  if (sourceDir) {
    const file = join(sourceDir, path);
    if ((await stat(file)).size > maxSize) throw new Error('历史图片超过 10 MB');
    return readFile(file);
  }
  if (!sourceUrl) throw new Error('请设置历史媒体目录或来源地址');
  const base = new URL(sourceUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('历史媒体地址无效');
  const url = new URL(path.split('/').map(encodeURIComponent).join('/'), base.href.endsWith('/') ? base : `${base.href}/`);
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  if (!response.ok || Number(response.headers.get('content-length')) > maxSize) throw new Error('无法读取历史图片');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxSize) throw new Error('历史图片超过 10 MB');
  return bytes;
}

async function main() {
  if (!process.env.JUNYANG_MYSQL_URL) throw new Error('未配置数据库');
  const db = await mysql.createConnection(process.env.JUNYANG_MYSQL_URL);
  try {
    const specs = [
      ['staff_imagelist', 'image'],
      ['staff_insurancedetail', 'company_payproof'],
      ['staff_insurancedetail', 'persenal_payproof'],
    ];
    const records = [];
    for (const [table, field] of specs) {
      const [rows] = await db.query(`SELECT id, \`${field}\` AS path FROM \`${table}\` WHERE \`${field}\` IS NOT NULL AND \`${field}\` <> '' AND \`${field}\` NOT LIKE 'oss:%'`);
      for (const row of rows) records.push({ table, field, ...row });
    }
    if (!apply || !records.length) {
      console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', records: records.length, invalidPaths: records.filter(row => !validPath.test(row.path)).length }));
      return;
    }
    if (!process.env.ALI_KEY_ID || !process.env.ALI_SECRECT || process.env.ALI_OOS_BUCKET_NAME !== 'junyang-files-hangzhou') throw new Error('未配置对象存储');
    const oss = new OSS({ region: 'oss-cn-hangzhou', bucket: process.env.ALI_OOS_BUCKET_NAME, accessKeyId: process.env.ALI_KEY_ID, accessKeySecret: process.env.ALI_SECRECT, secure: true });
    const copied = new Map(); let updated = 0, failed = 0;
    for (const row of records) {
      try {
        if (!validPath.test(row.path)) throw new Error('历史路径无效');
        if (!copied.has(row.path)) {
          const bytes = await readSource(row.path), type = fileType(bytes);
          if (!type || !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type.mime)) throw new Error('历史文件不是支持的图片');
          const key = `core-media/${row.path}`;
          try {
            const existing = await oss.get(key);
            if (sha256(existing.content) !== sha256(bytes)) throw new Error('目标文件已存在且内容不同');
          } catch (error) {
            if (error.code !== 'NoSuchKey') throw error;
            await oss.put(key, bytes, { headers: { 'Content-Type': type.mime } });
          }
          copied.set(row.path, true);
        }
        const [result] = await db.execute(`UPDATE \`${row.table}\` SET \`${row.field}\` = ? WHERE id = ? AND \`${row.field}\` = ?`, [`oss:${row.path}`, row.id, row.path]);
        if (result.affectedRows) updated++; else failed++;
      } catch { failed++; }
    }
    console.log(JSON.stringify({ mode: 'apply', records: records.length, updated, failed }));
    if (failed) process.exitCode = 1;
  } finally { await db.end(); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
