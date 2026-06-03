import type { Bundle } from '../types';
import Standings from './standings/Standings';
import Relative from './relative/Relative';
import './styles.css';
import './animations.css';

const bundle: Bundle = {
  id: 'default',
  name: 'Default',
  components: {
    standings: Standings,
    relative: Relative,
    // delta and stream-alerts are placeholders until T3 and T5 ship their components.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delta: Standings as any, // TODO(sprint-4a-t3): replace with DeltaBar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    'stream-alerts': Standings as any, // TODO(sprint-4a-t5): replace with StreamAlerts
  },
};

export default bundle;
