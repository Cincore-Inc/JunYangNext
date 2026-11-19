const originalFetch = globalThis.fetch;
const objects = new Map();
const origin = 'https://junyang-files-hangzhou.oss-cn-hangzhou.aliyuncs.com';
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== origin) return originalFetch(input, init);
  if (init?.method === 'POST' && url.pathname === '/') {
    const form = init.body;
    objects.set(String(form.get('key')), { bytes: await form.get('file').arrayBuffer(), type: form.get('file').type });
    return new Response('', { status: 200 });
  }
  const object = objects.get(decodeURIComponent(url.pathname.slice(1)));
  return object ? new Response(object.bytes.slice(0), { status: 200, headers: { 'content-type': object.type } }) : new Response('', { status: 404 });
};
