import { loadPublicNetworkRegistry } from './lib-public-network-registry.mjs';
import {
  RESULT_ENVELOPE_VERSION,
  listWorkflowDefinitions,
} from '../packages/shared/src/workflow-catalog.js';

function buildPublicWorkflowEntry(definition) {
  return {
    id: definition.id,
    version: definition.version,
    trigger: {
      ...definition.trigger,
      ...(definition.trigger.supported
        ? { supported: [...definition.trigger.supported] }
        : {}),
    },
    allowedNetworks: [...definition.allowedNetworks],
    route: definition.route,
    ...(definition.capabilityId ? { capabilityId: definition.capabilityId } : {}),
    policies: [...definition.policies],
    delivery: { ...definition.delivery },
  };
}

export function loadPublicRuntimeCatalog(options = {}) {
  return {
    envelope: { version: RESULT_ENVELOPE_VERSION },
    networks: loadPublicNetworkRegistry(options),
    workflows: listWorkflowDefinitions().map((definition) => buildPublicWorkflowEntry(definition)),
  };
}
