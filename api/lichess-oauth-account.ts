import handler from '../lib/api-handlers/lichess-oauth-account';
import { withApiAuth } from '../lib/withApiAuth';

export default withApiAuth('lichess-oauth-account', handler);
