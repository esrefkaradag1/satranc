import handler from '../lib/api-handlers/lichess-puzzle-latest';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('lichess-puzzle-latest', handler);
