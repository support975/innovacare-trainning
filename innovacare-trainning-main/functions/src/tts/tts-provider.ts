export type TtsAudioEncoding = "MP3";

export interface TtsSynthesisRequest {
  transcript: string;
  languageCode: string;
  voiceName: string;
  speakingRate: number;
  audioEncoding: TtsAudioEncoding;
}

export interface TtsSynthesisResult {
  audioContent: Buffer;
  contentType: "audio/mpeg";
  extension: "mp3";
}

export interface TtsProvider {
  synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResult>;
}
