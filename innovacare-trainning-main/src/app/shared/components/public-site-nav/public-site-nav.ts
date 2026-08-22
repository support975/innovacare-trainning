import { CommonModule } from '@angular/common';
import { Component, HostListener, Input, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Router, RouterModule } from '@angular/router';

import { DemoRequestDialog } from '../../../features/publics/demo-request-dialog/demo-request-dialog';
import { AppLanguage, LanguageService } from '../../services/language';

type PublicNavPage = 'home' | 'features' | 'industries' | 'catalogue' | 'webinars' | 'pricing' | 'ordre' | 'blog';

@Component({
  selector: 'app-public-site-nav',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header class="public-nav" [class.scrolled]="headerScrolled">
      <div class="container header-inner">
        <a class="brand" routerLink="/home" (click)="closeMobileMenu()" aria-label="Aller à l'accueil Innovacare Training">
          <img class="brand-mark brand-mark--logo" src="/logo.png" alt="Innovacare Training" />
          <span class="brand-copy">
            <span>Innovacare</span>
            <strong>Training</strong>
          </span>
        </a>

        <div class="compact-actions">
          <button class="nav-cta nav-cta--ghost nav-cta--compact" type="button" (click)="login()">
            {{ t('public.nav.login') }}
          </button>

          <button
            class="menu-toggle"
            [class.open]="mobileMenuOpen"
            type="button"
            (click)="toggleMobileMenu()"
            [attr.aria-expanded]="mobileMenuOpen"
            aria-label="Ouvrir le menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        <div class="nav-context desktop-only" aria-label="Résumé de la page">
            <span class="nav-context__label">{{ publicText(contextLabel) }}</span>
            <strong>{{ publicText(contextValue) }}</strong>
        </div>

        <nav class="nav" [class.open]="mobileMenuOpen" aria-label="Navigation publique">
          <a routerLink="/home" [class.is-active]="isActive('home')" (click)="closeMobileMenu()">{{ t('public.nav.home') }}</a>
          <a routerLink="/fonctionnalites" [class.is-active]="isActive('solutions')" (click)="closeMobileMenu()">{{ t('public.nav.solutions') }}</a>
          <a routerLink="/industries" [class.is-active]="isActive('industries')" (click)="closeMobileMenu()">{{ t('public.nav.industries') }}</a>
          <a routerLink="/catalogue" [class.is-active]="isActive('catalogue')" (click)="closeMobileMenu()">{{ t('public.nav.catalogue') }}</a>
          <a routerLink="/webinars" [class.is-active]="isActive('webinars')" (click)="closeMobileMenu()">{{ t('public.nav.webinars') }}</a>
          <a routerLink="/pricing" [class.is-active]="isActive('pricing')" (click)="closeMobileMenu()">{{ t('public.nav.pricing') }}</a>
          <a routerLink="/ordre-professionnel" [class.is-active]="isActive('ordre')" (click)="closeMobileMenu()">{{ t('public.nav.ordre') }}</a>
          <a routerLink="/blog" [class.is-active]="isActive('blog')" (click)="closeMobileMenu()">{{ t('public.nav.blog') }}</a>
          <a [routerLink]="['/home']" fragment="faq" [class.is-active]="isActive('faq')" (click)="closeMobileMenu()">{{ t('public.nav.faq') }}</a>

          <div class="nav-mobile-meta mobile-only">
            <span>{{ publicText(mobileMetaLabel) }}</span>
            <strong>{{ publicText(mobileMetaValue) }}</strong>
          </div>

          <div class="language-switch language-switch--mobile mobile-only" role="group" [attr.aria-label]="t('public.nav.language')">
            <button type="button" [class.active]="languageCode() === 'en'" (click)="setLanguage('en')">
              {{ t('language.english') }}
            </button>
            <button type="button" [class.active]="languageCode() === 'fr'" (click)="setLanguage('fr')">
              {{ t('language.french') }}
            </button>
          </div>

          <button class="nav-cta nav-cta--accent mobile-only" type="button" (click)="openDemoDialog()">
            {{ t('public.nav.demo') }}
          </button>
        </nav>

        <div class="nav-actions desktop-only">
          <div class="language-switch" role="group" [attr.aria-label]="t('public.nav.language')">
            <button
              type="button"
              [class.active]="languageCode() === 'en'"
              (click)="setLanguage('en')"
            >
              {{ t('language.english') }}
            </button>
            <button
              type="button"
              [class.active]="languageCode() === 'fr'"
              (click)="setLanguage('fr')"
            >
              {{ t('language.french') }}
            </button>
          </div>
          <button class="nav-cta nav-cta--ghost" type="button" (click)="login()">
            {{ t('public.nav.login') }}
          </button>
          <button class="nav-cta nav-cta--accent" type="button" (click)="openDemoDialog()">
            {{ t('public.nav.demo') }}
          </button>
        </div>
      </div>
    </header>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      * {
        box-sizing: border-box;
      }

      .public-nav {
        position: sticky;
        top: 0;
        z-index: 200;
        background: rgba(255, 255, 255, 0.94);
        border-bottom: 1px solid rgba(214, 224, 238, 0.9);
        backdrop-filter: blur(14px);
        transition: box-shadow 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.35s cubic-bezier(0.16, 1, 0.3, 1),
          border-color 0.35s ease;
      }

      .public-nav.scrolled {
        box-shadow: 0 8px 28px rgba(26, 63, 111, 0.14);
        background: rgba(255, 255, 255, 0.98);
        border-bottom-color: rgba(214, 224, 238, 0.5);
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 0 2rem;
      }

      .header-inner {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        padding: 0.8rem 0;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        color: #1a3f6f;
        text-decoration: none;
        cursor: pointer;
        letter-spacing: -0.3px;
      }

      .brand-mark {
        width: 42px;
        height: 42px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        background: linear-gradient(135deg, #0d2240 0%, #1b4f7b 100%);
        color: #ffffff;
        font-size: 0.95rem;
        letter-spacing: 0.08em;
        box-shadow: 0 10px 20px rgba(13, 34, 64, 0.2);
        transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease;
      }

      .brand:hover .brand-mark {
        transform: scale(1.06) rotate(-4deg);
        box-shadow: 0 12px 26px rgba(13, 34, 64, 0.28);
      }

      .brand-mark--logo {
        background: #ffffff;
        object-fit: contain;
        padding: 3px;
        box-shadow: 0 4px 12px rgba(13, 34, 64, 0.14);
      }

      .brand-copy {
        display: flex;
        flex-direction: column;
        line-height: 1;
      }

      .brand-copy span {
        color: #00a79d;
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .brand-copy strong {
        color: #1a3f6f;
        font-size: 1.1rem;
        font-weight: 800;
      }

      .compact-actions {
        display: none;
        align-items: center;
        gap: 0.6rem;
      }

      .menu-toggle {
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 5px;
        width: 36px;
        height: 36px;
        padding: 6px;
        background: none;
        border: none;
        cursor: pointer;
      }

      .menu-toggle span {
        width: 24px;
        height: 2px;
        background: #1a3f6f;
        border-radius: 2px;
        transform-origin: center;
        transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease, width 0.3s ease;
      }

      .menu-toggle.open span:nth-child(1) {
        transform: translateY(7px) rotate(45deg);
      }

      .menu-toggle.open span:nth-child(2) {
        opacity: 0;
        width: 0;
      }

      .menu-toggle.open span:nth-child(3) {
        transform: translateY(-7px) rotate(-45deg);
      }

      .nav-context {
        display: flex;
        flex-direction: column;
        gap: 0.12rem;
        min-width: 190px;
        padding: 0.55rem 0.9rem;
      }

      .nav-context__label {
        color: #5a6a7e;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }

      .nav-context strong {
        color: #1a3f6f;
        font-size: 0.92rem;
      }

      .nav {
        display: flex;
        align-items: center;
        gap: 0.65rem;
        margin: 0 auto;
        padding: 0.4rem;
        border: 1px solid rgba(214, 224, 238, 0.9);
        border-radius: 999px;
        background: rgba(244, 247, 251, 0.95);
      }

      .nav a {
        position: relative;
        padding: 0.7rem 1rem;
        border-radius: 999px;
        color: #1a2b4a;
        font-size: 0.92rem;
        font-weight: 600;
        text-decoration: none;
        transition: color 0.25s ease, background 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .nav a:hover {
        color: #0d2240;
        background: rgba(0, 167, 157, 0.12);
        transform: translateY(-1px);
      }

      .nav a:active {
        transform: translateY(0);
      }

      .nav a.is-active {
        color: #0d2240;
        background: rgba(0, 167, 157, 0.18);
        box-shadow: inset 0 0 0 1px rgba(0, 167, 157, 0.16);
        animation: nav-pill-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes nav-pill-in {
        from {
          transform: scale(0.94);
        }
        to {
          transform: scale(1);
        }
      }

      .nav-actions {
        display: flex;
        align-items: center;
        gap: 0.65rem;
      }

      .language-switch {
        display: grid;
        grid-template-columns: repeat(2, minmax(38px, 1fr));
        padding: 0.2rem;
        border: 1px solid rgba(26, 63, 111, 0.16);
        border-radius: 999px;
        background: #ffffff;
      }

      .language-switch button {
        min-width: 38px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: #5a6a7e;
        font-size: 0.78rem;
        font-weight: 800;
        cursor: pointer;
        padding: 0.48rem 0.55rem;
      }

      .language-switch button.active {
        background: #0d2240;
        color: #ffffff;
      }

      .language-switch--mobile {
        width: 100%;
      }

      .nav-cta {
        position: relative;
        overflow: hidden;
        padding: 0.7rem 1.15rem;
        border: 1px solid transparent;
        border-radius: 999px;
        font-size: 0.88rem;
        font-weight: 700;
        cursor: pointer;
        transition: background 0.25s ease, transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.2s,
          color 0.2s, box-shadow 0.25s ease;
        white-space: nowrap;
      }

      .nav-cta:hover {
        transform: translateY(-2px);
      }

      .nav-cta:active {
        transform: translateY(0);
      }

      .nav-cta--accent {
        background: linear-gradient(135deg, #f26b21 0%, #ff8c42 100%);
        color: #ffffff;
        box-shadow: 0 10px 20px rgba(242, 107, 33, 0.24);
      }

      .nav-cta--accent::after {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(115deg, transparent 20%, rgba(255, 255, 255, 0.45) 50%, transparent 80%);
        transform: translateX(-120%);
        transition: transform 0.6s ease;
      }

      .nav-cta--accent:hover::after {
        transform: translateX(120%);
      }

      .nav-cta--accent:hover {
        box-shadow: 0 14px 26px rgba(242, 107, 33, 0.32);
      }

      .nav-cta--ghost {
        background: #ffffff;
        color: #1a3f6f;
        border-color: rgba(26, 63, 111, 0.16);
      }

      .nav-cta--ghost:hover {
        border-color: rgba(26, 63, 111, 0.32);
        box-shadow: 0 8px 18px rgba(26, 63, 111, 0.1);
      }

      .nav-mobile-meta {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: 0.75rem 0.15rem 0.25rem;
        color: #5a6a7e;
      }

      .nav-mobile-meta span {
        font-size: 0.72rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      .nav-mobile-meta strong {
        color: #1a3f6f;
        font-size: 0.96rem;
      }

      .mobile-only {
        display: none;
      }

      .desktop-only {
        display: flex;
      }

      @media (max-width: 1850px) {
        .container {
          padding: 0 1.25rem;
        }

        .compact-actions {
          display: flex;
        }

        .header-inner {
          position: relative;
          flex-wrap: nowrap;
        }

        .nav {
          position: fixed;
          top: 72px;
          left: 1rem;
          right: 1rem;
          z-index: 199;
          max-height: 0;
          overflow: hidden;
          flex-direction: column;
          align-items: stretch;
          gap: 0.35rem;
          padding: 0;
          border-width: 0;
          border-radius: 24px;
          background: #ffffff;
          box-shadow: none;
          opacity: 0;
          pointer-events: none;
          transition: max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1), padding 0.35s ease, opacity 0.25s ease,
            box-shadow 0.25s ease;
        }

        .nav.open {
          max-height: 620px;
          padding: 1rem;
          border-width: 1px;
          box-shadow: 0 16px 40px rgba(13, 34, 64, 0.18);
          opacity: 1;
          pointer-events: auto;
        }

        .nav a {
          padding: 0.9rem 1rem;
          border-radius: 16px;
        }

        .nav.open > * {
          animation: nav-item-in 0.35s cubic-bezier(0.16, 1, 0.3, 1) backwards;
        }

        .nav.open > *:nth-child(1) { animation-delay: 0.03s; }
        .nav.open > *:nth-child(2) { animation-delay: 0.06s; }
        .nav.open > *:nth-child(3) { animation-delay: 0.09s; }
        .nav.open > *:nth-child(4) { animation-delay: 0.12s; }
        .nav.open > *:nth-child(5) { animation-delay: 0.15s; }
        .nav.open > *:nth-child(6) { animation-delay: 0.18s; }
        .nav.open > *:nth-child(7) { animation-delay: 0.21s; }
        .nav.open > *:nth-child(8) { animation-delay: 0.24s; }
        .nav.open > *:nth-child(9) { animation-delay: 0.27s; }
        .nav.open > *:nth-child(10) { animation-delay: 0.3s; }
        .nav.open > *:nth-child(11) { animation-delay: 0.33s; }
        .nav.open > *:nth-child(12) { animation-delay: 0.36s; }

        @keyframes nav-item-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .nav .language-switch {
          margin: 0.25rem 0;
        }

        .nav a.is-active {
          box-shadow: none;
        }

        .mobile-only {
          display: block;
        }

        .language-switch.mobile-only {
          display: grid;
        }

        .desktop-only {
          display: none;
        }
      }

      @media (max-width: 480px) {
        .header-inner {
          gap: 1rem;
        }

        .brand-mark {
          width: 38px;
          height: 38px;
        }

        .brand-copy strong {
          font-size: 1rem;
        }
      }
    `,
  ],
})
export class PublicSiteNavComponent {
  @Input() page: PublicNavPage = 'home';
  @Input() contextLabel = 'Navigation publique';
  @Input() contextValue = 'Découvrir Innovacare Training';
  @Input() mobileMetaLabel = 'Plateforme LMS santé';
  @Input() mobileMetaValue = 'Navigation claire entre les pages publiques';

  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly language = inject(LanguageService);

  mobileMenuOpen = false;
  headerScrolled = false;

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.headerScrolled = typeof window !== 'undefined' && window.scrollY > 10;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (typeof window !== 'undefined' && window.innerWidth > 1850 && this.mobileMenuOpen) {
      this.closeMobileMenu();
    }
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
  }

  login(): void {
    this.closeMobileMenu();
    void this.router.navigate(['/login']);
  }

  t(key: string): string {
    return this.language.t(key);
  }

  publicText(value: string | number): string {
    return this.language.publicText(String(value));
  }

  languageCode(): AppLanguage {
    return this.language.language();
  }

  setLanguage(language: AppLanguage): void {
    this.language.setLanguage(language);
  }

  openDemoDialog(): void {
    this.closeMobileMenu();
    this.dialog.open(DemoRequestDialog, {
      width: '100%',
      maxWidth: '720px',
      autoFocus: false,
      panelClass: 'demo-request-dialog-panel',
      backdropClass: 'demo-request-dialog-backdrop',
      data: {
        source: `public-nav-${this.page}`,
      },
    });
  }

  isActive(item: 'home' | 'solutions' | 'industries' | 'catalogue' | 'webinars' | 'pricing' | 'ordre' | 'blog' | 'faq'): boolean {
    const currentPath = this.currentPath();
    const currentFragment = this.currentFragment();

    switch (item) {
      case 'home':
        return currentPath === '/home' && currentFragment !== 'faq';
      case 'solutions':
        return currentPath === '/fonctionnalites';
      case 'industries':
        return currentPath === '/industries';
      case 'catalogue':
        return currentPath === '/catalogue' || currentPath.startsWith('/catalogue/');
      case 'webinars':
        return currentPath === '/webinars' || currentPath.startsWith('/webinars/');
      case 'pricing':
        return currentPath === '/pricing';
      case 'ordre':
        return currentPath === '/ordre-professionnel';
      case 'blog':
        return currentPath === '/blog' || currentPath.startsWith('/blog/');
      case 'faq':
        return currentPath === '/home' && currentFragment === 'faq';
    }
  }

  private currentPath(): string {
    return this.router.url.split('#')[0].split('?')[0] || '/';
  }

  private currentFragment(): string | null {
    return this.router.parseUrl(this.router.url).fragment ?? null;
  }
}
