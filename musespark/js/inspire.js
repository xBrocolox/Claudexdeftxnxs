// MuseSpark: Imagine. Suno style-prompt sparks, song blueprints, theme word banks, the daily challenge
// and VoiceStudio voice intros.

const Inspire = (() => {
  const BANK = {
    Genre: ['synthpop', 'city pop', 'dream pop', 'indie folk', 'future garage', 'lo-fi hip hop', 'j-rock', 'k-pop', 'afrobeats', 'drum and bass', 'bossa nova', 'emo rap', 'chamber pop', 'hyperpop', 'neo-soul', 'shoegaze', 'reggaeton', 'country pop', 'synthwave', 'orchestral pop', 'funk', 'trip hop', 'eurobeat', 'anime opening'],
    Mood: ['euphoric', 'bittersweet', 'nocturnal', 'defiant', 'tender', 'nostalgic', 'triumphant', 'dreamy', 'restless', 'playful', 'haunting', 'hopeful', 'cinematic', 'sun-drenched', 'melancholic', 'electric'],
    Instruments: ['glassy synth arps', 'warm Rhodes', 'fingerpicked guitar', 'punchy 808s', 'string quartet', 'slap bass', 'gated reverb drums', 'music box', 'brass stabs', 'plucked koto', 'analog pads', 'distorted guitars', 'handclaps', 'harp glissandos', 'vocal chops', 'upright piano'],
    Vocals: ['breathy female vocals', 'soulful male vocals', 'airy falsetto', 'gritty belted vocals', 'duet vocals', 'choir harmonies', 'whispered verses, soaring chorus', 'playful rap verses', 'raspy alto', 'bright tenor'],
    Tempo: ['72 bpm', '86 bpm', '96 bpm', '104 bpm', '112 bpm', '120 bpm', '128 bpm', '140 bpm', '174 bpm', 'half-time groove', 'four-on-the-floor'],
    Texture: ['wide stereo', 'tape saturation', 'crisp modern mix', '80s sheen', 'rainy ambience', 'vinyl crackle', 'big stadium reverb', 'intimate and dry', 'lush layers', 'glitchy edits'],
  };
  const STRUCTURES = {
    'Pop song': ['Intro', 'Verse 1', 'Pre-Chorus', 'Chorus', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Bridge', 'Final Chorus', 'Outro'],
    'Short / Reel (≈60 s)': ['Verse', 'Chorus', 'Chorus'],
    'Karaoke anthem': ['Intro', 'Verse 1', 'Chorus', 'Verse 2', 'Chorus', 'Chant', 'Final Chorus'],
    'Ballad': ['Verse 1', 'Verse 2', 'Chorus', 'Verse 3', 'Chorus', 'Bridge', 'Chorus', 'Outro'],
    'Rap / Hip-hop': ['Intro', 'Verse 1', 'Hook', 'Verse 2', 'Hook', 'Bridge', 'Hook', 'Outro'],
    'Dance drop': ['Intro', 'Verse', 'Build', 'Drop', 'Verse 2', 'Build', 'Drop', 'Outro'],
  };
  const GUIDE = {
    Intro: ['set the mood in one image', 'a line you could whisper'],
    Verse: ['where are we? name a place and a time', 'one concrete detail you can see', 'what just happened?', 'a feeling, shown not told'],
    'Pre-Chorus': ['raise the tension, shorter words', 'ask a question the chorus answers'],
    Chorus: ['the hook: say the title in 3–6 words', 'answer the hook with a promise', 'repeat the hook (people love to sing it twice)', 'end on an open vowel: oh, ay, ee'],
    Hook: ['the hook in one breath', 'a call the crowd can answer', 'repeat it with a twist'],
    Bridge: ['flip the perspective', 'the truth you avoided until now'],
    Build: ['count it up: short and rising'],
    Drop: ['one chantable word or vocal chop'],
    Chant: ['a call and response: "hey!" "ho!"', 'everyone sings: la la la'],
    Outro: ['echo the first image, changed', 'fade on the hook'],
  };
  const THEMES = {
    city: ['neon', 'subway', 'skyline', 'rooftop', 'taxi lights', 'midnight diner', 'crosswalk', 'static radio'],
    nature: ['tide', 'wildfire', 'orchard', 'thunder', 'river stone', 'pine smoke', 'first frost', 'meadow'],
    cosmos: ['satellite', 'comet tail', 'gravity', 'moonlit', 'orbit', 'starlight', 'nebula', 'eclipse'],
    heart: ['heartbeat', 'secret', 'promise', 'handwritten', 'goodbye', 'fever', 'lullaby', 'polaroid'],
    motion: ['runaway', 'spin', 'freefall', 'highway', 'paper plane', 'chase', 'drift', 'take off'],
    time: ['yesterday', 'clockwork', 'summer’s end', 'rewind', 'forever', 'last train', 'old photograph', 'sunrise'],
  };
  const RHYMES = [['light', 'night', 'bright', 'fight', 'sky-high'], ['fire', 'higher', 'wire', 'desire'], ['heart', 'start', 'apart', 'spark', 'dark'], ['stay', 'away', 'today', 'okay', 'play'], ['dream', 'seem', 'stream', 'gleam'], ['sing', 'everything', 'wing', 'ring', 'spring'], ['go', 'glow', 'slow', 'know', 'below'], ['free', 'sea', 'be', 'me', 'gravity']];
  const CHALLENGES = [
    'Write a chorus that uses only five different words.',
    'Make a song whose title is a color you’ve never used before.',
    'Record a karaoke take one key higher than feels comfortable.',
    'Build a 9:16 SMV from a 30-second chorus clip and share it.',
    'Write a verse entirely in questions.',
    'Pick two genres from the spark list that shouldn’t work together, and make them work.',
    'Write a love song to a place, not a person.',
    'Include a call-and-response chant a crowd could sing at a karaoke night.',
    'Write a bridge that flips the whole song’s meaning.',
    'Use a sound from your room as the song’s opening image.',
    'Make the same lyrics as two Suno styles and SMV both side by side.',
    'Write a hook that works whispered and shouted.',
    'Sing your song with the guide vocal off and beat your score.',
    'Write lyrics set in the exact minute you are in right now.',
    'Tell a story in three verses: morning, noon, midnight.',
    'Write a song for someone who has never heard music before.',
  ];

  const locked = {};
  const current = {};
  let r = rng(Date.now());

  function spark() {
    for (const k of Object.keys(BANK)) if (!locked[k] || !current[k]) current[k] = pick(r, BANK[k]);
    render();
  }
  function prompt() { return Object.keys(BANK).map(k => current[k]).join(', '); }

  function render() {
    const box = $('#ins-chips'); box.innerHTML = '';
    for (const k of Object.keys(BANK)) {
      const c = h('button', 'chip' + (locked[k] ? ' locked' : ''), `<small>${k}${locked[k] ? ' 🔒' : ''}</small>${esc(current[k])}`);
      c.title = locked[k] ? 'Unlock' : 'Lock this one';
      c.onclick = () => { locked[k] = !locked[k]; render(); };
      box.appendChild(c);
    }
    const p = prompt();
    $('#ins-prompt').textContent = p;
    $('#ins-len').textContent = `${p.length} chars`;
  }

  function themeWords(theme) {
    const tr = rng(Lyrics.norm(theme) || 'spark');
    const sets = Object.keys(THEMES).sort(() => tr() - 0.5).slice(0, 3);
    const words = [];
    if (theme.trim()) words.push(theme.trim());
    sets.forEach(s => THEMES[s].slice().sort(() => tr() - 0.5).slice(0, 4).forEach(w => words.push(w)));
    const rhyme = pick(tr, RHYMES);
    return { words, rhyme };
  }

  function blueprint() {
    const theme = $('#ins-theme').value.trim();
    const sections = STRUCTURES[$('#ins-structure').value];
    const { words } = themeWords(theme);
    const br = rng((theme || 'spark') + sections.length);
    const out = [];
    for (const s of sections) {
      const key = Object.keys(GUIDE).find(g => s.startsWith(g)) || (s.includes('Chorus') ? 'Chorus' : 'Verse');
      out.push(`[${s}]`);
      const n = key === 'Intro' || key === 'Outro' || key === 'Drop' || key === 'Build' ? 2 : 4;
      for (let i = 0; i < n; i++) {
        const g = GUIDE[key][i % GUIDE[key].length];
        out.push(`✎ ${g}${i === 0 && words.length ? ` (try “${pick(br, words)}”)` : ''}`);
      }
      out.push('');
    }
    $('#ins-lyrics').value = out.join('\n').trim();
    renderBank(theme);
  }

  function renderBank(theme) {
    const { words, rhyme } = themeWords(theme);
    $('#ins-bank').innerHTML = words.map(w => `<span>${esc(w)}</span>`).join('') +
      `<div class="rhyme"><small>rhyme family</small> ${rhyme.map(esc).join(' · ')}</div>`;
  }

  function challenge() {
    const d = new Date(), key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    $('#ins-challenge').innerHTML = `<small>${d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</small><p>${esc(pick(rng(key), CHALLENGES))}</p>`;
  }

  // ═════════ VOICE SPARK ═════════
  let voiceBlob = null;
  async function loadVoices() {
    try {
      const list = await VoiceStudio.voices();
      const sel = $('#vs-voice'), cur = sel.value;
      sel.innerHTML = list.map(v => `<option value="${esc(v.voice_id)}">${esc(v.name)}${v.type === 'profile' ? ' ★' : ''}</option>`).join('') || '<option value="default">default voice</option>';
      if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
      if (!list.some(v => v.voice_id === cur)) { const prof = list.find(v => v.type === 'profile'); if (prof) sel.value = prof.voice_id; }
    } catch (e) { /* offline: keep default */ }
  }

  async function speak() {
    const text = $('#vs-say').value.trim();
    if (!text) return;
    const btn = $('#vs-speak'); btn.disabled = true; btn.textContent = 'Generating…';
    try {
      voiceBlob = await VoiceStudio.speak(text, { voice: $('#vs-voice').value, speed: +$('#vs-speed').value || 1 });
      const a = $('#vs-audio'); a.hidden = false; a.src = URL.createObjectURL(voiceBlob); a.play().catch(() => {});
      $('#vs-attach').disabled = false;
      loadVoices();
    } catch (e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = 'Generate voice';
  }

  async function fillSongSelect() {
    const songs = await DB.songs();
    $('#vs-attach-song').innerHTML = songs.map(s => `<option value="${s.id}">${esc(s.title)}</option>`).join('') || '<option value="">(no songs yet)</option>';
  }

  async function attach() {
    const id = $('#vs-attach-song').value;
    if (!id || !voiceBlob) return;
    const s = await DB.song(id);
    s.intro = voiceBlob;
    await DB.saveSong(s);
    toast(`Intro attached to “${s.title}”. Turn on Voice intro in the SMV maker.`);
  }

  function init() {
    $('#ins-structure').innerHTML = Object.keys(STRUCTURES).map(k => `<option>${k}</option>`).join('');
    $('#ins-spark').onclick = () => { r = rng(Date.now()); spark(); };
    $('#ins-copy').onclick = () => copyText(prompt(), 'Style prompt copied. Paste it into Suno.', $('#ins-prompt'));
    $('#ins-copy-lyrics').onclick = () => copyText($('#ins-lyrics').value, 'Blueprint copied', $('#ins-lyrics'));
    $('#ins-blueprint').onclick = blueprint;
    $('#ins-structure').onchange = blueprint;
    let deb; $('#ins-theme').oninput = () => { clearTimeout(deb); deb = setTimeout(blueprint, 300); };
    $('#ins-draft').onclick = async () => {
      const theme = $('#ins-theme').value.trim();
      const lyricsRaw = $('#ins-lyrics').value;
      const song = { id: uid(), title: theme ? theme.replace(/\b\w/g, c => c.toUpperCase()) : 'Untitled spark', artist: Settings.get('founder'), style: prompt(), lyricsRaw, lines: Lyrics.parse(lyricsRaw), audio: null, instrumental: null, vocals: null, cover: null, intro: null, duration: 0, created: Date.now() };
      await DB.saveSong(song);
      toast('Draft saved. Add the Suno audio once you have generated it.');
      location.hash = '#/library';
    };
    $('#vs-speak').onclick = speak;
    $('#vs-attach').onclick = attach;
    spark(); blueprint(); challenge();
  }

  // Only ask VoiceStudio for voices once it has been reached, so a missing backend doesn't log failed requests.
  async function show() { fillSongSelect(); if (VoiceStudio.state === 'online' || Settings.get('vsSeen')) loadVoices(); }

  return { init, show };
})();
