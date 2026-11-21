import handler from '../lib/api-handlers/study-practice-log';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('study-practice-log', handler);
