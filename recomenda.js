// recomenda.js
// Rota de recomendações para piscicultura Engorda 4.0
// Usa TODO o histórico do dispositivo (sem limite de dias/horas)

const express = require('express');
const router = express.Router();
const pool = require('./db');

// ROTA PRINCIPAL /recomendacoes/:dispositivo_id
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
        COUNT(ph)          AS cnt_ph
      FROM leituras
      WHERE dispositivo_id = $1;
    `, [id]);

    const row = q.rows[0];

    // Se não há nenhuma temperatura registrada para esse dispositivo
    if (!row || row.cnt_temp === 0) {
      const textoSemDados = "⚠ Nenhuma leitura encontrada para este tanque. Verifique o sensor ou o dispositivo_id.";

      if (req.query.format === 'plain') {
        return res.send(textoSemDados);
      }

      return res.json({
        temp_media: null,
        recomendacoes: [
          { tipo: "info", texto: "Nenhuma leitura encontrada para este tanque." }
        ]
      });
    }

    const temp = Number(row.temp);
    const ox   = row.cnt_ox > 0 ? Number(row.ox) : null;
    const ph   = row.cnt_ph > 0 ? Number(row.ph) : null;

    const recomendacoes = [];
    const motivos = [];

    // --- Regras simples de manejo ---

    // Temperatura média do histórico
    if (temp < 24) {
      recomendacoes.push({
        tipo: 'alimentacao',
        texto: 'Temperatura média baixa — reduzir oferta de ração e observar consumo (peixes com metabolismo mais lento).'
      });
      motivos.push(`Temp média ${temp.toFixed(2)}°C`);
    } else if (temp <= 30) {
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

    // Oxigênio dissolvido médio
    if (ox !== null && ox < 5) {
      recomendacoes.push({
        tipo: 'aeracao',
        texto: 'Oxigênio dissolvido médio abaixo de 5 mg/L — acionar aeradores, principalmente à noite e ao amanhecer.'
      });
      motivos.push(`O2 médio ${ox.toFixed(2)} mg/L`);
    }

    // pH médio
    if (ph !== null && (ph < 6.5 || ph > 9.0)) {
      recomendacoes.push({
        tipo: 'qualidade',
        texto: `pH médio fora do ideal — (${ph.toFixed(2)}) — avaliar correção (calagem) ou renovação parcial da água.`
      });
      motivos.push(`pH médio ${ph.toFixed(2)}`);
    }

    // Monta texto amigável para o App Inventor (plain text)
    let linhas = [];
    linhas.push(`Temperatura média (histórico): ${temp.toFixed(2)}°C`);
    if (ox !== null) linhas.push(`Oxigênio médio (histórico): ${ox.toFixed(2)} mg/L`);
    if (ph !== null) linhas.push(`pH médio (histórico): ${ph.toFixed(2)}`);
    linhas.push(""); // linha em branco

    if (recomendacoes.length === 0) {
      linhas.push("Sem recomendações específicas no momento. Manter rotina de monitoramento e boas práticas de manejo.");
    } else {
      linhas.push("Recomendações para o piscicultor:");
      recomendacoes.forEach(r => {
        linhas.push("• " + r.texto);
      });
    }

    const textoFinal = linhas.join("\n");

    // Se a URL tiver ?format=plain → devolve só texto (ideal pro App Inventor)
    if (req.query.format === 'plain') {
      return res.send(textoFinal);
    }

    // Resposta JSON (para futuras integrações, dashboards, etc.)
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
    res.status(500).json({ error: "erro interno" });
  }
});

// EXPORTA APENAS O ROUTER
module.exports = router;
