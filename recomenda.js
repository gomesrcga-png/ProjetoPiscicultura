// recomenda.js
const express = require('express');
const router = express.Router();
const pool = require('./db');

// /recomendacoes/:id  → MÉDIA DOS ÚLTIMOS 7 DIAS
router.get('/:dispositivo_id', async (req, res) => {
  const id = req.params.dispositivo_id;

  try {
    const q = await pool.query(`
      SELECT 
        AVG(temperatura) AS temp,
        AVG(oxigenio)   AS ox,
        AVG(ph)         AS ph,
        COUNT(temperatura) AS cnt_temp,
        COUNT(oxigenio)    AS cnt_ox,
        COUNT(ph)         AS cnt_ph
      FROM leituras
      WHERE dispositivo_id = $1
        AND data_hora >= NOW() - INTERVAL '7 days';
    `, [id]);

    const row = q.rows[0];

    if (!row || row.cnt_temp === 0) {
      return res.json({
        temp_media: null,
        ox_media: null,
        ph_media: null,
        recomendacoes: [
          { tipo: "info", texto: "Sem leituras nos últimos 7 dias." }
        ],
        motivos: []
      });
    }

    const temp = Number(row.temp);
    const ox   = row.cnt_ox > 0 ? Number(row.ox) : null;
    const ph   = row.cnt_ph > 0 ? Number(row.ph) : null;

    const recomendacoes = [];
    const motivos = [];

    // REGRAS BASEADAS NA MÉDIA SEMANAL
    if (temp < 24) {
      recomendacoes.push({ tipo: 'alimentacao', texto: 'Temperatura baixa — reduzir alimentação.' });
      motivos.push(`Temp ${temp.toFixed(2)}°C`);
    } 
    else if (temp <= 30) {
      recomendacoes.push({ tipo: 'alimentacao', texto: 'Temperatura média na faixa ideal — manter rotina de arraçoamento e monitoramento diário.' });
    } 
    else {
      recomendacoes.push({ tipo: 'aeracao', texto: 'Temperatura alta — aumentar aeração.' });
      motivos.push(`Temp ${temp.toFixed(2)}°C`);
    }

    if (ox !== null && ox < 5) {
      recomendacoes.push({ tipo: 'aeracao', texto: 'Oxigênio baixo — acionar aeradores.' });
      motivos.push(`O2 ${ox.toFixed(2)} mg/L`);
    }

    if (ph !== null && (ph < 6.5 || ph > 9.0)) {
      recomendacoes.push({ tipo: 'qualidade', texto: `pH fora do ideal: ${ph.toFixed(2)}` });
      motivos.push(`pH ${ph.toFixed(2)}`);
    }

    // SALVA HISTÓRICO (opcional)
    try {
      await pool.query(
        `INSERT INTO recomendacoes (dispositivo_id, recomendacao, motivo)
         VALUES ($1, $2, $3)`,
        [id, JSON.stringify(recomendacoes), motivos.join('; ')]
      );
    } catch (e) {}

    return res.json({
      temp_media: temp,
      ox_media: ox,
      ph_media: ph,
      recomendacoes,
      motivos
    });

  } catch (err) {
    console.error("Erro /recomendacoes:", err);
    res.status(500).json({ error: "erro interno" });
  }
});

module.exports = router;
