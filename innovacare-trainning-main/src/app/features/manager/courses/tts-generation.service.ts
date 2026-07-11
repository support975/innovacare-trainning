import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export const DEFAULT_TTS_LANGUAGE = 'en-US';
export const DEFAULT_TTS_VOICE = 'en-US-Neural2-F';
export const DEFAULT_TTS_SPEAKING_RATE = 0.95;

export interface GenerateLessonAudioRequest {
  courseId: string;
  lessonId: string;
  transcript: string;
  title: string;
  language?: string;
  voice?: string;
  speakingRate?: number;
}

export interface GenerateLessonAudioResponse {
  url: string;
  path: string;
  title: string;
  transcript: string;
  voice: string;
  language: string;
  speakingRate: number;
  audioEncoding: 'MP3';
}

@Injectable({ providedIn: 'root' })
export class TtsGenerationService {
  private functions = inject(Functions);

  async generateLessonAudio(request: GenerateLessonAudioRequest): Promise<GenerateLessonAudioResponse> {
    const callable = httpsCallable<GenerateLessonAudioRequest, GenerateLessonAudioResponse>(
      this.functions,
      'generateLessonAudio'
    );

    try {
      const result = await callable({
        ...request,
        language: request.language || DEFAULT_TTS_LANGUAGE,
        voice: request.voice || DEFAULT_TTS_VOICE,
        speakingRate: request.speakingRate ?? DEFAULT_TTS_SPEAKING_RATE,
      });
      return result.data;
    } catch (error: any) {
      const message = error?.message || error?.details || 'Unable to generate lesson audio.';
      throw new Error(message);
    }
  }
}
