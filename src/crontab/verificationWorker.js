const { parentPort } = require('worker_threads');
const { VerificationBetting } = require('./VerificationBetting.js'); // Asegúrate de importar correctamente

(async () => {
  try {
    // Realiza la verificación aquí
    const result = await VerificationBetting(); // Llama a tu función de verificación
    parentPort.postMessage({ status: 'success', result }); // Envía el resultado al hilo principal
  } catch (error) {
    parentPort.postMessage({ status: 'error', message: error.message }); // Envía el error si ocurre
  }
})();
