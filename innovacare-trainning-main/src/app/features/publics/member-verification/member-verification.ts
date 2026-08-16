import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MemberVerificationService, VerifyMembershipResponse } from './member-verification.service';

import { ToDatePipe } from '../../../shared/pipes/to-date.pipe';
import { PublicTranslateDirective } from '../../../shared/directives/public-translate.directive';
@Component({
  selector: 'app-member-verification',
  standalone: true,
  imports: [CommonModule, FormsModule, ToDatePipe, PublicTranslateDirective],
  templateUrl: './member-verification.html',
  styleUrl: './member-verification.css',
})
export class MemberVerificationComponent implements OnInit {
  private readonly verificationSvc = inject(MemberVerificationService);
  private readonly route = inject(ActivatedRoute);

  membershipNumber = '';
  searching = signal(false);
  searched = signal(false);
  error = signal<string | null>(null);
  result = signal<VerifyMembershipResponse | null>(null);

  ngOnInit(): void {
    const fromRoute = this.route.snapshot.paramMap.get('memberNumber');
    if (fromRoute) {
      this.membershipNumber = fromRoute;
      void this.search();
    }
  }

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
      this.error.set(err?.message || "Impossible de vérifier ce numéro de membre pour le moment.");
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
