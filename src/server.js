const { buildApp } = require('./app');
const { port, host } = require('./config');

async function start() {
  const app = await buildApp();
  await app.listen({ port, host });
  console.log(`Server listening on http://${host}:${port}`);
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
