import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SafeStorageService } from '../services/safe-storage';

interface ConsentState {
  necessary: boolean;
  preferences: boolean;
  statistics: boolean;
  marketing: boolean;
}

@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cookie-consent.html',
  styleUrls: ['./cookie-consent.css'],
})
export class CookieConsentComponent implements OnInit {
  private readonly storage = inject(SafeStorageService);

  visible = false;
  showDetails = false;

  consent: ConsentState = {
    necessary: true,
    preferences: false,
    statistics: false,
    marketing: false,
  };

  ngOnInit(): void {
    if (!this.storage.getItem('cookie_consent')) {
      this.visible = true;
    }
  }

  toggleDetails(): void {
    this.showDetails = !this.showDetails;
  }

  acceptSelected(): void {
    this.save(this.consent);
  }

  acceptAll(): void {
    this.save({ necessary: true, preferences: true, statistics: true, marketing: true });
  }

  private save(state: ConsentState): void {
    this.storage.setItem('cookie_consent', JSON.stringify({ ...state, timestamp: Date.now() }));
    this.visible = false;
  }
}
