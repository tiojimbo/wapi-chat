const NodeCache = require('node-cache');

// TTL padrão: 600 segundos (10 minutos)
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });
 
module.exports = cache; 