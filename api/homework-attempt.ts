import handler from '../lib/api-handlers/homework-attempt';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('homework-attempt', handler);
