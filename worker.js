import { onRequest, onRequestPost } from './functions/api/subscribe.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (/^\/unlock(?:\/|$)|^\/unlock-config\.json$/.test(url.pathname)) {
      return new Response(null, {status:302, headers:{Location:'/', 'Cache-Control':'no-store'}});
    }

    if (url.pathname === '/api/subscribe') {
      if (request.method === 'POST') return onRequestPost({ request, env });
      return onRequest({ request, env });
    }

    return env.ASSETS.fetch(request);
  }
};
