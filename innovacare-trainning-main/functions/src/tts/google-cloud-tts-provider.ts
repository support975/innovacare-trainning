/* eslint-disable require-jsdoc */
import {TextToSpeechClient} from "@google-cloud/text-to-speech";
import {
  TtsProvider,
  TtsSynthesisRequest,
  TtsSynthesisResult,
} from "./tts-provider.js";

export class GoogleCloudTtsProvider implements TtsProvider {
  private readonly client = new TextToSpeechClient();

  async synthesize(request: TtsSynthesisRequest): Promise<TtsSynthesisResult> {
    const [response] = await this.client.synthesizeSpeech({
      input: {text: request.transcript},
      voice: {
        languageCode: request.languageCode,
        name: request.voiceName,
      },
      audioConfig: {
        audioEncoding: request.audioEncoding,
        speakingRate: request.speakingRate,
      },
    });

    const audioContent = response.audioContent;
    if (!audioContent) {
      throw new Error("Text-to-Speech returned an empty audio response.");
    }

    return {
      audioContent: Buffer.isBuffer(audioContent) ?
        audioContent :
        Buffer.from(audioContent),
      contentType: "audio/mpeg",
      extension: "mp3",
    };
  }
}
