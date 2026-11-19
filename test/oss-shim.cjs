const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === 'https://junyang-files-hangzhou.oss-cn-hangzhou.aliyuncs.com' && init?.method === 'POST') return new Response('', { status: 200 });
  if (url.startsWith('https://junyang-files-hangzhou.oss-cn-hangzhou.aliyuncs.com/core-media/')) return new Response(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aXYAAAAASUVORK5CYII=', 'base64'), { status: 200, headers: { 'content-type': 'image/png' } });
  return original(input, init);
};
