import type { Request, Response } from 'express';
import { forbidden } from '../../../core/errors.js';
import * as service from './export.service.js';
import * as audit from '../audit/audit.service.js';

export const csv = async (req: Request, res: Response) => {
  const resource = String(req.params.resource);
  const needed = service.RESOURCE_PERMISSION[resource];

  // Export is a read of the same data the screen shows, so it is gated by the
  // same capability — a support agent cannot export what they cannot open.
  if (!needed || !req.admin?.permissions.has(needed)) {
    throw forbidden(`Missing permission: ${needed ?? 'unknown resource'}`);
  }

  const written = await service.stream(resource, req.query as Record<string, unknown>, res);

  // Bulk extraction of member data is worth recording.
  await audit.record({
    adminId: req.adminId!, action: 'UPDATE', entityType: 'export', entityId: resource,
    summary: `Exported ${written} ${resource} row${written === 1 ? '' : 's'} to CSV`,
    after: { resource, rows: written, filters: req.query }, req,
  });
};
