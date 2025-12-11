// recomenda.js
// Rota de recomendações para piscicultura Engorda 4.0
// Usa dados dos últimos N dias (padrão = 7 dias) - ideal para histórico recente

const express = require('express');
const router = express.Router();
const pool = require('./db');

// thresholds / config (extrair para arquivo/config se desejar)
const DEFAULT_DAYS = 7;
const MAX_DAYS = 365;
const TEMP_LOW = 24;
const TEMP_HIGH = 30;
const OX_MIN = 5;
const PH_MIN = 6.5;
const PH_MAX = 9.0;

// ROTA: /recomendacoes/:dispositivo_id
// Query params: ?days=7  (opcional), ?format=plain (retorna texto simples)
router.get('/:dispositivo_id', async (req, res) => {
  const id = req.params.dispositivo_id;

  // validar dispositivo_id se esperado numérico ou UUID; ajustar conforme schema
  if (!id) {
    return res.status(400).json({ error: 'dispositivo_id é obrigatório' });
  }

  // parse e validação de days
  let parsedDays = parseInt(req.query.days, 10);
  if (isNaN(parsedDays) || parsedDays < 1) parsedDays = DEFAULT_DAYS;
  if (parsedDays > MAX_DAYS) parsedDays = MAX_DAYS;
  const days = parsedDays;

  try {
    // usa multiplicação por INTERVAL para evitar problemas de concatenação
    const q = await pool.query(
      `
      SELECT 
        AVG(temperatura) AS temp,
        AVG(oxigenio)   AS ox,
        AVG(ph)         AS ph,
        COUNT(temperatura) AS cnt_temp,
        COUNT(oxigenio)    AS cnt_ox,
        COUNT(ph)          AS cnt_ph
      FROM leituras
      WHERE dispositivo_id = $1
        AND data_hora > NOW() - ($2 * INTERVAL '1 day');
    `,
      [id, days]
    );

    const row = q.rows[0] || {};

    const cntTemp = Number(row.cnt_temp || 0);
    const cntOx = Number(row.cnt_ox || 0);
    const cntPh = Number(row.cnt_ph || 0);
    const totalCount = cntTemp + cntOx + cntPh;

    if (totalCount === 0) {
      const msg = `Sem leituras nos últimos ${days} dias para o dispositivo ${id}.`;
      if (req.query.format === 'plain') return res.send(msg);
      return res.json({
        temp_media: null,
        ox_media: null,
        ph_media: null,
        recomendacoes: [{ tipo: 'info', texto: msg }],
        motivos: []
      });
    }

    const temp = row.temp !== null ? Number(row.temp) : null;
    const ox = row.ox !== null ? Number(row.ox) : null;
    const ph = row.ph !== null ? Number(row.ph) : null;

    const recomendacoes = [];
    const motivos = [];

    // Regras simples de manejo (exemplo)
    if (temp !== null) {
      if (temp < TEMP_LOW) {
        recomendacoes.push({
          tipo: 'alimentacao',
          texto: 'Temperatura média baixa — reduzir oferta de ração e observar consumo.'
        });
        motivos.push(`Temp média ${temp.toFixed(2)}°C`);
      } else if (temp <= TEMP_HIGH) {
        recomendacoes.push({
          tipo: 'alimentacao',
          texto: 'Temperatura média na faixa ideal — manter rotina de arraçoamento e monitoramento diário.'
        });
      } else {
        recomendacoes.push({
          tipo: 'aeracao',
          texto: 'Temperatura média alta — aumentar aeração, evitar superalimentação e monitorar sinais de estresse.'
        });
        motivos.push(`Temp média ${temp.toFixed(2)}°C`);
      }
    }

    if (ox !== null && ox < OX_MIN) {
      recomendacoes.push({
        tipo: 'aeracao',
        texto: 'Oxigênio médio baixo — acionar aeradores, principalmente à noite e ao amanhecer.'
      });
      motivos.push(`O2 médio ${ox.toFixed(2)} mg/L`);
    }

    if (ph !== null && (ph < PH_MIN || ph > PH_MAX)) {
      recomendacoes.push({
        tipo: 'qualidade',
        texto: `pH médio fora do ideal (${ph.toFixed(2)}) — avaliar correção ou renovação parcial da água.`
      });
      motivos.push(`pH médio ${ph.toFixed(2)}`);
    }

    // monta texto amigável (para App Inventor com ?format=plain)
    const linhas = [];
    linhas.push(`Temperatura média (${days}d): ${temp !== null ? temp.toFixed(2) + '°C' : 'sem dados'}`);
    if (ox !== null) linhas.push(`Oxigênio médio (${days}d): ${ox.toFixed(2)} mg/L`);
    if (ph !== null) linhas.push(`pH médio (${days}d): ${ph.toFixed(2)}`);
    linhas.push('');
    if (recomendacoes.length === 0) {
      linhas.push('Sem recomendações específicas no momento. Manter monitoramento de rotina.');
    } else {
      linhas.push('Recomendações para o piscicultor:');
      recomendacoes.forEach(r => linhas.push(`• ${r.texto}`));
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
    console.error('Erro /recomendacoes:', { err, dispositivo_id: id, days });
    return res.status(500).json({ error: 'erro interno' });
  }
});

module.exports = router;
