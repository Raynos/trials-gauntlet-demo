/**
 * Side-effect module: installs the crash screen (./errorModal.ts) at EVALUATION time. main.ts imports it
 * first, so its listeners exist before any other game module's top level runs (ES modules evaluate in
 * import order). Its only dependency is the clipboard helper, which has none.
 */
import { installErrorModal } from './errorModal';

installErrorModal();
