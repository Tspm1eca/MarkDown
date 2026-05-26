// === YouTube 影片偵測 ===
function isYouTubeVideoPage() {
  return window.location.hostname.includes('youtube.com')
    && window.location.pathname === '/watch';
}

function getYouTubeVideoInfo() {
  const title = document.querySelector('yt-formatted-string.ytd-watch-metadata')?.textContent?.trim()
    || document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim()
    || document.title || 'YouTube Video';
  const channel = document.querySelector('ytd-channel-name a')?.textContent?.trim()
    || document.querySelector('yt-formatted-string.ytd-channel-name')?.textContent?.trim()
    || '';
  const description = document.querySelector('#attributed-snippet-text')?.textContent?.trim()
    || document.querySelector('ytd-text-inline-expander > .content')?.textContent?.trim()
    || '';
  return { title, channel, description };
}

// === YouTube API 字幕提取 ===

function formatSubtitleTimestamp(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function extractCaptionTracks(html) {
  const marker = '"captionTracks":';
  const idx = html.indexOf(marker);
  if (idx === -1) return null;

  const arrayStart = html.indexOf('[', idx);
  if (arrayStart === -1 || arrayStart - idx > marker.length + 5) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = arrayStart; i < Math.min(arrayStart + 100000, html.length); i++) {
    const ch = html[i];
    if (esc) { esc = false; continue; }
    if (ch === '\\') { esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(html.substring(arrayStart, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

function selectBestCaptionTrack(tracks) {
  if (!tracks?.length) return null;
  const asrTrack = tracks.find(t => t.kind === 'asr');
  const originalLang = asrTrack?.languageCode;
  if (originalLang) {
    const originalManual = tracks.find(t => t.languageCode === originalLang && t.kind !== 'asr');
    if (originalManual) return originalManual;
  }
  return tracks.find(t => t.languageCode?.startsWith('en') && t.kind !== 'asr')
    || tracks.find(t => t.kind !== 'asr')
    || tracks.find(t => t.languageCode?.startsWith('en') && t.kind === 'asr')
    || tracks[0];
}

const _entityParser = new DOMParser();

function cleanSubtitleText(raw) {
  if (!raw) return '';
  let text = raw.replace(/\s+/g, ' ').trim();
  if (text.includes('&')) {
    text = _entityParser.parseFromString(text, 'text/html').documentElement.textContent;
  }
  return text;
}

function parseSubtitleResponse(xmlText) {
  const parser = new DOMParser();
  let doc = parser.parseFromString(xmlText, 'text/xml');
  const hasParseError = !!doc.querySelector('parsererror');

  let elements = hasParseError ? [] : [...doc.querySelectorAll('text')];

  if (elements.length === 0) {
    const pElements = hasParseError
      ? []
      : [...doc.querySelectorAll('p[t]')];
    if (pElements.length > 0) {
      let transcript = '';
      for (const el of pElements) {
        const ms = parseInt(el.getAttribute('t') || '0', 10);
        const text = cleanSubtitleText(el.textContent);
        if (text) transcript += `[${formatSubtitleTimestamp(ms / 1000)}] ${text}\n`;
      }
      return transcript.trim() || null;
    }
  }

  if (elements.length === 0) {
    doc = parser.parseFromString(`<body>${xmlText}</body>`, 'text/html');
    elements = [...doc.querySelectorAll('text')];
    if (elements.length === 0) {
      const pElements = [...doc.querySelectorAll('p[t]')];
      if (pElements.length > 0) {
        let transcript = '';
        for (const el of pElements) {
          const ms = parseInt(el.getAttribute('t') || '0', 10);
          const text = cleanSubtitleText(el.textContent);
          if (text) transcript += `[${formatSubtitleTimestamp(ms / 1000)}] ${text}\n`;
        }
        return transcript.trim() || null;
      }
    }
  }

  if (elements.length === 0) return null;

  let transcript = '';
  for (const el of elements) {
    const start = parseFloat(el.getAttribute('start') || '0');
    const text = cleanSubtitleText(el.textContent);
    if (text) transcript += `[${formatSubtitleTimestamp(start)}] ${text}\n`;
  }
  return transcript.trim() || null;
}

function extractPotFromTimings() {
  const entry = performance
    .getEntriesByType('resource')
    .filter(e => e.name?.includes('/api/timedtext?'))
    .pop();
  if (!entry) return null;
  try { return new URL(entry.name).searchParams.get('pot'); }
  catch { return null; }
}

async function getPoToken() {
  let pot = extractPotFromTimings();
  if (pot) return pot;

  const btn = document.querySelector('button.ytp-subtitles-button.ytp-button');
  if (btn) {
    btn.click();
    await new Promise(r => setTimeout(r, 200));
    btn.click();
    await new Promise(r => setTimeout(r, 800));
    pot = extractPotFromTimings();
    if (pot) return pot;
  }

  return null;
}

// === YouTube 章節提取 ===

function extractRendererTitle(r) {
  return r?.title?.simpleText || r?.title?.runs?.map(x => x.text).join('') || '';
}

function extractYouTubeChapters(html) {
  let ytData = null;

  const regex = /ytInitialData\s*=\s*(\{.*?\});\s*<\/script/s;
  const match = html.match(regex);
  if (match) {
    try { ytData = JSON.parse(match[1]); } catch (e) { /* ignore */ }
  }

  if (!ytData) return null;

  const panels = ytData?.engagementPanels || [];
  for (const panel of panels) {
    const contents = panel?.engagementPanelSectionListRenderer?.content
      ?.macroMarkersListRenderer?.contents;
    if (!contents) continue;

    const chapters = [];
    for (const item of contents) {
      const r = item?.macroMarkersListItemRenderer;
      if (!r) continue;
      const title = extractRendererTitle(r);
      const startSec = r?.onTap?.watchEndpoint?.startTimeSeconds ?? null;
      const timeLabel = r?.timeDescription?.simpleText || '';
      if (title && startSec !== null) {
        chapters.push({ title, startSec, timeLabel });
      }
    }
    if (chapters.length > 0) return chapters;
  }

  const markersMap = ytData?.playerOverlays?.playerOverlayRenderer
    ?.decoratedPlayerBarRenderer?.decoratedPlayerBarRenderer?.playerBar
    ?.multiMarkersPlayerBarRenderer?.markersMap;
  if (markersMap) {
    for (const entry of markersMap) {
      if (entry?.key !== 'DESCRIPTION_CHAPTERS' && entry?.key !== 'AUTO_CHAPTERS') continue;
      const chapterList = entry.value?.chapters || [];
      const chapters = [];
      for (const ch of chapterList) {
        const r = ch?.chapterRenderer;
        if (!r) continue;
        const title = extractRendererTitle(r);
        const ms = r?.timeRangeStartMillis ?? null;
        if (title && ms !== null) {
          const startSec = Math.floor(ms / 1000);
          chapters.push({ title, startSec, timeLabel: formatSubtitleTimestamp(startSec) });
        }
      }
      if (chapters.length > 0) return chapters;
    }
  }

  return null;
}

function formatChaptersText(chapters) {
  if (!chapters?.length) return '';
  return chapters.map(ch => `[${ch.timeLabel || formatSubtitleTimestamp(ch.startSec)}] ${ch.title}`).join('\n');
}

let _ytTranscriptCache = { videoId: null, transcript: null, chapters: null };

async function extractYouTubeTranscript() {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (videoId && _ytTranscriptCache.videoId === videoId && _ytTranscriptCache.transcript !== null) {
    return { transcript: _ytTranscriptCache.transcript, chapters: _ytTranscriptCache.chapters };
  }

  try {
    let pageHtml = document.documentElement.innerHTML;

    if (!pageHtml.includes('/api/timedtext')) {
      try {
        pageHtml = await (await fetch(location.href, { credentials: 'include' })).text();
      } catch (e) {
        return { transcript: null, chapters: null };
      }
    }

    const chapters = extractYouTubeChapters(pageHtml);

    if (!pageHtml.includes('/api/timedtext')) {
      return { transcript: null, chapters };
    }

    let subtitleUrl = null;
    let langInfo = '';

    const tracks = extractCaptionTracks(pageHtml);
    if (tracks?.length) {
      const track = selectBestCaptionTrack(tracks);
      if (track?.baseUrl) {
        subtitleUrl = track.baseUrl;
        langInfo = ` [${track.languageCode}${track.kind === 'asr' ? '/auto' : ''}]`;
      }
    }

    if (!subtitleUrl) {
      const start = pageHtml.indexOf('https://www.youtube.com/api/timedtext');
      if (start !== -1) {
        let raw = pageHtml.substring(start);
        const endIdx = raw.indexOf('"');
        if (endIdx !== -1) {
          subtitleUrl = raw.substring(0, endIdx).replaceAll('\\u0026', '&');
        }
      }
    }

    if (!subtitleUrl) {
      return { transcript: null, chapters };
    }

    let subtitleData = null;
    const potoken = await getPoToken();
    const fetchUrls = [];
    if (potoken) fetchUrls.push(`${subtitleUrl}&pot=${potoken}&c=WEB`);
    fetchUrls.push(`${subtitleUrl}&c=WEB`);

    for (const url of fetchUrls) {
      try {
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.text();
          if (data.includes('<')) { subtitleData = data; break; }
        }
      } catch (e) { /* ignore */ }
    }

    if (!subtitleData) {
      return { transcript: null, chapters };
    }

    const transcript = parseSubtitleResponse(subtitleData);
    if (transcript && videoId) {
      _ytTranscriptCache = { videoId, transcript, chapters };
    }
    return { transcript, chapters };

  } catch (e) {
    return { transcript: null, chapters: null };
  }
}

// === 內容清理用選擇器 ===
const SELECTORS_TO_REMOVE = [
  'script', 'style', 'nav', 'footer',
  'iframe', 'noscript', 'img', 'svg', 'video', 'audio', 'canvas',
  'template',
  '[role="complementary"]', '[role="navigation"]', '[role="contentinfo"]',
  '[role="search"]', '[role="alert"]', '[role="dialog"]', '[role="tooltip"]',
  '[hidden]', '[popover]', '[data-tippy-root]',
  'dialog', '[aria-modal="true"]',
  'details:not([open])',
  '.dropdown-menu', '.dropdown-content',
  'select',
  '.sidebar', '.nav', '.footer', '.header',
  '.comments', '#comments', '.comment-list',
  '.related-posts', '.related-articles', '.recommended',
  '.share', '.social-share', '.sharing',
  '.breadcrumb', '.breadcrumbs',
  '.cookie-banner', '.cookie-consent',
  '.newsletter', '.subscribe',
  '.ad', '.ads', '.advertisement',
  '.pagination',
  '.video-js', '.plyr', '.jwplayer', '.html5-video-player',
  '.mejs-container', '[data-testid="videoPlayer"]',
  '[data-component="bloomberg-audio-bar"]',
  '[class*="audio-bar"]', '[class*="audioBar"]',
  '.audio-controls', '.audio-subscribe',
  '[class*="audio-control"]', '[class*="AudioControl"]',
  '[data-component*="play-icon"]',
  '[class*="video-duration"]', '[class*="VideoDuration"]',
  '[data-testid="videoDuration"]',
  '[data-testid*="overlay" i]', '[class*="InitialOverlay"]',
  'a time',
  '.visually-hidden', '.sr-only', '.screen-reader-text',
  '[class*="VisuallyHidden"]', '[class*="ScreenReader"]',
  '[class*="immersive-translate"]', '[id*="immersive-translate"]',
  '[class*="darkreader"]',
];

// === Turndown 初始化 ===
let _turndownService = null;

function getTurndownService() {
  if (_turndownService) return _turndownService;

  if (typeof TurndownService === 'undefined') {
    console.warn('TurndownService not loaded');
    return null;
  }

  _turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });

  if (typeof turndownPluginGfm !== 'undefined') {
    _turndownService.use(turndownPluginGfm.gfm);
  }

  _turndownService.addRule('blockTable', {
    filter: function (node) {
      return node.nodeName === 'TABLE' &&
        node.querySelector('ul, ol, blockquote, pre, h1, h2, h3, h4, h5, h6');
    },
    replacement: function (_content, node) {
      var parts = [];
      var headers = node.querySelectorAll('th, caption');
      headers.forEach(function (h) {
        var text = h.textContent.trim();
        if (text) parts.push('**' + text + '**');
      });
      var cells = node.querySelectorAll('td');
      cells.forEach(function (td) {
        var cellMd = _turndownService.turndown(td.innerHTML);
        if (cellMd.trim()) parts.push(cellMd.trim());
      });
      return '\n\n' + parts.join('\n\n') + '\n\n';
    }
  });

  _turndownService.remove(['script', 'style', 'template', 'link', 'meta', 'object', 'embed']);

  return _turndownService;
}

// === 核心提取函數 ===
async function extractPageContent() {
  // YouTube 字幕提取
  if (isYouTubeVideoPage()) {
    const result = await extractYouTubeTranscript();
    const { transcript, chapters } = result;
    const { channel, description } = getYouTubeVideoInfo();

    if (transcript) {
      let content = '';
      if (channel) content += `Channel: ${channel}\n`;
      content += `URL: ${window.location.href}\n\n`;
      if (description) content += `### Description\n${description}\n\n`;
      if (chapters?.length) {
        content += `### Chapters\n${formatChaptersText(chapters)}\n\n`;
      }
      content += `### Transcript\n${transcript}`;
      return { title: document.title, url: window.location.href, content };
    }

    return {
      url: window.location.href,
      error: { code: 'YOUTUBE_TRANSCRIPT_UNAVAILABLE', message: 'Cannot extract YouTube captions.' }
    };
  }

  // 一般網頁提取
  let mainContent = '';
  const turndown = getTurndownService();

  // 標記不可見容器
  const CEREBR_HIDDEN = 'data-cerebr-hidden';
  const hiddenEls = [];
  for (const el of document.body.querySelectorAll('div, section, article, aside, form, fieldset, details, dialog, main, [role]')) {
    if (el.offsetParent === null && el.offsetWidth === 0 && el.offsetHeight === 0
        && getComputedStyle(el).display !== 'contents') {
      el.setAttribute(CEREBR_HIDDEN, '');
      hiddenEls.push(el);
    }
  }

  const tempContainer = document.body.cloneNode(true);

  for (const el of hiddenEls) el.removeAttribute(CEREBR_HIDDEN);

  tempContainer.querySelectorAll(`[${CEREBR_HIDDEN}]`).forEach(el => el.remove());

  const originalFormElements = document.body.querySelectorAll('textarea, input');
  const clonedFormElements = tempContainer.querySelectorAll('textarea, input');
  originalFormElements.forEach((el, index) => {
    if (clonedFormElements[index] && el.value) {
      clonedFormElements[index].textContent = el.value;
    }
  });

  SELECTORS_TO_REMOVE.forEach(selector => {
    tempContainer.querySelectorAll(selector).forEach(element => element.remove());
  });

  tempContainer.querySelectorAll('header').forEach(header => {
    if (!header.querySelector('h1')) {
      header.remove();
    }
  });

  tempContainer.querySelectorAll('[aria-hidden="true"]').forEach(el => {
    const text = el.textContent.trim();
    if (text.length < 10 && /^\d{1,2}:\d{2}(:\d{2})?$/.test(text)) {
      el.remove();
    }
  });

  // 相對 URL → 絕對 URL
  const baseUrl = document.baseURI;
  tempContainer.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    if (href && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('mailto:') && !href.startsWith('javascript:')) {
      try {
        a.setAttribute('href', new URL(href, baseUrl).href);
      } catch (e) {}
    }
    a.removeAttribute('title');
  });

  // 處理卡片式連結
  tempContainer.querySelectorAll('a[href]').forEach(a => {
    const headings = a.querySelectorAll('h1, h2, h3, h4, h5, h6');
    if (headings.length === 0) return;

    const headingTexts = [];
    headings.forEach(h => {
      const text = h.textContent.trim();
      if (text) headingTexts.push(text);
    });
    if (headingTexts.length === 0) return;

    const descriptions = [];
    const descTexts = new Set();
    function collectDesc(el) {
      if (/^H[1-6]$/.test(el.tagName)) return;
      const hasBlock = el.querySelector('h1, h2, h3, h4, h5, h6, p, div, section, article');
      if (el.tagName === 'P' || (el.tagName === 'DIV' && !hasBlock)) {
        const text = el.textContent.trim();
        if (text.length > 40 && !descTexts.has(text)) {
          descTexts.add(text);
          descriptions.push(text);
        }
        return;
      }
      for (const child of el.children) {
        collectDesc(child);
      }
    }
    for (const child of a.children) {
      collectDesc(child);
    }

    a.textContent = headingTexts.join(' - ');

    let insertAfter = a;
    for (const desc of descriptions) {
      const p = document.createElement('p');
      p.textContent = desc;
      if (insertAfter.parentNode) {
        insertAfter.parentNode.insertBefore(p, insertAfter.nextSibling);
        insertAfter = p;
      }
    }
  });

  if (turndown) {
    mainContent = turndown.turndown(tempContainer.innerHTML);
  } else {
    tempContainer.querySelectorAll('a').forEach(a => {
      const text = a.innerText.trim();
      const href = a.href;
      if (text && href && href.startsWith('http')) {
        a.replaceWith(' ' + text + ' (' + href + ') ');
      }
    });
    mainContent = tempContainer.innerText;
  }

  // Markdown 後處理
  mainContent = mainContent
    .replace(/(?:\s*<br\s*\/?>\s*)+/gi, '\n')
    .replace(/^(#{1,4})\s/gm, '##$1 ')
    .replace(/\[([^\]]*\n[^\]]*)\]\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (_, inner, url) => {
      const cleaned = inner.replace(/^#{1,6}\s+/gm, '').replace(/\s+/g, ' ').trim();
      return cleaned ? '[' + cleaned + '](' + url + ')' : '';
    })
    .replace(/\[(?:[\s​‌‍⁠﻿]|<br\s*\/?>)*\]\([^()]*(?:\([^()]*\)[^()]*)*\)/gi, '')
    .replace(/^[ \t​‌‍⁠﻿]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\]\([^()]*(?:\([^()]*\)[^()]*)*\)\s*\[/g, match => match.replace(/\)\s*\[/, ')\n['))
    .replace(/[ \t]+$/gm, '')
    .trim();

  // 逐行去重
  const seenLines = new Set();
  mainContent = mainContent.split('\n').filter(line => {
    const trimmed = line.trim();
    if (trimmed.length < 50) return true;
    if (seenLines.has(trimmed)) return false;
    seenLines.add(trimmed);
    return true;
  }).join('\n')
    .replace(/\n{3,}/g, '\n\n');

  if (mainContent.length < 40) {
    return null;
  }

  return {
    title: document.title,
    url: window.location.href,
    content: mainContent
  };
}

// === 訊息監聽 ===
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'EXTRACT_MARKDOWN') {
    extractPageContent().then(sendResponse).catch(err => {
      sendResponse({ error: { message: err.message || 'Extraction failed' } });
    });
    return true;
  }
});
