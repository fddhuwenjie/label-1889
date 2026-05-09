// Jest 配置 — 主进程模块测试（Node.js 环境）
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/public/modules'],
  testMatch: ['**/__tests__/**/*.test.js'],
  // 不使用 react-scripts 的 transform，直接运行 CommonJS
  transform: {},
};
