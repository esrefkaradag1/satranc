import handler from '../lib/api-handlers/live-lesson-session-media';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('live-lesson-session-media', handler);
