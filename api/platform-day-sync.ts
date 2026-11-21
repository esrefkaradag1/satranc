import { withApiAuth } from '../lib/withApiAuth';
import handler from '../lib/api-handlers/platform-day-sync';

export default withApiAuth('platform-day-sync', handler);
export const config = { maxDuration: 300 };
