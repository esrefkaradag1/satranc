import handler, { config } from '../lib/api-handlers/chesscom-recent-puzzles';
import { withApiAuth } from '../lib/withApiAuth';

export { config };
export default withApiAuth('chesscom-recent-puzzles', handler);
