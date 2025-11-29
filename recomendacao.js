// recomenda.js
// Rota de recomendações simples baseada em médias das últimas 24h.
// Requisitos: pool do pg (arquivo db.js já existente)

const express = require('express');
const router = express.Router();
const pool = require('./db');

// Configurações (poderiam vir de env/config)
const WINDOW_SQL = "now() - interval '24 hours'"; // ou '1 day'
const TEMP_LOW = 24.0;
const TEMP_HIGH = 30.0;
const OXIGENIO_MIN = 5.0;
const PH_MIN = 6.5;
const PH_MAX = 9.0;

// Validador simples para id (ajuste se seu id não for inteiro)
function validateId(id) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0;
}

router.get('/:dispositivo_id', async (req, res) => {
  const id = req.params.dispositivo_id;

  if (!validateId(id)) {
    return res.status(400).json({ error: 'dispositivo_id inválido' });
  }

  try {
    // consulta as médias das últimas 24h
    const sql = `
      SELECT AVG(temperatura) AS temp_media,
             AVG(oxigenio) AS ox_media,
             AVG(ph) AS ph_media
      FROM leituras
      WHERE dispositivo_id = $1
        AND data_hora > ${WINDOW_SQL};
    `;
    const q = await pool.query(sql, [id]);
    const row = q.rows[0];

    if (!row || row.temp_media === null) {
      // Sem leituras recentes
      const payload = {
        temp_media: null,
        ox_media: null,
        ph_media: null,
        recomendacoes: [
          { tipo: 'info', texto: 'Sem leituras recentes. Verifique o sensor ou envie leituras de teste.' }
        ],
        motivos: []
      };
      // opcional: gravar evento de "sem leituras" (não obrigatório)
      return res.json(payload);
    }

    // Converter de forma segura (pg retorna numerics como string)
    const temp = row.temp_media !== null ? parseFloat(row.temp_media) : null;
    const ox = row.ox_media !== null ? parseFloat(row.ox_media) : null;
    const ph = row.ph_media !== null ? parseFloat(row.ph_media) : null;

    const recomendacoes = [];
    const motivos = [];

    // Regras de recomendação (mesma lógica do original)
    if (temp !== null) {
      if (temp < TEMP_LOW) {
        recomendacoes.push({ tipo: 'alimentacao', texto: 'Diminuir alimentação — temperatura média baixa.' });
        motivos.push(`Temp média ${temp.toFixed(2)}°C`);
      } else if (temp <= TEMP_HIGH) {
        recomendacoes.push({ tipo: 'alimentacao', texto: 'Manter alimentação padrão — temperatura dentro do intervalo.' });
      } else {
        recomendacoes.push({ tipo: 'aeracao', texto: 'Temperatura alta — aumentar aeração e reduzir ração.' });
        motivos.push(`Temp média ${temp.toFixed(2)}°C`);
      }
    }

    if (ox !== null && ox < OXIGENIO_MIN) {
      recomendacoes.push({ tipo: 'aeracao', texto: 'Oxigênio dissolvido baixo — acionar aeradores.' });
      motivos.push(`O2 médio ${ox.toFixed(2)} mg/L`);
    }

    if (ph !== null && (ph < PH_MIN || ph > PH_MAX)) {
      recomendacoes.push({ tipo: 'qualidade', texto: `pH ${ph.toFixed(2)} fora do intervalo ideal (${PH_MIN}-${PH_MAX}).` });
      motivos.push(`pH médio ${ph.toFixed(2)}`);
    }

    // Sugestão de ração
    if (temp !== null && temp >= 25 && temp <= 28 && (ox === null || ox >= OXIGENIO_MIN)) {
      recomendacoes.push({ tipo: 'racao', texto: 'Ração A (proteína padrão) recomendada — condições favoráveis.' });
    } else if (temp !== null && temp > 28) {
      recomendacoes.push({ tipo: 'racao', texto: 'Considerar ração com menor densidade energética e reduzir frequência.' });
    }

    const payload = {
      temp_media: temp,
      ox_media: ox,
      ph_media: ph,
      recomendacoes,
      motivos
    };

    // Persistir registro: não bloqueante (fire-and-forget) — tratamos erros localmente
    (async () => {
      try {
        const insertSql = `
          INSERT INTO recomendacoes (dispositivo_id, recomendacao, motivo, created_at)
          VALUES ($1, $2::jsonb, $3, now())
        `;
        // grava apenas se houver recomendações / motivos (opcional)
        const recomendacaoJson = JSON.stringify(recomendacoes);
        const motivoStr = motivos.join('; ');
        await pool.query(insertSql, [id, recomendacaoJson, motivoStr]);
      } catch (err) {
        // Loga, mas não interrompe a resposta ao cliente
        console.error('Erro ao salvar recomendação (background):', err);
      }
    })();

    return res.json(payload);
  } catch (err) {
    console.error('Erro /recomendacoes:', err);
    return res.status(500).json({ error: 'erro interno' });
  }
});

module.exports = router;
