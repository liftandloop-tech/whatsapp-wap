import { OnboardingState } from './onboarding-state.enum';
import { AllowedTransitions } from './onboarding-transition.map';
import { InvalidStateTransitionError } from './errors/onboarding.error';

export class OnboardingStateMachine {
  /**
   * Checks if a transition from one state to another is valid.
   * Also allows staying in the same state (idempotency).
   */
  static canTransition(from: OnboardingState, to: OnboardingState): boolean {
    if (from === to) return true;
    const allowed = AllowedTransitions[from];
    return allowed ? allowed.includes(to) : false;
  }

  /**
   * Asserts that a transition is valid, throwing an error if it isn't.
   */
  static assertTransition(from: OnboardingState, to: OnboardingState): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  }
}
