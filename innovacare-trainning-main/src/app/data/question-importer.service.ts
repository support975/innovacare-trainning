import { Injectable } from '@angular/core';
import { ExamBlueprintQuestion } from './exam-blueprint.model';

export interface ImportedQuestion {
  prompt: string;
  mode: 'single' | 'multi';
  options: Array<{ id: string; text: string }>;
  correctAnswers: string[];
  explanation?: string;
  points?: number;
}

interface JsonQuestion {
  question?: string;
  prompt?: string;
  text?: string;
  type?: string;
  mode?: string;
  answers?: string[];
  options?: string[] | Array<{ text: string; id?: string }>;
  correct?: string | string[] | number | number[];
  correctAnswer?: string | string[] | number | number[];
  explanation?: string;
  points?: number;
}

@Injectable({ providedIn: 'root' })
export class QuestionImporterService {
  async importFromJson(file: File): Promise<ImportedQuestion[]> {
    const text = await this.readFile(file);
    try {
      const data = JSON.parse(text);
      const questions = Array.isArray(data) ? data : data.questions || [];
      return this.parseJsonQuestions(questions);
    } catch (err) {
      throw new Error('Invalid JSON format. Expected array of questions or { questions: [...] }');
    }
  }

  async importFromWord(file: File): Promise<ImportedQuestion[]> {
    try {
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ arrayBuffer });
      return this.parseTextQuestions(result.value);
    } catch (err) {
      throw new Error('Failed to parse Word document. Ensure it\'s a valid .docx file.');
    }
  }

  async importFromPdf(file: File): Promise<ImportedQuestion[]> {
    try {
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      let text = '';

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      }

      return this.parseTextQuestions(text);
    } catch (err) {
      throw new Error('Failed to parse PDF. Ensure it\'s a valid PDF file.');
    }
  }

  private parseJsonQuestions(questions: JsonQuestion[]): ImportedQuestion[] {
    return questions.map((q, idx) => {
      const prompt = q.prompt || q.question || q.text || '';
      if (!prompt) throw new Error(`Question ${idx + 1}: Missing prompt/question field`);

      // Parse options
      let options: Array<{ id: string; text: string }> = [];
      if (Array.isArray(q.options)) {
        options = q.options.map((opt, i) => {
          if (typeof opt === 'string') {
            return {
              id: `opt-${i}`,
              text: opt,
            };
          } else {
            return {
              id: opt.id ? String(opt.id) : `opt-${i}`,
              text: opt.text || '',
            };
          }
        });
      }

      if (options.length < 2) {
        throw new Error(`Question "${prompt}": Must have at least 2 options`);
      }

      // Parse correct answers
      let correctAnswers: string[] = [];
      if (q.correct !== undefined) {
        correctAnswers = Array.isArray(q.correct)
          ? q.correct.map(c => this.normalizeAnswerId(c, options))
          : [this.normalizeAnswerId(q.correct, options)];
      } else if (q.correctAnswer !== undefined) {
        correctAnswers = Array.isArray(q.correctAnswer)
          ? q.correctAnswer.map(c => this.normalizeAnswerId(c, options))
          : [this.normalizeAnswerId(q.correctAnswer, options)];
      }

      if (correctAnswers.length === 0) {
        throw new Error(`Question "${prompt}": Must specify at least one correct answer`);
      }

      const mode = q.mode || (correctAnswers.length > 1 ? 'multi' : 'single');

      return {
        prompt,
        mode: mode as 'single' | 'multi',
        options,
        correctAnswers,
        explanation: q.explanation || '',
        points: q.points || 10,
      };
    });
  }

  private parseTextQuestions(text: string): ImportedQuestion[] {
    // Simple parsing: split by numbered patterns like "1.", "Q1:", etc.
    const questionPattern =
      /^[Q]?\d+[\.:)]+\s*(.+?)(?=^[Q]?\d+[\.:)]+|$)/gm;
    const matches = [...text.matchAll(questionPattern)];

    if (matches.length === 0) {
      throw new Error(
        'Could not parse questions. Use format:\n' +
        '1. Question text\n' +
        'A) Option 1\n' +
        'B) Option 2\n' +
        'C) Option 3\n' +
        'Answer: A'
      );
    }

    const questions: ImportedQuestion[] = [];

    matches.forEach((match, idx) => {
      const questionText = match[1].trim();
      const lines = questionText.split('\n').map(l => l.trim()).filter(Boolean);

      if (lines.length < 3) {
        return; // Skip incomplete questions
      }

      const prompt = lines[0];
      const options: Array<{ id: string; text: string }> = [];
      let answerLine = '';

      // Parse options (A), B), 1), etc.
      lines.forEach((line, i) => {
        if (i === 0) return;

        const optionMatch = line.match(/^[A-E\d\)\.][\.\)]\s*(.+)/i);
        const answerMatch = line.match(/^(?:Answer|Ans|Correct)[\:\s]+([A-E\d])/i);

        if (optionMatch) {
          options.push({
            id: `opt-${options.length}`,
            text: optionMatch[1],
          });
        } else if (answerMatch) {
          answerLine = answerMatch[1].toUpperCase();
        }
      });

      if (options.length >= 2 && answerLine) {
        const answerIdx = answerLine.charCodeAt(0) - 65; // A=0, B=1, etc.
        if (answerIdx >= 0 && answerIdx < options.length) {
          questions.push({
            prompt,
            mode: 'single',
            options,
            correctAnswers: [options[answerIdx].id],
            points: 10,
          });
        }
      }
    });

    if (questions.length === 0) {
      throw new Error('No valid questions found. Check document format.');
    }

    return questions;
  }

  private normalizeAnswerId(
    answer: string | number,
    options: Array<{ id: string; text: string }>
  ): string {
    const str = String(answer).trim();

    // If it's already an option ID
    if (options.some(o => o.id === str)) return str;

    // If it's a number (0-based or 1-based index)
    const num = parseInt(str, 10);
    if (!isNaN(num)) {
      const idx = num < 5 ? num : num - 1; // Handle both 0-based and 1-based
      if (idx >= 0 && idx < options.length) return options[idx].id;
    }

    // If it's a letter (A, B, C, etc.)
    const letterIdx = str.charCodeAt(0) - 65;
    if (letterIdx >= 0 && letterIdx < options.length) {
      return options[letterIdx].id;
    }

    throw new Error(`Cannot resolve answer "${answer}" to any option`);
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  private readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  validateQuestions(questions: ImportedQuestion[]): string[] {
    const errors: string[] = [];

    questions.forEach((q, idx) => {
      if (!q.prompt?.trim()) {
        errors.push(`Q${idx + 1}: Missing question text`);
      }
      if (!q.options || q.options.length < 2) {
        errors.push(`Q${idx + 1}: Must have at least 2 options`);
      }
      if (!q.correctAnswers || q.correctAnswers.length === 0) {
        errors.push(`Q${idx + 1}: Must have at least 1 correct answer`);
      }
    });

    return errors;
  }
}
