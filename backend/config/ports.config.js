const net = require('net');
const config = require('./app.config');

/**
 * Check if a port is in use on localhost
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true);
      } else {
        resolve(false);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve(false));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find the next available port in the allocated range 8100-8999
 * taking into account already registered ports in SQLite and active sockets
 * @param {number[]} registeredPorts
 * @returns {Promise<number>}
 */
async function findAvailablePort(registeredPorts = []) {
  const registeredSet = new Set(registeredPorts);
  for (let port = config.PORT_RANGE_START; port <= config.PORT_RANGE_END; port++) {
    if (!registeredSet.has(port)) {
      const inUse = await isPortInUse(port);
      if (!inUse) {
        return port;
      }
    }
  }
  throw new Error('No available ports left in range 8100-8999');
}

module.exports = {
  isPortInUse,
  findAvailablePort
};
