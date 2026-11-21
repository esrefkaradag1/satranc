import handler from '../lib/api-handlers/study-event';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('study-event', handler);
