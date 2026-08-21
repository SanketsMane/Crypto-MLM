import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z.string().min(2).max(70),
  lastName: z.string().max(70).optional(),
  email: z.email(),
  phone: z.string().max(20).optional(),
  password: z.string().min(8).max(128),
  sponsorCode: z.string().min(3).max(20).optional(),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Must be a valid BEP-20 address').optional(),
});

export const loginSchema = z.object({
  emailOrCode: z.string().min(3),
  password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
