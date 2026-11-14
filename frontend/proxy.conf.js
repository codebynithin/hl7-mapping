require('../scripts/load-env');

const apiPort = process.env.PORT || 3000;

/** Dev-server proxy. The Angular app calls `/api`, which forwards to the backend port in the root `.env`. */
module.exports = {
  '/api': {
    target: `http://localhost:${apiPort}`,
    secure: false,
    changeOrigin: true,
    logLevel: 'warn',
  },
};
