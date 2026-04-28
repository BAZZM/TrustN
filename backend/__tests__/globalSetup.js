const { setupTestDb } = require('./helpers/testDb');

module.exports = async () => {
  await setupTestDb();
};
