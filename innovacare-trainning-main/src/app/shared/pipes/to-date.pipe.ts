import { Pipe, PipeTransform } from '@angular/core';

/**
 * Converts Firestore Timestamps (or anything date-like) into a JS Date
 * so it can be safely piped into Angular's DatePipe without NG02100.
 */
@Pipe({ name: 'toDate', standalone: true })
export class ToDatePipe implements PipeTransform {
  transform(value: any): Date | null {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    if (typeof value === 'object' && typeof value.seconds === 'number') {
      return new Date(value.seconds * 1000);
    }
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
}
