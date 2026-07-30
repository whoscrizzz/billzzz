export type AuthStep = 'access' | 'verify' | 'passkey' | 'push' | 'onboarding';

/** passkey/push/onboarding son parte del mismo tercer tramo ("primer uso"). */
const STEP_BAR: Record<AuthStep, number> = {
  access: 0,
  verify: 1,
  passkey: 2,
  push: 2,
  onboarding: 2,
};

export function AuthStepIndicator({ step }: { step: AuthStep }) {
  const active = STEP_BAR[step];
  return (
    <div className="auth-step-indicator" aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`auth-step-bar ${i === active ? 'active' : ''}`} />
      ))}
    </div>
  );
}
