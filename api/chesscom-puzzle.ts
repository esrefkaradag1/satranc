import handler from '../lib/api-handlers/chesscom-puzzle';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('chesscom-puzzle', handler);
