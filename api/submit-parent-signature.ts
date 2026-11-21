import handler from '../lib/api-handlers/submit-parent-signature';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('submit-parent-signature', handler);
