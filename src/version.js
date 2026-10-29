const { version: packageVersion } = require('../package.json');

const TRACKS = ['stable', 'canary'];

// APP_VERSION and TRACK are set per Cloud Run revision, so two revisions built
// from different images can be told apart in every response.
function getRuntimeInfo() {
  const track = TRACKS.includes(process.env.TRACK) ? process.env.TRACK : 'stable';
  return {
    version: process.env.APP_VERSION || packageVersion,
    track,
  };
}

function registerVersionHeaders(app) {
  app.addHook('onRequest', async (request, reply) => {
    const { version, track } = getRuntimeInfo();
    reply.header('X-App-Version', version);
    reply.header('X-Track', track);
  });
}

module.exports = { getRuntimeInfo, registerVersionHeaders };
