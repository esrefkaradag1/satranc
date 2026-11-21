import handler from '../lib/api-handlers/live-lesson-chat';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('live-lesson-chat', handler);
