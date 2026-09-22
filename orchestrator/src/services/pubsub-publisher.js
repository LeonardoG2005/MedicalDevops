const { PubSub } = require('@google-cloud/pubsub');

const createPubSubPublisher = ({ projectId, topicName, pubsub = new PubSub({ projectId }) }) => {
  const topic = pubsub.topic(topicName);

  return {
    publish: async (message) => {
      const data = Buffer.from(JSON.stringify(message));
      return topic.publishMessage({ data });
    }
  };
};

module.exports = { createPubSubPublisher };