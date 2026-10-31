import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { AuthContext } from './authContext.js';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const requestId = useRef(0);

  const loadProfile = useCallback(async (nextSession) => {
    const currentRequest = ++requestId.current;
    setSession(nextSession);
    setProfileError('');
    if (!nextSession?.user) {
      setProfile(null);
      setAuthLoading(false);
      return null;
    }

    setAuthLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id,full_name,role,is_active')
      .eq('id', nextSession.user.id)
      .maybeSingle();

    if (currentRequest !== requestId.current) return null;
    if (error || !data || data.is_active !== true) {
      setProfile(null);
      setProfileError(error?.message || 'This account is inactive or has no Brightloop profile. Contact your administrator.');
      setAuthLoading(false);
      return null;
    }
    setProfile(data);
    setAuthLoading(false);
    return data;
  }, []);

  useEffect(() => {
    let mounted = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_IN') { setSession(nextSession); return; }
      setTimeout(() => {
        if (mounted) void loadProfile(nextSession);
      }, 0);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const actualProfile = await loadProfile(data.session);
    if (!actualProfile) {
      await supabase.auth.signOut();
      throw new Error('Your account could not be verified or is inactive. Contact your administrator.');
    }
    return actualProfile;
  }, [loadProfile]);

  const signUp = useCallback(async (fullName, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (error) throw error;
    if (data.session) await loadProfile(data.session);
    return { confirmationRequired: !data.session };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    await loadProfile(null);
  }, [loadProfile]);

  const completePasswordReset = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) throw signOutError;
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }, []);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, authLoading, profileError, signIn, signUp, signOut, sendPasswordReset, completePasswordReset, refreshProfile: loadProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

