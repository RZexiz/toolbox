// Node.js Media Downloader Backend
// Port: 3100

const http = require('http');
const https = require('https');

const PORT = 3100;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Helper: fetch with redirect follow
async function fetchUrl(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', ...options.headers },
    ...options,
  });
  return res;
}

// ===== TikTok =====
async function downloadTikTok(url) {
  const api = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=1`;
  const res = await fetchUrl(api);
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
  const encoded = encodeURIComponent(url);
  
  // Try piapi
  try {
    const apiRes = await fetchUrl(`https://api.piapi.me/api/v1/instagram/media?media_id=${encoded}`);
    if (apiRes.ok) {
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
  } catch (e) {}

  // Fallback: igdownloader
  try {
    const fallbackRes = await fetchUrl(`https://api.igdownloader.app/api?url=${encoded}`);
    if (fallbackRes.ok) {
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
  } catch (e) {}

  throw new Error('Instagram: Unable to fetch. Try saveig.app or snapinsta.app');
}

// ===== YouTube =====
async function downloadYouTube(url) {
  const encoded = encodeURIComponent(url);

  // Try cobalt
  try {
    const cobaltRes = await fetchUrl('https://api.cobalt.tools/api/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ url, isAudioOnly: false, filenamePattern: 'basic' })
    });
    if (cobaltRes.ok) {
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
  } catch (e) {}

  // Fallback: vevioz
  try {
    const fallbackRes = await fetchUrl(`https://api.vevioz.com/api/button/videos?url=${encoded}`);
    if (fallbackRes.ok) {
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
  } catch (e) {}

  throw new Error('YouTube: Unable to fetch. Try y2mate or ssyoutube directly');
}

// ===== Twitter/X =====
async function downloadTwitter(url) {
  const fxUrl = url.replace(/twitter\.com|x\.com/, 'api.fxtwitter.com');
  const res = await fetchUrl(fxUrl);
  
  if (res.ok) {
    const data = await res.json();
    const tweet = data.tweet;
    if (tweet) {
      const results = [];
      if (tweet.media) {
        if (tweet.media.photos) {
          tweet.media.photos.forEach(p => results.push({ url: p.url, quality: 'Photo', type: 'image' }));
        }
        if (tweet.media.videos) {
          tweet.media.videos.forEach(v => {
            const bestUrl = v.url || (v.variants && v.variants.length > 0 ? v.variants[v.variants.length - 1].url : '');
            if (bestUrl) results.push({ url: bestUrl, quality: 'Video', type: 'video' });
          });
        }
        if (tweet.media.animated) {
          tweet.media.animated.forEach(a => results.push({ url: a.url, quality: 'GIF', type: 'video' }));
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
  const encoded = encodeURIComponent(url);
  try {
    const res = await fetchUrl(`https://api.threads.net/v1/media?url=${encoded}`);
    if (res.ok) {
      const data = await res.json();
      if (data.media_url || data.video_url) {
        const results = [];
        if (data.video_url) results.push({ url: data.video_url, quality: 'Video', type: 'video' });
        if (data.media_url) results.push({ url: data.media_url, quality: 'Image', type: 'image' });
        return { platform: 'Threads', title: data.text || 'Threads Post', author: data.username || 'Unknown', thumbnail: '', results };
      }
    }
  } catch (e) {}
  throw new Error('Threads: API is very limited. Try threads.snapi.app or threadsme.app');
}

function detectPlatform(url) {
  if (/tiktok\.com|vm\.tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/youtube\.com|youtu\.be/i.test(url)) return 'youtube';
  if (/twitter\.com|x\.com/i.test(url)) return 'twitter';
  if (/threads\.net/i.test(url)) return 'threads';
  return null;
}

// ===== HTTP Server =====
const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  // Health check
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/health') {
    res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', platforms: ['tiktok', 'instagram', 'youtube', 'twitter', 'threads'] }));
  }

  // Download endpoint
  if (parsedUrl.pathname === '/api/download') {
    const targetUrl = parsedUrl.searchParams.get('url');
    const platform = parsedUrl.searchParams.get('platform');

    if (!targetUrl) {
      res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Missing url parameter' }));
    }

    try {
      const p = platform || detectPlatform(targetUrl);
      let result;

      switch (p) {
        case 'tiktok': result = await downloadTikTok(targetUrl); break;
        case 'instagram': result = await downloadInstagram(targetUrl); break;
        case 'youtube': result = await downloadYouTube(targetUrl); break;
        case 'twitter': result = await downloadTwitter(targetUrl); break;
        case 'threads': result = await downloadThreads(targetUrl); break;
        default:
          res.writeHead(400, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'Unsupported platform', supported: ['tiktok', 'instagram', 'youtube', 'twitter', 'threads'] }));
      }

      res.writeHead(200, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true, ...result }));

    } catch (err) {
      res.writeHead(500, { ...CORS_HEADERS, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: err.message }));
    }
  }

  res.writeHead(404, CORS_HEADERS);
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Downloader API running on port ${PORT}`);
});
