import { useState } from 'react';
import { ArrowLeft, ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';

export default function AuthPage({ mode }) {
  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';
  const { signIn, signUp, sendPasswordReset, completePasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault(); setError(''); setMessage(''); setLoading(true);
    try {
      if (isReset) {
        await completePasswordReset(password);
        setPassword('');
        setMessage('Your password has been updated. You can now sign in with the new password.');
      } else if (isSignup) {
        const result = await signUp(fullName.trim(), email.trim(), password);
        setMessage(result.confirmationRequired ? 'Check your email to confirm your account. Your customer profile will be ready after confirmation.' : 'Your customer account is ready.');
        if (!result.confirmationRequired) navigate('/portal', { replace: true });
      } else {
        const profile = await signIn(email.trim(), password);
        navigate(profile.role === 'CUSTOMER' ? '/portal' : location.state?.from || '/dashboard', { replace: true });
      }
    } catch (submitError) {
      setError(submitError.message || 'We could not complete that request. Please try again.');
    } finally { setLoading(false); }
  }

  async function handleReset() {
    setError(''); setMessage('');
    if (!email.trim()) { setError('Enter your email address first.'); return; }
    setLoading(true);
    try { await sendPasswordReset(email.trim()); setMessage('If that account exists, a password reset link is on its way.'); }
    catch (resetError) { setError(resetError.message || 'Password reset could not be started.'); }
    finally { setLoading(false); }
  }

  return (
    <main className="auth-page">
      <div className="auth-backdrop auth-backdrop--one" /><div className="auth-backdrop auth-backdrop--two" />
      <Link className="auth-home" to="/"><ArrowLeft size={15} /> Back to Brightloop</Link>
      <div className="auth-layout">
        <section className="auth-story"><Link className="landing-brand" to="/"><span className="brand-mark">B</span><span>Brightloop<span className="brand-period">.</span></span></Link><span className="section-kicker">SUBSCRIPTION OPERATIONS, IN FOCUS</span><h1>{isReset ? 'Set a new password.' : isSignup ? 'Start with a clearer view.' : 'Welcome back to your workspace.'}</h1><p>{isReset ? 'Choose a new password for your Brightloop account.' : isSignup ? 'Create a customer account to securely access your own subscriptions, invoices, and payment history.' : 'Sign in to continue managing and understanding your subscription activity.'}</p><div className="auth-assurance"><ShieldCheck size={17} /><span>Account access is protected by your Brightloop role.</span></div><div className="auth-story-art"><div className="story-ring story-ring--one" /><div className="story-ring story-ring--two" /><div className="story-core">B</div><span className="story-node story-node--one" /><span className="story-node story-node--two" /><span className="story-node story-node--three" /></div></section>
        <section className="auth-card"><div className="auth-card-head"><span className="section-kicker">{isReset ? 'ACCOUNT SECURITY' : isSignup ? 'CUSTOMER ACCOUNT' : 'SECURE WORKSPACE ACCESS'}</span><h2>{isReset ? 'Choose a new password' : isSignup ? 'Create your account' : 'Sign in'}</h2><p>{isReset ? 'Use a unique password you do not use elsewhere.' : isSignup ? 'Self-registration creates a customer account only.' : 'Admin, staff, and customer accounts use the same sign-in.'}</p></div>
          <form onSubmit={handleSubmit} className="auth-form">
            {isSignup && <label>Full name<input autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={160} placeholder="Your name" /></label>}
            {!isReset && <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" /></label>}
            <label>Password<div className="password-input"><input type={showPassword ? 'text' : 'password'} autoComplete={isSignup || isReset ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required placeholder={isSignup || isReset ? 'At least 8 characters' : 'Your password'} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
            {!isSignup && !isReset && <button className="auth-forgot" type="button" onClick={handleReset} disabled={loading}>Send password reset link</button>}
            {error && <p className="form-alert form-alert--error" role="alert">{error}</p>}{message && <p className="form-alert form-alert--success" role="status">{message}</p>}
            <button className="button button--primary auth-submit" type="submit" disabled={loading}>{loading ? 'Please wait…' : isReset ? 'Update password' : isSignup ? 'Create customer account' : 'Sign in'} {!loading && <ArrowRight size={16} />}</button>
          </form>
          <div className="auth-switch">{isReset ? <Link to="/login">Return to sign in</Link> : isSignup ? <>Already have an account? <Link to="/login">Sign in</Link></> : <>New to Brightloop? <Link to="/signup">Create a customer account</Link></>}</div>
          {isSignup && <p className="auth-role-note">Staff accounts are provisioned by an administrator. Public signup cannot choose an account role.</p>}
        </section>
      </div>
      <div className="auth-footer"><span>Brightloop</span><span>Protected by Supabase Auth and database access policies.</span></div>
    </main>
  );
}
