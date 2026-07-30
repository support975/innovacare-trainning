import { Pipe, PipeTransform } from '@angular/core';
import { QuizQuestion } from '../services/chatbot.service';

/** Returns true when every question in a quiz has been answered */
@Pipe({ name: 'allAnswered', standalone: true, pure: true })
export class AllAnsweredPipe implements PipeTransform {
  transform(questions: QuizQuestion[] | null | undefined): boolean {
    if (!questions || questions.length === 0) return false;
    return questions.every((q) => q.answered === true);
  }
}
