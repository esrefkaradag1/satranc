import handler from '../lib/api-handlers/load-parent-consent';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('load-parent-consent', handler);
