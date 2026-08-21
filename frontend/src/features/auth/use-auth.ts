'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { get, post, tokens, logout } from '@/lib/api';

export interface Me {
  id: string; userCode: string; email: string; firstName: string; lastName: string | null;
  status: string; affiliateMode: string; walletAddress: string | null;
  totalInvested: string; totalEarned: string; directCount: number;
  emailVerifiedAt: string | null; twoFactorEnabled: boolean;
  rank: { code: string; name: string } | null;
}

interface Tokens { accessToken: string; refreshToken: string }

/**
 * Sign-in has two possible outcomes now.
 *
 * With two-factor off it returns a session. With it on it returns a challenge
 * token and no session at all — the password alone is not enough, so there is
 * deliberately nothing here to store.
 */
export type AuthPayload =
  | { twoFactorRequired: false; user: Me; tokens: Tokens }
  | { twoFactorRequired: true; challengeToken: string; user: null; tokens: null };

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => get<Me>('/auth/me'), retry: false });

function useLand() {
  const router = useRouter();
  const qc = useQueryClient();
  return (d: AuthPayload) => {
    if (d.twoFactorRequired) return;
    tokens.set(d.tokens.accessToken, d.tokens.refreshToken);
    qc.setQueryData(['me'], d.user);
    router.push('/dashboard');
  };
}

export function useLogin(onChallenge?: (challengeToken: string) => void) {
  const land = useLand();
  return useMutation({
    mutationFn: (body: { emailOrCode: string; password: string }) => post<AuthPayload>('/auth/login', body),
    onSuccess: (d) => {
      if (d.twoFactorRequired) return onChallenge?.(d.challengeToken);
      land(d);
    },
  });
}

/** The second step, when two-factor is on. */
export function useTwoFactorChallenge() {
  const land = useLand();
  return useMutation({
    mutationFn: (body: { challengeToken: string; code: string }) =>
      post<AuthPayload>('/auth/2fa/challenge', body),
    onSuccess: land,
  });
}

export function useRegister() {
  const router = useRouter();
  return useMutation({
    mutationFn: (body: Record<string, string>) => post<AuthPayload>('/auth/register', body),
    onSuccess: (d) => {
      if (d.twoFactorRequired) return;
      tokens.set(d.tokens.accessToken, d.tokens.refreshToken);
      router.push('/dashboard');
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const qc = useQueryClient();
  return async () => { await logout(); qc.clear(); router.push('/login'); };
}
