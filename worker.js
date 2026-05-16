// Cloudflare Worker — Media Downloader Backend
// Deploy to: workers.romanzx.dev or api.romanzx.dev

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// ===== TikTok =====
async function downloadTikTok(url) {
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const res = await fetch(api, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const data = await res.json();
  if (data.code !== 0) throw new Error(data.msg || 'TikTok: failed');
  const d = data.data;
  const results = [];
  if (d.play) results.push({ url: d.play, quality: 'Video (No Watermark)', type: 'video' });
  if (d.hdplay) results.push({ url: d.hdplay, quality: 'HD Video', type: 'video' });
  if (d.music) results.push({ url: d.music, quality: 'Audio Only', type: 'audio' });
  if (d.author && d.author.avatar) results.push({ url: d.author.avatar, quality: 'Author Avatar', type: 'image' });
  return {
    platform: 'TikTok',
    title: d.title || 'TikTok Video',
    author: d.author?.unique_id || d.author?.nickname || 'Unknown',
    thumbnail: d.cover || d.origin_cover || '',
    results
  };
}

// ===== Instagram =====
async function downloadInstagram(url) {
  // Use multiple API sources for Instagram
  const encoded = encodeURIComponent(url);
  
  // Try rapidapi-style Instagram downloader
  const apiRes = await fetch(`https://api.piapi.me/api/v1/instagram/media?media_id=${encoded}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }).catch(() => null);
  
  if (apiRes && apiRes.ok) {
    const data = await apiRes.json();
    if (data.code === 200 && data.data) {
      const results = [];
      const items = data.data.media || data.data;
      if (Array.isArray(items)) {
        items.forEach(item => {
          if (item.url) results.push({ url: item.url, quality: item.type === 'video' ? 'Video' : 'Image', type: item.type === 'video' ? 'video' : 'image' });
        });
      }
      if (results.length > 0) {
        return { platform: 'Instagram', title: data.data.caption || 'Instagram Post', author: data.data.owner?.username || 'Unknown', thumbnail: results[0]?.url || '', results };
      }
    }
  }
  
  // Fallback: use igdownloader-style API
  const fallbackRes = await fetch(`https://api.igdownloader.app/api?url=${encoded}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }).catch(() => null);
  
  if (fallbackRes && fallbackRes.ok) {
    const data = await fallbackRes.json();
    if (data.success && data.data) {
      const results = [];
      data.data.forEach(item => {
        if (item.url) results.push({ url: item.url, quality: item.type || 'Media', type: item.isVideo ? 'video' : 'image' });
      });
      if (results.length > 0) {
        return { platform: 'Instagram', title: 'Instagram Post', author: 'Unknown', thumbnail: results[0]?.url || '', results };
      }
    }
  }
  
  throw new Error('Instagram: Unable to fetch. Try pasting the post URL at saveig.app or snapinsta.app');
}

// ===== YouTube =====
async function downloadYouTube(url) {
  const encoded = encodeURIComponent(url);
  
  // Use cobalt API
  const cobaltRes = await fetch('https://api.cobalt.tools/api/json', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify({ url, isAudioOnly: false, filenamePattern: 'basic' })
  }).catch(() => null);
  
  if (cobaltRes && cobaltRes.ok) {
    const data = await cobaltRes.json();
    if (data.url) {
      return {
        platform: 'YouTube',
        title: data.filename || 'YouTube Video',
        author: 'Unknown',
        thumbnail: '',
        results: [{ url: data.url, quality: 'Video', type: 'video' }]
      };
    }
  }
  
  // Fallback: y2mate-style
  const fallbackRes = await fetch(`https://api.vevioz.com/api/button/videos?url=${encoded}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }).catch(() => null);
  
  if (fallbackRes && fallbackRes.ok) {
    const html = await fallbackRes.text();
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/);
    const links = [...html.matchAll(/href="(https:[^"]*cdn[^"]*)"/g)].map(m => m[1]);
    if (links.length > 0) {
      return {
        platform: 'YouTube',
        title: titleMatch ? titleMatch[1].replace(/&#8211;/g, '-').replace(/&#8217;/g, "'") : 'YouTube Video',
        author: 'Unknown',
        thumbnail: '',
        results: links.slice(0, 5).map((l, i) => ({ url: l, quality: `Quality ${i + 1}`, type: 'video' }))
      };
    }
  }
  
  throw new Error('YouTube: Unable to fetch. Try using y2mate or ssyoutube directly');
}

// ===== Twitter/X =====
async function downloadTwitter(url) {
  // fxtwitter provides clean metadata
  const fxUrl = url.replace(/twitter\.com|x\.com/, 'api.fxtwitter.com');
  const res = await fetch(fxUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  if (res.ok) {
    const data = await res.json();
    const tweet = data.tweet;
    if (tweet) {
      const results = [];
      if (tweet.media) {
        if (tweet.media.photos) {
          tweet.media.photos.forEach(p => {
            results.push({ url: p.url, quality: 'Photo', type: 'image' });
          });
        }
        if (tweet.media.videos) {
          tweet.media.videos.forEach(v => {
            const bestUrl = v.url || (v.variants && v.variants.length > 0 ? v.variants[v.variants.length - 1].url : '');
            if (bestUrl) results.push({ url: bestUrl, quality: 'Video', type: 'video' });
          });
        }
        if (tweet.media.animated) {
          tweet.media.animated.forEach(a => {
            results.push({ url: a.url, quality: 'GIF', type: 'video' });
          });
        }
      }
      if (results.length > 0) {
        return {
          platform: 'Twitter/X',
          title: tweet.text || 'Tweet',
          author: tweet.author?.name || tweet.author?.screen_name || 'Unknown',
          thumbnail: tweet.author?.avatar_url || '',
          results
        };
      }
    }
  }
  
  throw new Error('Twitter: Unable to fetch media. This tweet may not have media content');
}

// ===== Threads =====
async function downloadThreads(url) {
  // Threads API is very limited, use threads API workaround
  const encoded = encodeURIComponent(url);
  
  // Try using threads API proxy
  const res = await fetch(`https://api.threads.net/v1/media?url=${encoded}`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  }).catch(() => null);
  
  if (res && res.ok) {
    const data = await res.json();
    if (data.media_url || data.video_url) {
      const results = [];
      if (data.video_url) results.push({ url: data.video_url, quality: 'Video', type: 'video' });
      if (data.media_url) results.push({ url: data.media_url, quality: 'Image', type: 'image' });
      return {
        platform: 'Threads',
        title: data.text || 'Threads Post',
        author: data.username || 'Unknown',
        thumbnail: '',
        results
      };
    }
  }
  
  throw new Error('Threads: API is very limited. Try using threads.snapi.app or threadsme.app');
}

// ===== Main Handler =====
async function handleRequest(request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  
  // Health check
  if (url.pathname === '/' || url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok', platforms: ['tiktok', 'instagram', 'youtube', 'twitter', 'threads'] }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    });
  }

  // Download endpoint
  if (url.pathname === '/api/download') {
    const targetUrl = url.searchParams.get('url');
    const platform = url.searchParams.get('platform');
    
    if (!targetUrl) {
      return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    try {
      let result;
      
      // Auto-detect platform if not specified
      const p = platform || detectPlatform(targetUrl);
      
      switch (p) {
        case 'tiktok': result = await downloadTikTok(targetUrl); break;
        case 'instagram': result = await downloadInstagram(targetUrl); break;
        case 'youtube': result = await downloadYouTube(targetUrl); break;
        case 'twitter': result = await downloadTwitter(targetUrl); break;
        case 'threads': result = await downloadThreads(targetUrl); break;
        default:
          return new Response(JSON.stringify({ error: 'Unsupported platform', supported: ['tiktok', 'instagram', 'youtube', 'twitter', 'threads'] }), {
            status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
          });
      }
      
      return new Response(JSON.stringify({ success: true, ...result }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
      
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }
  }

  return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
}

function detectPlatform(url) {
  if (/tiktok\.com|vm\.tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (/threads\.net/i.test(url)) return 'threads';
  return null;
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
