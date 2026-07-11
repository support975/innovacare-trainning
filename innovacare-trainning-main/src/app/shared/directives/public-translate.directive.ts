import {
  AfterViewInit,
  Directive,
  EffectRef,
  ElementRef,
  OnDestroy,
  effect,
  inject,
} from '@angular/core';
import { LanguageService } from '../services/language';

@Directive({
  selector: '[appPublicTranslate]',
  standalone: true,
})
export class PublicTranslateDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly language = inject(LanguageService);
  private readonly originalText = new WeakMap<Text, string>();
  private readonly originalAttrs = new WeakMap<Element, Map<string, string>>();
  private readonly translatedAttrs = ['placeholder', 'aria-label', 'title', 'alt'];
  private readonly effectRef: EffectRef;
  private mutationObserver?: MutationObserver;
  private ready = false;
  private applying = false;

  constructor() {
    this.effectRef = effect(() => {
      const language = this.language.language();
      if (!this.ready) return;
      queueMicrotask(() => this.apply(language));
    });
  }

  ngAfterViewInit(): void {
    this.ready = true;
    this.apply(this.language.language());

    if (typeof MutationObserver !== 'undefined') {
      this.mutationObserver = new MutationObserver(() => {
        if (this.applying) return;
        queueMicrotask(() => this.apply(this.language.language()));
      });
      this.mutationObserver.observe(this.host.nativeElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: this.translatedAttrs,
      });
    }
  }

  ngOnDestroy(): void {
    this.effectRef.destroy();
    this.mutationObserver?.disconnect();
  }

  private apply(language: 'en' | 'fr'): void {
    this.applying = true;
    this.walk(this.host.nativeElement, language);
    this.applying = false;
  }

  private walk(node: Node, language: 'en' | 'fr'): void {
    if (node.nodeType === Node.TEXT_NODE) {
      this.translateTextNode(node as Text, language);
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const element = node as HTMLElement;
    if (['SCRIPT', 'STYLE', 'TEXTAREA'].includes(element.tagName)) return;

    this.translateAttributes(element, language);
    element.childNodes.forEach(child => this.walk(child, language));
  }

  private translateTextNode(node: Text, language: 'en' | 'fr'): void {
    const current = node.nodeValue ?? '';
    if (!current.trim()) return;

    if (!this.originalText.has(node)) {
      this.originalText.set(node, current);
    }

    let original = this.originalText.get(node) ?? current;
    const previousTranslation = language === 'fr' ? original : this.language.publicText(original, language);

    if (current !== original && current !== previousTranslation) {
      original = current;
      this.originalText.set(node, current);
    }

    const next = language === 'fr' ? original : this.language.publicText(original, language);
    if (node.nodeValue !== next) {
      node.nodeValue = next;
    }
  }

  private translateAttributes(element: Element, language: 'en' | 'fr'): void {
    for (const attr of this.translatedAttrs) {
      if (!element.hasAttribute(attr)) continue;

      let attrMap = this.originalAttrs.get(element);
      if (!attrMap) {
        attrMap = new Map<string, string>();
        this.originalAttrs.set(element, attrMap);
      }

      if (!attrMap.has(attr)) {
        attrMap.set(attr, element.getAttribute(attr) ?? '');
      }

      let original = attrMap.get(attr) ?? '';
      const current = element.getAttribute(attr) ?? '';
      const previousTranslation = language === 'fr' ? original : this.language.publicText(original, language);

      if (current !== original && current !== previousTranslation) {
        original = current;
        attrMap.set(attr, current);
      }

      const next = language === 'fr' ? original : this.language.publicText(original, language);
      if (element.getAttribute(attr) !== next) {
        element.setAttribute(attr, next);
      }
    }
  }
}
