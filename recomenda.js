// recomenda.js
const express = require('express');
const router = express.Router();
const pool = require('./db');

// ROTA PRINCIPAL /recomendacoes/:id
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
      WHERE dispositivo_id = $1
        AND data_hora > NOW() - INTERVAL '30 days';
    `, [id]);

    const row = q.rows[0];

    if (!row || row.cnt_temp === 0) {
      // Se não tem leitura recente
      const textoSemDados = "⚠ Sem leituras recentes. Verifique o sensor ou envie dados de teste.";

      // Se pediu em formato plain, devolve só texto
      if (req.query.format === 'plain') {
        return res.send(textoSemDados);
      }

      // JSON padrão
      return res.json({
        temp_media: null,
        recomendacoes: [
          { tipo: "info", texto: "Sem leituras recentes. Verifique o sensor." }
        ]
      });
    }

    const temp = Number(row.temp);
    const ox   = row.cnt_ox > 0 ? Number(row.ox) : null;
    const ph   = row.cnt_ph > 0 ? Number(row.ph) : null;

    const recomendacoes = [];
    const motivos = [];

    // --- regras (simples) ---
    if (temp < 24) {
      recomendacoes.push({ tipo: 'alimentacao', texto: 'Temperatura baixa — reduzir alimentação.' });
      motivos.push(`Temp ${temp.toFixed(2)}°C`);
    } else if (temp <= 30) {
      recomendacoes.push({ tipo: 'alimentacao', texto: 'Temperatura ideal — manter rotina.' });
    } else {
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

    // MONTA TEXTO FINAL PARA O APP INVENTOR (uma recomendação por linha)
    let linhas = [];
    linhas.push(`Temperatura média (24h): ${temp.toFixed(2)}°C`);
    if (ox !== null) linhas.push(`Oxigênio médio (24h): ${ox.toFixed(2)} mg/L`);
    if (ph !== null) linhas.push(`pH médio (24h): ${ph.toFixed(2)}`);
    linhas.push(""); // linha em branco

    if (recomendacoes.length === 0) {
      linhas.push("Sem recomendações específicas no momento. Manter monitoramento.");
    } else {
      linhas.push("Recomendações para o piscicultor:");
      recomendacoes.forEach(r => {
        linhas.push("• " + r.texto);
      });
    }

    const textoFinal = linhas.join("\n");

    // Se URL contiver ?format=plain → devolve só o texto (mais fácil pro App Inventor)
    if (req.query.format === 'plain') {
      return res.send(textoFinal);
    }

    // JSON padrão (caso queira usar no futuro com outro frontend)
    return res.json({
      temp_media: temp,
      ox_media: ox,
      ph_media: ph,
      recomendacoes,
      motivos,
      texto: textoFinal   // também manda o texto no JSON
    });

  } catch (err) {
    console.error("Erro /recomendacoes:", err);
    res.status(500).json({ error: "erro interno" });
  }
});

// EXPORTA APENAS O ROUTER (IMPORTANTE!!)
module.exports = router;
