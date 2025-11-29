const express = require('express');
const router = express.Router();

// Mock de recomendação — usado para debug e front-end
router.get('/', (req, res) => {
  res.status(200).json({
    temp_media: 28.4,
    ox_media: 4.2,
    ph_media: 7.3,
    recomendacoes: [
      { tipo: 'aeracao', texto: 'Oxigênio baixo — acionar aeradores.' },
      { tipo: 'racao', texto: 'Reduzir ração 20% até normalizar OD.' }
    ],
    motivos: [
      'Temp média 28.4°C',
      'O2 médio 4.2 mg/L'
    ]
  });
});

module.exports = router;
