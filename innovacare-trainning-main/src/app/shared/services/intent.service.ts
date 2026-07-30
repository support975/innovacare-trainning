import { Injectable } from '@angular/core';

export type AssistantIntent =
  | 'quiz'
  | 'clinical_case'
  | 'nursing_note'
  | 'explain'
  | 'treatment'
  | 'course_navigation'
  | 'chat';

export interface DetectedIntent {
  intent: AssistantIntent;
  confidence: number;
  topic?: string;
}

const INTENT_PATTERNS: Array<{
  intent: AssistantIntent;
  patterns: RegExp[];
  topicExtract?: RegExp;
}> = [
  {
    intent: 'quiz',
    patterns: [
      /\bquiz\b/i,
      /\btest\s+me\b/i,
      /\bask\s+me\b/i,
      /\bquestion(s)?\b/i,
      /\bpractice\b/i,
      /\bflashcard/i,
      /\bexam\s+prep\b/i,
      /\bchallenge\s+me\b/i,
    ],
    topicExtract: /(?:quiz|test|ask)\s+(?:me\s+)?(?:on|about)\s+(.+)/i,
  },
  {
    intent: 'clinical_case',
    patterns: [
      /\bclinical\s+case\b/i,
      /\bcase\s+stud(y|ies)\b/i,
      /\bsimulat/i,
      /\bscenario\b/i,
      /\bpatient\s+case\b/i,
      /\bwound\s+case\b/i,
      /\bstart\s+(?:a\s+)?case\b/i,
    ],
  },
  {
    intent: 'nursing_note',
    patterns: [
      /\bnursing\s+note\b/i,
      /\bprogress\s+note\b/i,
      /\bsbar\b/i,
      /\bcare\s+plan\b/i,
      /\bdocument(ation)?\b/i,
      /\bgenerate\s+(?:a\s+)?note\b/i,
      /\bwrite\s+(?:a\s+)?note\b/i,
      /\bclinical\s+doc/i,
    ],
  },
  {
    intent: 'explain',
    patterns: [
      /\bexplain\b/i,
      /\bwhat\s+is\b/i,
      /\bhow\s+does\b/i,
      /\bdefine\b/i,
      /\bsimpl(y|ify)\b/i,
      /\blike\s+(?:a\s+)?beginner\b/i,
      /\bin\s+simple\s+terms\b/i,
      /\bbreak\s+(?:it\s+)?down\b/i,
      /\bhelp\s+me\s+understand\b/i,
    ],
    topicExtract: /(?:explain|what is|define)\s+(.+?)(?:\?|$)/i,
  },
  {
    intent: 'treatment',
    patterns: [
      /\btreatment\b/i,
      /\btreat\b/i,
      /\bdressing\b/i,
      /\bwound\s+care\b/i,
      /\bmanag(?:e|ement)\b/i,
      /\bintervent/i,
      /\bprotocol\b/i,
      /\btherapy\b/i,
      /\bcare\s+plan\b/i,
      /\bstage\s+[1-4ivIV]\b/i,
    ],
    topicExtract: /(?:treatment|care|manage|treat)\s+(?:for\s+)?(.+?)(?:\?|$)/i,
  },
  {
    intent: 'course_navigation',
    patterns: [
      /\bcontinue\s+(?:my\s+)?course\b/i,
      /\bmy\s+course(s)?\b/i,
      /\bmy\s+progress\b/i,
      /\bcertif/i,
      /\bnext\s+(?:lesson|module|step)\b/i,
      /\bwhere\s+(?:was\s+i|did\s+i\s+leave)/i,
      /\bresume\b/i,
      /\bcomplete\b.*\bcourse\b/i,
    ],
  },
];

@Injectable({ providedIn: 'root' })
export class IntentService {
  detect(text: string): DetectedIntent {
    const lower = text.toLowerCase();
    let bestIntent: AssistantIntent = 'chat';
    let bestScore = 0;
    let topic: string | undefined;

    for (const def of INTENT_PATTERNS) {
      let score = 0;
      for (const pattern of def.patterns) {
        if (pattern.test(lower)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestIntent = def.intent;
        if (def.topicExtract) {
          const match = text.match(def.topicExtract);
          topic = match?.[1]?.trim();
        }
      }
    }

    return {
      intent: bestIntent,
      confidence: bestScore > 0 ? Math.min(1, bestScore / 3) : 0,
      topic,
    };
  }

  getSystemHintForIntent(intent: AssistantIntent): string {
    switch (intent) {
      case 'quiz':
        return 'The user wants to be quizzed. Generate 3 multiple-choice questions with 4 options each. ' +
          'Format each question as: Q: [question]\nA) [option]\nB) [option]\nC) [option]\nD) [option]\nCorrect: [letter]\nExplanation: [brief rationale]';
      case 'clinical_case':
        return 'The user wants a clinical simulation. Present a realistic wound care patient scenario. ' +
          'Include: patient age/background, wound type, location, drainage, tissue type. ' +
          'Then ask them to: 1) Stage the wound, 2) Select treatment, 3) Identify risks. Wait for their answers.';
      case 'nursing_note':
        return 'The user wants to generate clinical documentation. Ask them for: patient info, wound assessment details, ' +
          'interventions performed, and patient response. Then generate a professional SNF-ready nursing note ' +
          'using SBAR format with clinical terminology.';
      case 'explain':
        return 'Explain clearly and simply, as if teaching a nursing student. ' +
          'Use analogies, bullet points, and plain language. Avoid excessive jargon unless defining it.';
      case 'treatment':
        return 'Provide evidence-based wound care treatment recommendations. ' +
          'Include: wound preparation, dressing selection, frequency, infection signs, and when to escalate.';
      case 'course_navigation':
        return 'Help the user navigate their learning journey. Reference their course progress, ' +
          'suggest next steps, and encourage continued learning.';
      default:
        return '';
    }
  }
}
