import handler from '../lib/api-handlers/chesscom-member-stats';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('chesscom-member-stats', handler);
