import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { fileType } from '../lib/upload-file.mjs';
test('上传类型按文件内容识别', () => {
  assert.equal(fileType(Buffer.from([137,80,78,71,13,10,26,10]))?.mime, 'image/png');
  assert.equal(fileType(Buffer.from([255,216,255,0]))?.extension, 'jpg');
  assert.equal(fileType(Buffer.from('RIFF0000WEBP'))?.mime, 'image/webp');
  assert.equal(fileType(Buffer.from('GIF89a'))?.mime, 'image/gif');
  assert.equal(fileType(Buffer.from('%PDF-1.7'))?.mime, 'application/pdf');
  assert.equal(fileType(Buffer.from('not an image')), null);
});

test('文档类型验证扩展名和内容', async () => {
  const { documentType } = await import('../lib/upload-file.mjs');
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip(); zip.file('[Content_Types].xml', 'x'); zip.file('word/document.xml', 'x');
  const bytes = await zip.generateAsync({ type: 'nodebuffer' });
  assert.equal((await documentType(bytes, 'report.docx'))?.extension, 'docx');
  assert.equal(await documentType(bytes, 'report.xlsx'), null);
  assert.equal((await documentType(Buffer.from('普通文本'), 'notes.txt'))?.extension, 'txt');
  assert.equal(await documentType(Buffer.from('not a document'), 'fake.docx'), null);
  assert.equal((await documentType(Buffer.from('GIF89a'), 'image.gif'))?.extension, 'gif');
});
