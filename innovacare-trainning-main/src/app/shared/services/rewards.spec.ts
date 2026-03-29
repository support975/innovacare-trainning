import { TestBed } from '@angular/core/testing';

import { Rewards } from './rewards';

describe('Rewards', () => {
  let service: Rewards;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Rewards);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
