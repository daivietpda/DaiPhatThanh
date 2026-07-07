const test = require('node:test');
const assert = require('node:assert/strict');

const { getDefaultMqttConfig } = require('../server');

test('builds MQTT config from environment for first-run docker setup', () => {
  process.env.MQTT_HOST = 'mqtt-broker';
  process.env.MQTT_PORT = '1883';
  process.env.MQTT_PROTOCOL = 'mqtt';
  process.env.MQTT_USERNAME = '';
  process.env.MQTT_PASSWORD = '';
  process.env.MQTT_TOPIC_PREFIX = 'home/audio';

  const cfg = getDefaultMqttConfig();
  assert.equal(cfg.host, 'mqtt-broker');
  assert.equal(cfg.port, 1883);
  assert.equal(cfg.protocol, 'mqtt');
  assert.equal(cfg.username, '');
  assert.equal(cfg.password, '');
  assert.equal(cfg.topicPrefix, 'home/audio');
});
