// recomenda.js
// Rota de recomendações para piscicultura Engorda 4.0
// Usa dados dos últimos N dias (padrão = 7 dias) - ideal para histórico recente

const express = require('express');
const router = express.Router();
const pool = require('./db');

// ROTA: /recomendacoes/:dispositivo_id
// Query params: ?days=7  (opcional), ?format=plain (retorna texto simples)
router.get('/:dispositivo_id', async (req, res) => {
  const id = req.params.dispositivo_id;
  const days = Math.max(1, parseInt(req.query.days || '7', 10)); // padrão 7 dias, mínimo 1

  try {
    // calcula média usando intervalo de dias (últimos N dias)
    const q = await pool.query(`
      SELECT 
        AVG(temperatura) AS temp,
        AVG(oxigenio)   AS ox,
        AVG(ph)         AS ph,
        COUNT(temperatura) AS cnt_temp,
        COUNT(oxigenio)    AS cnt_ox,
        COUNT(ph)          AS cnt_ph
      FROM leituras
      WHERE dispositivo_id = $1
        AND data_hora > NOW() - ($2 || ' days')::interval;
    `, [id, days]);

    const row = q.rows[0] || {};

    if (!row || Number(row.cnt_temp || 0) === 0) {
      const msg = Sem leituras nos últimos ${days} dias para o dispositivo ${id}.;
      if (req.query.format === 'plain') return res.send(msg);
      return res.json({
        temp_media: null,
        ox_media: null,
        ph_media: null,
        recomendacoes: [{ tipo: "info", texto: msg }],
        motivos: []
      });
    }

    const temp = row.temp !== null ? Number(row.temp) : null;
    const ox   = row.ox !== null ? Number(row.ox) : null;
    const ph   = row.ph !== null ? Number(row.ph) : null;

    const recomendacoes = [];
    const motivos = [];

    // Regras simples de manejo (exemplo)
    if (temp !== null) {
      if (temp < 24) {
        recomendacoes.push({ tipo: 'alimentacao', texto: 'Temperatura média baixa — reduzir oferta de ração e observar consumo.' });
        motivos.push(Temp média ${temp.toFixed(2)}°C);
      } else if (temp <= 30) {
        recomendacoes.push({ tipo: 'alimentacao', texto: 'Temperatura média na faixa ideal — manter rotina de arraçoamento e monitoramento diário.' });
      } else {
        recomendacoes.push({ tipo: 'aeracao', texto: 'Temperatura média alta — aumentar aeração, evitar superalimentação e monitorar sinais de estresse.' });
        motivos.push(Temp média ${temp.toFixed(2)}°C);
      }
    }

    if (ox !== null && ox < 5) {
      recomendacoes.push({ tipo: 'aeracao', texto: 'Oxigênio médio baixo — acionar aeradores, principalmente à noite e ao amanhecer.' });
      motivos.push(O2 médio ${ox.toFixed(2)} mg/L);
    }

    if (ph !== null && (ph < 6.5 || ph > 9.0)) {
      recomendacoes.push({ tipo: 'qualidade', texto: pH médio fora do ideal (${ph.toFixed(2)}) — avaliar correção ou renovação parcial da água. });
      motivos.push(pH médio ${ph.toFixed(2)});
    }

    // monta texto amigável (para App Inventor com ?format=plain)
    const linhas = [];
    linhas.push(Temperatura média (${days}d): ${temp !== null ? temp.toFixed(2) + '°C' : 'sem dados'});
    if (ox !== null) linhas.push(Oxigênio médio (${days}d): ${ox.toFixed(2)} mg/L);
    if (ph !== null) linhas.push(pH médio (${days}d): ${ph.toFixed(2)});
    linhas.push('');
    if (recomendacoes.length === 0) {
      linhas.push('Sem recomendações específicas no momento. Manter monitoramento de rotina.');
    } else {
      linhas.push('Recomendações para o piscicultor:');
      recomendacoes.forEach(r => linhas.push(• ${r.texto}));
    }
    const textoFinal = linhas.join('\n');

    if (req.query.format === 'plain') return res.send(textoFinal);

    // resposta JSON padrão (para dashboard / debug)
    return res.json({
      temp_media: temp,
      ox_media: ox,
      ph_media: ph,
      recomendacoes,
      motivos,
      texto: textoFinal
    });

  } catch (err) {
    console.error("Erro /recomendacoes:", err);
    return res.status(500).json({ error: "erro interno" });
  }
});

module.exports = router;
