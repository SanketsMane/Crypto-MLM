import type { Request, Response } from 'express';
import { z } from 'zod';
import * as service from './contact.service.js';

const schema = z.object({
  name: z.string().min(2).max(80),
  email: z.email().max(160),
  phone: z.string().max(40).optional().or(z.literal('')),
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(4000),
  /* A field a human never sees and never fills. Bots fill every input they
     find, so a value here is the cheapest possible spam signal. */
  website: z.string().max(200).optional(),
});

export const submit = async (req: Request, res: Response) => {
  const body = schema.parse(req.body);

  // Answer the bot exactly as we answer a person, so it learns nothing.
  if (body.website) return res.status(201).json({ success: true, data: { received: true } });

  await service.submit(
    { name: body.name, email: body.email, phone: body.phone || undefined, subject: body.subject, message: body.message },
    req,
  );
  res.status(201).json({ success: true, data: { received: true } });
};
