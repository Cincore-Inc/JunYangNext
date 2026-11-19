export function fileType(bytes) {
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) return { extension: 'png', mime: 'image/png' };
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { extension: 'jpg', mime: 'image/jpeg' };
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString('ascii') === 'RIFF' && Buffer.from(bytes.subarray(8, 12)).toString('ascii') === 'WEBP') return { extension: 'webp', mime: 'image/webp' };
  if (bytes.length >= 5 && Buffer.from(bytes.subarray(0, 5)).toString('ascii') === '%PDF-') return { extension: 'pdf', mime: 'application/pdf' };
  return null;
}

export async function documentType(bytes, filename) {
  const image = fileType(bytes);
  if (image) return image;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (Buffer.from(bytes.subarray(0, 6)).toString('ascii') === 'GIF87a' || Buffer.from(bytes.subarray(0, 6)).toString('ascii') === 'GIF89a') return { extension: 'gif', mime: 'image/gif' };
  const office = { doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint' };
  if (office[ext] && Buffer.from(bytes.subarray(0, 8)).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))) return { extension: ext, mime: office[ext] };
  if (['txt', 'csv'].includes(ext)) {
    try { const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text)) return { extension: ext, mime: ext === 'csv' ? 'text/csv' : 'text/plain' }; } catch { return null; }
  }
  if (['docx', 'xlsx', 'pptx', 'zip'].includes(ext) && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const { default: JSZip } = await import('jszip'); const zip = await JSZip.loadAsync(bytes);
      const entry = { docx: 'word/document.xml', xlsx: 'xl/workbook.xml', pptx: 'ppt/presentation.xml' }[ext];
      if (ext === 'zip' || (zip.file('[Content_Types].xml') && zip.file(entry))) return { extension: ext, mime: { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', zip: 'application/zip' }[ext] };
    } catch { return null; }
  }
  return null;
}
