import { readJSON, writeJSON } from './fileStore.js';
import { REGISTRY_FILE } from '../config.js';

const EMPTY = { version: '1.0.0', automations: [] };

export function readRegistry() {
  const data = readJSON(REGISTRY_FILE, EMPTY);
  if (Array.isArray(data)) return { version: '1.0.0', automations: data };
  return data;
}

export function writeRegistry(data) {
  writeJSON(REGISTRY_FILE, data);
}

export function getAutomations() {
  return readRegistry().automations;
}

export function setAutomations(automations) {
  const reg = readRegistry();
  reg.automations = automations;
  writeRegistry(reg);
}

// AgentCare aliases
export const getItems = getAutomations;
export const setItems = setAutomations;
