import handler from '../lib/api-handlers/external-game-snapshot';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('external-game-snapshot', handler);
