// index.js
// API de Telemetria (Node.js + Express + PostgreSQL)

// Dependências principais
const express = require("express");
const pool = require("./db");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const app = express();

// Middlewares de segurança e parsing
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

// ---------------------------------------------------------------------------
// 🟩 ROTA DE TESTE DE RECOMENDAÇÃO (mock fixo)
// ---------------------------------------------------------------------------
app.get('/teste_recomenda', (req, res) => {
  console.log("[LOG] Requisição recebida em /teste_recomenda de", req.ip);

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

// ---------------------------------------------------------------------------
// Função de inicialização do DB: cria tabela se não existir
// ---------------------------------------------------------------------------
async function initDB() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS leituras (
      id SERIAL PRIMARY KEY,
      dispositivo_id VARCHAR(100) NOT NULL,
      temperatura DECIMAL(5,2) NOT NULL,
      data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_leituras_dispositivo_datahora
      ON leituras(dispositivo_id, data_hora DESC);
  `;

  await pool.query(createTableQuery);
  console.log("Tabelas verificadas/criadas.");
}

// ---------------------------------------------------------------------------
// Endpoint de saúde
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  console.log("[LOG] Requisição recebida em / de", req.ip);
  res.send("API de Telemetria rodando ✅");
});

// ---------------------------------------------------------------------------
// Inserir leitura (POST /leituras)
// ---------------------------------------------------------------------------
app.post("/leituras", async (req, res) => {
  console.log("[LOG] Requisição POST recebida em /leituras de", req.ip, "Body:", req.body);

  try {
    const { dispositivo_id, temperatura } = req.body;

    // Validação simples
    if (!dispositivo_id || typeof dispositivo_id !== "string") {
      return res.status(400).json({ error: "dispositivo_id inválido" });
    }

    const tempNum = parseFloat(temperatura);
    if (Number.isNaN(tempNum)) {
      return res.status(400).json({ error: "temperatura inválida" });
    }

    const result = await pool.query(
      `INSERT INTO leituras (dispositivo_id, temperatura) 
       VALUES ($1, $2) RETURNING *;`,
      [dispositivo_id, tempNum]
    );

    res.status(201).json(result.rows[0]);

  } catch (err) {
    console.error("Erro POST /leituras:", err);
    res.status(500).json({ error: "erro interno ao inserir leitura" });
  }
});

// ---------------------------------------------------------------------------
// Buscar últimas leituras (GET /leituras/:id?limit=50)
// ---------------------------------------------------------------------------
app.get("/leituras/:id", async (req, res) => {
  console.log(`[LOG] GET /leituras/${req.params.id}?limit=${req.query.limit} de`, req.ip);

  try {
    const dispositivo = req.params.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 1000);

    const result = await pool.query(
      `SELECT id, dispositivo_id, temperatura, data_hora
       FROM leituras
       WHERE dispositivo_id = $1
       ORDER BY data_hora DESC
       LIMIT $2;`,
      [dispositivo, limit]
    );

    res.json(result.rows);

  } catch (err) {
    console.error("Erro GET /leituras/:id", err);
    res.status(500).json({ error: "erro interno ao buscar leituras" });
  }
});

// ---------------------------------------------------------------------------
// Buscar última leitura (GET /leituras/latest/:id?format=plain)
// ---------------------------------------------------------------------------
app.get("/leituras/latest/:id", async (req, res) => {
  console.log(`[LOG] GET /leituras/latest/${req.params.id}?format=${req.query.format} de`, req.ip);

  try {
    const dispositivo = req.params.id;

    const result = await pool.query(
      `SELECT id, dispositivo_id, temperatura, data_hora
       FROM leituras
       WHERE dispositivo_id = $1
       ORDER BY data_hora DESC
       LIMIT 1;`,
      [dispositivo]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "nenhuma leitura encontrada" });
    }

    const row = result.rows[0];

    if (req.query.format === "plain") {
      const resposta = `${row.temperatura};${row.data_hora.toISOString()}`;
      console.log("[LOG] Resposta enviada:", resposta);
      return res.send(resposta);
    }

    console.log("[LOG] Resposta enviada (json):", row);
    res.json(row);

  } catch (err) {
    console.error("Erro GET /leituras/latest/:id", err);
    res.status(500).json({ error: "erro interno ao buscar última leitura" });
  }
});

// ---------------------------------------------------------------------------
// Rota de teste simples
// ---------------------------------------------------------------------------
app.get('/teste', (req, res) => {
  console.log("[LOG] Requisição recebida em /teste de", req.ip);
  res.send('Temperatura simulada: 27.5°C');
});

// ---------------------------------------------------------------------------
// Inicializa DB e sobe servidor
// ---------------------------------------------------------------------------
const port = process.env.PORT || 10000;

initDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`API rodando na porta ${port}`);
    });
  })
  .catch((err) => {
    console.error("Falha ao inicializar banco de dados:", err);
    process.exit(1);
  });

