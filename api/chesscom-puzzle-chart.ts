import handler, { config } from '../lib/api-handlers/chesscom-puzzle-chart';
import { withApiAuth } from '../lib/withApiAuth';

export { config };
export default withApiAuth('chesscom-puzzle-chart', handler);
