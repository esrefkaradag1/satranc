import handler, { config } from '../lib/api-handlers/platform-week-stats';
import { withApiAuth } from '../lib/withApiAuth';

export { config };
export default withApiAuth('platform-week-stats', handler);
