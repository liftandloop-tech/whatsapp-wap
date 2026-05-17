import { OnboardingState } from '../onboarding-state.enum';

export enum ErrorType {
  RETRYABLE = 'RETRYABLE',
  NON_RETRYABLE = 'NON_RETRYABLE',
  REQUIRES_USER_ACTION = 'REQUIRES_USER_ACTION',
}

export class OnboardingError extends Error {
  constructor(
    message: string,
    public type: ErrorType = ErrorType.NON_RETRYABLE,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class OnboardingIncompleteError extends OnboardingError {
  constructor(state: OnboardingState, nextStep: string) {
    super(
      `Onboarding incomplete. Current state: ${state}. Required step: ${nextStep}`,
      ErrorType.REQUIRES_USER_ACTION,
    );
  }
}

export class InvalidStateTransitionError extends OnboardingError {
  constructor(from: OnboardingState, to: OnboardingState) {
    super(`Invalid state transition: ${from} → ${to}`, ErrorType.NON_RETRYABLE);
  }
}
