import handler from '../lib/api-handlers/chesscom-puzzle-latest';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('chesscom-puzzle-latest', handler);
