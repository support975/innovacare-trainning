# Text-to-Speech Audio Generation

Innovacare Training supports admin-generated lesson narration through a Firebase callable function.
The course editor sends a lesson transcript to `generateLessonAudio`; the function synthesizes MP3 audio,
stores it in Firebase Storage, and returns a download URL. The editor then appends or updates an audio
block on the lesson.

## Frontend Flow

Location: `src/app/features/manager/courses`

1. A super admin edits an existing course.
2. In a lesson row, click `Generate Audio`.
3. The editor builds transcript text:
   - first non-empty manual transcript from audio, video, or slide transcript fields
   - otherwise heading/text/callout/slide notes with HTML stripped
   - quiz choices are excluded unless `Include quiz choices in audio` is checked
4. `TtsGenerationService` calls the Firebase callable function.
5. The returned MP3 URL is written into an audio block:

```json
{
  "type": "audio",
  "title": "Audio Recap: Lesson Name",
  "url": "https://...",
  "transcript": "..."
}
```

6. The course `sections` field is persisted so JSON export keeps the generated audio block.

## Backend Flow

Location: `functions/src`

- Callable function: `generateLessonAudio`
- Provider interface: `tts/tts-provider.ts`
- Google implementation: `tts/google-cloud-tts-provider.ts`

The function validates Firebase Auth, checks the user document role, synthesizes MP3 audio, uploads it to:

```text
courses/{courseId}/lessons/{lessonId}/audio/{timestamp}.mp3
```

It returns a Firebase Storage download URL using a download token stored in object metadata.

## Defaults

- Provider: Google Cloud Text-to-Speech
- Language: `en-US`
- Voice: `en-US-Neural2-F`
- Speaking rate: `0.95`
- Encoding: `MP3`

Optional function environment variables:

```text
TTS_PROVIDER=google
TTS_DEFAULT_LANGUAGE=en-US
TTS_DEFAULT_VOICE=en-US-Neural2-F
```

Google Cloud Text-to-Speech uses the Firebase/Google Cloud runtime service account. No frontend API key is
required. Enable the Cloud Text-to-Speech API on the Firebase project and ensure the function runtime service
account can call it.

## Local Testing

```powershell
npm run build
npm --prefix functions run build
npm test -- --watch=false
firebase emulators:start --only functions,hosting
```

For live deployment:

```powershell
firebase deploy --only functions:generateLessonAudio,hosting --project innovacare-training
```

If only frontend code changes:

```powershell
firebase deploy --only hosting --project innovacare-training
```

## Security Notes

- The client never receives provider credentials.
- Audio generation is restricted to users with `admin`, `super_admin`, or `superAdmin` role in `/users/{uid}`.
- Storage writes are performed by Admin SDK in the callable function.
- The returned MP3 URL is tokenized and suitable for lesson playback.

## Limitations

- One request is limited to 4,800 transcript characters to stay within provider request limits.
- Long-form narration should be split into multiple lesson-level audio files in a later iteration.
- The first existing generated `Audio Recap:` block is updated; other manual audio blocks are preserved.
- Additional providers can be added by implementing the `TtsProvider` interface.
