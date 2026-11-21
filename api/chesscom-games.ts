import handler from '../lib/api-handlers/chesscom-games';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('chesscom-games', handler);
