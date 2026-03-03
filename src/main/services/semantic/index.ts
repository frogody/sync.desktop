/**
 * Semantic Foundation — Barrel Export
 *
 * Five-stage processing pipeline:
 * 1. EntityRegistry       — Entity extraction & disambiguation
 * 2. SemanticProcessor    — Activity classification (Phase 2)
 * 3. ThreadManager        — Context threading (Phase 3)
 * 4. IntentClassifier     — Intent inference (Phase 3)
 * 5. SignatureComputer    — Behavioral signatures (Phase 4)
 */

export { EntityRegistry } from './entityRegistry';
export { SemanticProcessor } from './semanticProcessor';
export { ThreadManager } from './threadManager';
export { IntentClassifier } from './intentClassifier';
export { SignatureComputer } from './signatureComputer';
export type * from './types';
