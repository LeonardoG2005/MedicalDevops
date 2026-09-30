const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config/env');

test('loads defaults and external API URLs', () => {
  assert.deepEqual(loadConfig({
    PORT: '',
    MEDICAL_API_URL: 'https://medical.example.test',
    API_A_URL: 'https://pss.example.test',
    API_C_URL: 'https://pets.example.test'
  }), {
    port: 4000,
    medicalApiUrl: 'https://medical.example.test/',
    apiAUrl: 'https://pss.example.test/',
    apiCUrl: 'https://pets.example.test/',
    gcpProjectId: undefined,
    pubsubTopic: 'medical-orchestrator-events'
  });
});

test('rejects invalid configuration values', () => {
  assert.throws(() => loadConfig({ PORT: '70000' }), /PORT/);
  assert.throws(() => loadConfig({ API_A_URL: 'not-a-url' }), /API_A_URL/);
});