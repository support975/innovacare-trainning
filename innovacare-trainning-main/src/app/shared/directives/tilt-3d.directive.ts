import { Directive, ElementRef, HostListener, Input, OnInit, inject } from '@angular/core';

/**
 * Mouse-tracked 3D tilt for cards/panels — pure CSS transform, no WebGL.
 * Disabled automatically for prefers-reduced-motion and on touch (no
 * hover) devices, where a mousemove listener would never fire anyway.
 */
@Directive({
  selector: '[appTilt3d]',
  standalone: true,
})
export class Tilt3dDirective implements OnInit {
  @Input('appTilt3d') maxDegrees = 8;
  @Input() tiltLift = 10;
  @Input() tiltScale = 1.02;

  private readonly el = inject(ElementRef<HTMLElement>);
  private enabled = true;

  ngOnInit(): void {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const noHover =
      typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;
    this.enabled = !reduceMotion && !noHover;
    this.el.nativeElement.style.transformStyle = 'preserve-3d';
    this.el.nativeElement.style.willChange = 'transform';
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.enabled) return;
    const rect = this.el.nativeElement.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    const rotateY = (px - 0.5) * 2 * this.maxDegrees;
    const rotateX = (0.5 - py) * 2 * this.maxDegrees;
    this.el.nativeElement.style.transform =
      `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-${this.tiltLift}px) scale(${this.tiltScale})`;
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    if (!this.enabled) return;
    this.el.nativeElement.style.transform =
      'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
  }
}
