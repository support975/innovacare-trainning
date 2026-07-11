import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  notice  = signal('');
  isError = signal(false);
  saved   = signal(false);

  general = { platformName: 'Innovacare Training', supportEmail: 'support@innovacare.com', defaultLanguage: 'en' };
  security = { sessionTimeoutMin: 60, mfaRequired: false, passwordMinLength: 8 };
  notifications = { emailOnEnrollment: true, emailOnCompletion: true, emailOnOverdue: true };

  save() {
    this.saved.set(true);
    this.notice.set('Settings saved successfully.');
    this.isError.set(false);
    setTimeout(() => this.saved.set(false), 3000);
  }

  clearNotice() { this.notice.set(''); }
}
