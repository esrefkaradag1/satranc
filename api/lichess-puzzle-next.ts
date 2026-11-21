import handler from '../lib/api-handlers/lichess-puzzle-next';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('lichess-puzzle-next', handler);
