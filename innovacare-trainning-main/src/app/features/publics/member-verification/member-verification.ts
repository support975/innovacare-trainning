import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MemberVerificationService, VerifyMembershipResponse } from './member-verification.service';

import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
@Component({
  selector: 'app-member-verification',
  standalone: true,
  imports: [CommonModule, FormsModule, ToDatePipe],
  templateUrl: './member-verification.html',
  styleUrl: './member-verification.css',
})
export class MemberVerificationComponent {
  private readonly verificationSvc = inject(MemberVerificationService);

  membershipNumber = '';
  searching = signal(false);
  searched = signal(false);
  error = signal<string | null>(null);
  result = signal<VerifyMembershipResponse | null>(null);

  async search() {
    const number = this.membershipNumber.trim();
    if (!number) return;

    this.searching.set(true);
    this.error.set(null);
    this.result.set(null);

    try {
      const response = await this.verificationSvc.verify(number);
      this.result.set(response);
      this.searched.set(true);
    } catch (err: any) {
      this.error.set(err?.message || 'Unable to verify this membership number right now.');
    } finally {
      this.searching.set(false);
    }
  }

  reset() {
    this.membershipNumber = '';
    this.result.set(null);
    this.searched.set(false);
    this.error.set(null);
  }
}
