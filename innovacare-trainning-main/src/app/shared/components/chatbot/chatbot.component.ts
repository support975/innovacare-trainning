import {
  Component,
  inject,
  signal,
  viewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ChatbotService, QUICK_ACTIONS, QuizQuestion } from '../../services/chatbot.service';
import { AllAnsweredPipe } from '../../pipes/all-answered.pipe';

@Component({
  selector: 'app-chatbot',
  standalone: true,
  imports: [CommonModule, FormsModule, AllAnsweredPipe],
  templateUrl: './chatbot.component.html',
  styleUrls: ['./chatbot.component.css'],
})
export class ChatbotComponent {
  protected chatbot = inject(ChatbotService);
  private sanitizer = inject(DomSanitizer);
  protected input = signal('');
  protected quickActions = QUICK_ACTIONS;

  private messagesEnd = viewChild<ElementRef>('messagesEnd');

  constructor() {
    effect(() => {
      const _ = this.chatbot.messages();
      setTimeout(() => this.scrollToBottom(), 50);
    });
  }

  protected send() {
    const text = this.input().trim();
    if (!text || this.chatbot.loading()) return;
    this.input.set('');
    this.chatbot.sendMessage(text);
  }

  protected onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  protected clearChat() {
    this.chatbot.clearHistory();
  }

  protected sendQuickAction(message: string) {
    this.chatbot.sendMessage(message);
  }

  protected selectAnswer(
    messageIndex: number,
    questionIndex: number,
    optionIndex: number
  ) {
    this.chatbot.answerQuiz(messageIndex, questionIndex, optionIndex);
  }

  protected isCorrectAnswer(q: QuizQuestion, optionIndex: number): boolean {
    return q.answered === true && optionIndex === q.correctIndex;
  }

  protected isWrongAnswer(q: QuizQuestion, optionIndex: number): boolean {
    return q.answered === true && optionIndex === q.selectedIndex && optionIndex !== q.correctIndex;
  }

  protected trackByIndex(index: number) {
    return index;
  }

  /** Converts newlines and simple markdown to sanitized HTML for rendering */
  protected formatContent(content: string): SafeHtml {
    if (!content) return this.sanitizer.bypassSecurityTrustHtml('');
    const html = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private scrollToBottom() {
    try {
      this.messagesEnd()?.nativeElement?.scrollIntoView({ behavior: 'smooth' });
    } catch {}
  }
}
