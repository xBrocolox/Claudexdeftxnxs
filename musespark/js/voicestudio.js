// MuseSpark: VoiceStudio client (https://github.com/debpalash/VoiceStudio).
// Uses its local OpenAI-compatible API: word-timed transcription for lyric sync and TTS for voice intros.

const VoiceStudio = (() => {
  let state = 'unknown'; // unknown | online | offline
  const listeners = new Set();
  const setState = (s, info) => { state = s; if (s === 'online') Settings.set('vsSeen', true); listeners.forEach(f => f(s, info)); };

  const base = () => String(Settings.get('vsUrl') || 'http://127.0.0.1:3900').replace(/\/+$/, '');
  function headers(extra = {}) {
    const k = Settings.get('vsKey');
    return k ? { ...extra, Authorization: `Bearer ${k}` } : extra;
  }

  async function errorFrom(res) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const j = await res.json();
      msg = (j.error && (j.error.message || j.error)) || j.detail || msg;
      if (typeof msg !== 'string') msg = JSON.stringify(msg);
    } catch (e) { /* not json */ }
    return new Error(msg);
  }

  function explain(e) {
    if (e instanceof TypeError) return new Error(`Couldn't reach VoiceStudio at ${base()}. Make sure it's running and that it allows this page's origin (Settings › CORS).`);
    return e;
  }

  async function ping() {
    try {
      const res = await fetch(`${base()}/.well-known/voicestudio-speech`, { headers: headers() });
      if (!res.ok) {
        const h = await fetch(`${base()}/health`, { headers: headers() });
        if (!h.ok) throw await errorFrom(h);
        setState('online', {}); return {};
      }
      const info = await res.json();
      setState('online', info); return info;
    } catch (e) {
      setState('offline'); throw explain(e);
    }
  }

  // → { text, segments: [{ start, end, text }], words: [{ word, start, end }] }
  async function transcribe(blob, { language, prompt, signal } = {}) {
    const fd = new FormData();
    const ext = (blob.type.split('/')[1] || 'wav').split(';')[0].replace('mpeg', 'mp3');
    fd.append('file', blob, `song.${ext}`);
    fd.append('model', 'whisper-1');
    fd.append('response_format', 'verbose_json');
    fd.append('timestamp_granularities[]', 'word');
    fd.append('timestamp_granularities[]', 'segment');
    if (language) fd.append('language', language);
    if (prompt) fd.append('prompt', prompt.slice(0, 800));
    try {
      const res = await fetch(`${base()}/v1/audio/transcriptions`, { method: 'POST', body: fd, headers: headers(), signal });
      if (!res.ok) throw await errorFrom(res);
      setState('online');
      return await res.json();
    } catch (e) { if (e.name === 'AbortError') throw e; if (e instanceof TypeError) setState('offline'); throw explain(e); }
  }

  async function speak(text, { voice = 'default', speed = 1, model = 'omnivoice' } = {}) {
    try {
      const res = await fetch(`${base()}/v1/audio/speech`, {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ model, input: text, voice, speed, response_format: 'wav' }),
      });
      if (!res.ok) throw await errorFrom(res);
      setState('online');
      return await res.blob();
    } catch (e) { if (e instanceof TypeError) setState('offline'); throw explain(e); }
  }

  async function voices() {
    try {
      const res = await fetch(`${base()}/v1/audio/voices`, { headers: headers() });
      if (!res.ok) throw await errorFrom(res);
      return (await res.json()).voices || [];
    } catch (e) { throw explain(e); }
  }

  return { ping, transcribe, speak, voices, base, onState: (f) => listeners.add(f), get state() { return state; } };
})();
