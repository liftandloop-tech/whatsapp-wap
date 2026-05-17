import { OnboardingState } from './onboarding-state.enum';

export const AllowedTransitions: Record<OnboardingState, OnboardingState[]> = {
  [OnboardingState.INIT]: [OnboardingState.ATTACHED],
  [OnboardingState.ATTACHED]: [OnboardingState.OTP_SENT],
  [OnboardingState.OTP_SENT]: [
    OnboardingState.VERIFIED,
    OnboardingState.FAILED_TEMP,
  ],
  [OnboardingState.VERIFIED]: [OnboardingState.REGISTERED_PENDING],
  [OnboardingState.REGISTERED_PENDING]: [
    OnboardingState.LIVE,
    OnboardingState.FAILED_TEMP,
  ],
  [OnboardingState.LIVE]: [],
  [OnboardingState.FAILED_TEMP]: [
    OnboardingState.OTP_SENT,
    OnboardingState.VERIFIED,
  ],
  [OnboardingState.FAILED_PERMANENT]: [],
};
