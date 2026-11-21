import handler from '../lib/api-handlers/chessduello';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('chessduello', handler);
