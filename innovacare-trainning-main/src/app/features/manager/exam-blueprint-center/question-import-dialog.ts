import { Component, inject, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuestionImporterService, ImportedQuestion } from '../../../data/question-importer.service';

@Component({
  selector: 'app-question-import-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="import-dialog-overlay" (click)="closeDialog()">
      <div class="import-dialog" (click)="$event.stopPropagation()">
        <div class="dialog-header">
          <h2>Import Questions</h2>
          <button class="close-btn" (click)="closeDialog()">✕</button>
        </div>

        <div class="dialog-content">
          <!-- Step 1: File Upload -->
          <div *ngIf="!importedQuestions()" class="import-step">
            <h3>Choose Import Format</h3>

            <div class="format-options">
              <button
                class="format-btn"
                (click)="triggerFileInput('json')"
                [disabled]="importing()">
                <span class="format-icon">📋</span>
                <span class="format-label">JSON</span>
                <span class="format-desc">Structured question data</span>
              </button>

              <button
                class="format-btn"
                (click)="triggerFileInput('docx')"
                [disabled]="importing()">
                <span class="format-icon">📄</span>
                <span class="format-label">Word (DOCX)</span>
                <span class="format-desc">Import from Word document</span>
              </button>

              <button
                class="format-btn"
                (click)="triggerFileInput('pdf')"
                [disabled]="importing()">
                <span class="format-icon">📑</span>
                <span class="format-label">PDF</span>
                <span class="format-desc">Extract from PDF files</span>
              </button>
            </div>

            <!-- Drag & Drop Area -->
            <div
              class="drag-drop-area"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)"
              [class.dragover]="dragOver()">
              <p class="drag-text">Or drag & drop your file here</p>
              <p class="drag-hint">JSON, DOCX, or PDF files supported</p>
            </div>

            <!-- Error Message -->
            <div class="error-message" *ngIf="error()">
              <span class="error-icon">⚠️</span>
              {{ error() }}
            </div>

            <!-- File Input -->
            <input
              #fileInput
              type="file"
              [accept]="fileAccept"
              style="display: none"
              (change)="onFileSelected($event)" />
          </div>

          <!-- Step 2: Preview & Validation -->
          <div *ngIf="importedQuestions() && !confirmImport()" class="import-step">
            <h3>Preview Questions ({{ importedQuestions()?.length }})</h3>

            <div class="validation-result" *ngIf="validationErrors().length > 0">
              <div class="error-list">
                <div class="error-item" *ngFor="let err of validationErrors()">
                  <span class="error-icon">✕</span>
                  {{ err }}
                </div>
              </div>
            </div>

            <div class="questions-preview">
              <div
                *ngFor="let q of importedQuestions(); let i = index"
                class="preview-question">
                <div class="preview-header">
                  <span class="question-number">Q{{ i + 1 }}</span>
                  <span class="question-mode" [class]="'mode-' + q.mode">
                    {{ q.mode }}
                  </span>
                </div>

                <p class="preview-prompt">{{ q.prompt }}</p>

                <div class="preview-options">
                  <div
                    *ngFor="let opt of q.options"
                    class="preview-option"
                    [class.correct]="q.correctAnswers.includes(opt.id)">
                    <span class="option-check">
                      {{ q.correctAnswers.includes(opt.id) ? '✓' : '○' }}
                    </span>
                    <span class="option-text">{{ opt.text }}</span>
                  </div>
                </div>

                <div class="preview-meta">
                  <span class="points">{{ q.points || 10 }} pts</span>
                  <span *ngIf="q.explanation" class="has-explanation">
                    Has explanation
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 3: Confirm Import -->
          <div *ngIf="confirmImport()" class="import-step">
            <h3 class="success-title">✓ Import Ready</h3>
            <p class="success-text">
              {{ importedQuestions()?.length }} question(s) are ready to be imported
            </p>
            <div class="import-summary">
              <div class="summary-item">
                <span class="label">Total Questions:</span>
                <span class="value">{{ importedQuestions()?.length }}</span>
              </div>
              <div class="summary-item">
                <span class="label">Valid Questions:</span>
                <span class="value">{{ (importedQuestions()?.length || 0) - validationErrors().length }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Dialog Footer -->
        <div class="dialog-footer">
          <button
            class="btn btn-secondary"
            (click)="resetImport()"
            [disabled]="importing()">
            {{ importedQuestions() ? 'Back' : 'Cancel' }}
          </button>

          <button
            *ngIf="importedQuestions() && !confirmImport()"
            class="btn btn-success"
            (click)="confirmImport.set(true)"
            [disabled]="validationErrors().length > 0 || importing()">
            Review & Import
          </button>

          <button
            *ngIf="confirmImport()"
            class="btn btn-primary"
            (click)="importQuestions()"
            [disabled]="importing()">
            {{ importing() ? 'Importing...' : 'Import Questions' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .import-dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .import-dialog {
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 600px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .dialog-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }

    .dialog-header h2 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #1f2937;
      margin: 0;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #9ca3af;
      transition: color 0.3s;
    }

    .close-btn:hover {
      color: #1f2937;
    }

    .dialog-content {
      flex: 1;
      overflow-y: auto;
      padding: 2rem;
    }

    .import-step h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 1.5rem 0;
    }

    /* Format Selection */
    .format-options {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 1rem;
      margin-bottom: 2rem;
    }

    .format-btn {
      padding: 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      transition: all 0.3s;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
      text-align: center;
    }

    .format-btn:hover:not(:disabled) {
      border-color: #667eea;
      background: #f0f4ff;
      transform: translateY(-2px);
    }

    .format-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .format-icon {
      font-size: 2rem;
    }

    .format-label {
      font-weight: 600;
      color: #1f2937;
      font-size: 0.95rem;
    }

    .format-desc {
      font-size: 0.85rem;
      color: #9ca3af;
    }

    /* Drag & Drop */
    .drag-drop-area {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
      background: #f9fafb;
    }

    .drag-drop-area:hover {
      border-color: #667eea;
      background: #f0f4ff;
    }

    .drag-drop-area.dragover {
      border-color: #667eea;
      background: #dbeafe;
      transform: scale(1.02);
    }

    .drag-text {
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 0.5rem 0;
    }

    .drag-hint {
      font-size: 0.9rem;
      color: #9ca3af;
      margin: 0;
    }

    /* Messages */
    .error-message {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 1rem;
      background: #fee2e2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      color: #991b1b;
      margin-top: 1rem;
    }

    .error-icon {
      font-size: 1.25rem;
    }

    .validation-result {
      margin-bottom: 1.5rem;
      padding: 1rem;
      background: #fee2e2;
      border: 1px solid #fecaca;
      border-radius: 8px;
    }

    .error-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .error-item {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #991b1b;
      font-size: 0.9rem;
    }

    /* Preview */
    .questions-preview {
      display: flex;
      flex-direction: column;
      gap: 1rem;
      max-height: 400px;
      overflow-y: auto;
    }

    .preview-question {
      padding: 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      background: #f9fafb;
    }

    .preview-header {
      display: flex;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }

    .question-number {
      padding: 0.25rem 0.75rem;
      background: #667eea;
      color: white;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .question-mode {
      padding: 0.25rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      text-transform: uppercase;
    }

    .mode-single {
      background: #dbeafe;
      color: #1e40af;
    }

    .mode-multi {
      background: #fce7f3;
      color: #9f1239;
    }

    .preview-prompt {
      font-weight: 600;
      color: #1f2937;
      margin: 0 0 0.75rem 0;
      font-size: 0.95rem;
    }

    .preview-options {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .preview-option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      border-radius: 6px;
      background: white;
      font-size: 0.9rem;
      color: #6b7280;
    }

    .preview-option.correct {
      background: #dcfce7;
      color: #166534;
    }

    .option-check {
      font-size: 0.85rem;
      font-weight: 700;
      min-width: 20px;
    }

    .preview-meta {
      display: flex;
      gap: 0.75rem;
      font-size: 0.8rem;
    }

    .points {
      padding: 0.25rem 0.5rem;
      background: white;
      color: #667eea;
      border-radius: 4px;
      font-weight: 500;
    }

    .has-explanation {
      padding: 0.25rem 0.5rem;
      background: white;
      color: #9ca3af;
      border-radius: 4px;
    }

    /* Success State */
    .success-title {
      color: #10b981;
    }

    .success-text {
      color: #059669;
      margin-bottom: 1.5rem;
    }

    .import-summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      padding: 1.5rem;
      background: #dcfce7;
      border-radius: 8px;
    }

    .summary-item {
      display: flex;
      justify-content: space-between;
      color: #166534;
    }

    .summary-item .label {
      font-weight: 500;
    }

    .summary-item .value {
      font-weight: 700;
    }

    /* Footer */
    .dialog-footer {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      padding: 1.5rem;
      border-top: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    /* Buttons */
    .btn {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 500;
      transition: all 0.3s;
    }

    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 16px rgba(102, 126, 234, 0.3);
    }

    .btn-secondary {
      background: white;
      color: #667eea;
      border: 2px solid #667eea;
    }

    .btn-secondary:hover:not(:disabled) {
      background: #f0f4ff;
    }

    .btn-success {
      background: #10b981;
      color: white;
    }

    .btn-success:hover:not(:disabled) {
      background: #059669;
    }

    @media (max-width: 768px) {
      .import-dialog {
        width: 95%;
        max-height: 95vh;
      }

      .format-options {
        grid-template-columns: 1fr;
      }

      .dialog-footer {
        flex-direction: column;
      }

      .btn {
        width: 100%;
      }
    }
  `],
})
export class QuestionImportDialogComponent {
  private importer = inject(QuestionImporterService);

  importing = signal(false);
  dragOver = signal(false);
  error = signal<string | null>(null);
  fileAccept = '';

  importedQuestions = signal<ImportedQuestion[] | null>(null);
  validationErrors = signal<string[]>([]);
  confirmImport = signal(false);

  closeClicked = output<void>();
  questionsImported = output<ImportedQuestion[]>();

  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  triggerFileInput(type: 'json' | 'docx' | 'pdf') {
    this.fileAccept = type === 'json' ? '.json' : type === 'docx' ? '.docx' : '.pdf';
    (document.querySelector('input[type="file"]') as HTMLInputElement)?.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  private async handleFile(file: File) {
    try {
      this.importing.set(true);
      this.error.set(null);

      let questions: ImportedQuestion[];
      const ext = file.name.toLowerCase().split('.').pop();

      if (ext === 'json') {
        questions = await this.importer.importFromJson(file);
      } else if (ext === 'docx') {
        questions = await this.importer.importFromWord(file);
      } else if (ext === 'pdf') {
        questions = await this.importer.importFromPdf(file);
      } else {
        throw new Error('Unsupported file type. Use JSON, DOCX, or PDF.');
      }

      const errors = this.importer.validateQuestions(questions);
      this.validationErrors.set(errors);
      this.importedQuestions.set(questions);
      this.confirmImport.set(errors.length === 0);
    } catch (err: any) {
      this.error.set(err?.message || 'Failed to import file');
    } finally {
      this.importing.set(false);
    }
  }

  resetImport() {
    this.importedQuestions.set(null);
    this.validationErrors.set([]);
    this.confirmImport.set(false);
    this.error.set(null);
  }

  closeDialog() {
    this.closeClicked.emit();
  }

  importQuestions() {
    if (this.importedQuestions()) {
      this.questionsImported.emit(this.importedQuestions()!);
      this.closeDialog();
    }
  }
}
