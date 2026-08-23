import { scheduleRecurring, startWorker } from './queue.js';
import { logger } from '../core/logger.js';
import { installProcessHandlers } from '../core/error-reporter.js';

// The worker runs the money jobs unattended. A crash here is the one nobody
// is watching a screen for.
installProcessHandlers();

await scheduleRecurring();
startWorker();
logger.info('FortuneX worker started');
