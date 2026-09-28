# ✦ MuseSpark

**Imagine. Create. Inspire.**

MuseSpark is a browser app for people who make songs with [Suno](https://suno.com). It turns those songs into karaoke nights and SMVs (song music videos). There's no build step and no server: songs, stems, lyrics and takes all live in your browser's IndexedDB.

It connects to [VoiceStudio](https://github.com/debpalash/VoiceStudio), an open-source local speech platform, for two jobs:

- **Auto-sync:** word-timed transcription (`POST /v1/audio/transcriptions`, `verbose_json`, word granularity). MuseSpark aligns the result to your written lyrics.
- **Voice spark:** text to speech (`POST /v1/audio/speech`) for spoken intros, shout-outs and MC announcements, using your own VoiceStudio voice profiles.

## Run it

```sh
cd musespark
python3 -m http.server 8000   # then open http://localhost:8000
```

Click **Try the demo song** to hear *First Spark*. It's an original track synthesised in the browser, with an instrumental stem, a vocal stem and word-level timing, so you can try every feature before importing a song of your own.

### Connect VoiceStudio

1. Install and run VoiceStudio: see its [Get started](https://github.com/debpalash/VoiceStudio#get-started) guide. The backend listens on `http://127.0.0.1:3900`.
2. VoiceStudio only accepts browser requests from origins it trusts. Start it with MuseSpark's origin allowed:

   ```sh
   OMNIVOICE_ALLOWED_ORIGINS=http://localhost:8000 bun run dev
   ```

   This replaces VoiceStudio's default origin list. If you also use VoiceStudio's own web UI, add its origin to the same comma-separated list.
3. In MuseSpark, open **⚙ Settings → Test connection**. The VoiceStudio pill in the nav turns green when it's connected.

For a remote GPU box, set the API base URL and API key in Settings. Use HTTPS if the box isn't on a network you fully trust.

## The flow

| Step | Screen | What happens |
| --- | --- | --- |
| **Imagine** | Imagine | Lock and re-spark Suno style prompts (genre, mood, instruments, vocals, tempo, texture). Build a lyric blueprint from a structure and a theme. Browse a themed word bank with rhyme families, and get a daily challenge. Save the blueprint as a song draft. |
| **Import** | Library | Add the Suno MP3/WAV, cover art, optional **instrumental and vocal stems**, the style prompt and the lyrics (Suno `[Verse]`/`[Chorus]` sheets and `.lrc` both work). You can also drag audio files straight onto the library; a same-named `.lrc` or `.txt` file dropped with one is attached as its lyrics. |
| **Sync** | Sync | Tap <kbd>Space</kbd> on each line while the song plays, with arrow-key nudging and 0.7×/0.85× playback. Or click **Auto-sync words** to let VoiceStudio transcribe the song, then align its words to your lyrics. Timestamps that are out of order are flagged in red. Export and import enhanced LRC with word timing. |
| **Sing** | Sing | A karaoke stage with a word-by-word wipe, countdowns after instrumental gaps, and a reactive background. It also has a guide-vocal slider, a ±6 semitone key shift, and a mic with a live pitch trail. The Spark Score compares your pitch to the vocal stem, or rewards singing on time when there's no stem. Record takes and download them. |
| **Share** | SMV | Four themes (Neon Pulse, Aurora, Paper Moon, Glitch Tape), 16:9, 9:16 and 1:1 formats, karaoke-wipe, word-pop or line-fade lyrics, a title card, and an optional VoiceStudio voice intro. Clip any range and render a WebM (or MP4 where the browser supports it) at 1080p or 720p. |

### How karaoke removes the vocals

- **With a Suno instrumental stem:** it plays the stem, so the vocals are fully gone. This is the best result.
- **Without stems:** it reduces the vocals by filtering the full mix. This center-channel cancellation (L − R, with the low end added back) removes most center-panned lead vocals. It can't work on mono files, and the app says so when that happens.

The guide vocal slider blends in the vocal stem, or a little of the original mix when there's no stem.

## Code map

| File | Role |
| --- | --- |
| `js/util.js` | DOM helpers, settings, seeded RNG, WAV encoder, generated cover art |
| `js/store.js` | IndexedDB storage for songs (with audio blobs) and takes |
| `js/lyrics.js` | Suno and LRC parsing, LRC export, word-timing estimates, Needleman–Wunsch alignment of ASR words to lyrics |
| `js/audio.js` | Web Audio engine: synced stems, vocal reduction, key shift, mic, YIN pitch detection, MediaRecorder |
| `js/voicestudio.js` | VoiceStudio client (discovery, transcription, speech, voices) |
| `js/demo.js` | Offline-rendered demo song with stems and word timing |
| `js/inspire.js` | Imagine screen: prompt sparks, blueprints, word bank, challenge, voice spark |
| `js/stage.js` | Karaoke stage, scoring and takes |
| `js/smv.js` | SMV canvas renderer and real-time video export |
| `js/app.js` | Router, library, import dialog, sync studio, settings, home |

## Notes

- **Rights:** only upload songs you have the rights to use. Check Suno's terms for your plan before publishing SMVs commercially. Only clone voices in VoiceStudio with the speaker's permission.
- **Privacy:** audio is sent only to the VoiceStudio address you configure. Nothing else leaves the browser.
- **Export tips:** rendering happens in real time, so keep the tab visible while a video renders. Use headphones for karaoke, so the speakers don't bleed into the mic and skew the score.
- **Founder:** set the founder name shown on the home page in ⚙ Settings.
