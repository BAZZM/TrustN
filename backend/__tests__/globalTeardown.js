const { teardownTestDb } = require('./helpers/testDb');

module.exports = async () => {
  await teardownTestDb();
};
