import handler from '../lib/api-handlers/lichess-proxy';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('lichess-proxy', handler);
