import { scheduleRecurring, startWorker } from './queue.js';
import { logger } from '../core/logger.js';

await scheduleRecurring();
startWorker();
logger.info('FortuneX worker started');
