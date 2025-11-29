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

// Middlewares de segurança
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("combined"));

// Rota de recomendações (recomenda.js deve exportar somente "router")
const recomendaRouter = require("./recomenda");
app.use("/recomendacoes", recomendaRouter);

// ---------------------------------------------------------------------------
// 🟩 ROTA DE TESTE DE RECOMENDAÇÃO (mock fixo)
// ---------------------------------------------------------------------------
app.get("/teste_recomenda", (req, res) => {
  console.log("[LOG] Requisição recebida em /teste_recomenda de", req.ip);

  res.status(200).json({
    temp_media: 28.4,
    ox_media: 4.2,
    ph_media: 7.3,
    recomendacoes: [
      { tipo: "aeracao", texto: "Oxigênio baixo — acionar aeradores." },
      { tipo: "racao", texto: "Reduzir ração 20% até normalizar OD." },
    ],
    motivos: ["Temp média 28.4°C", "O2 médio 4.2 mg/L"],
  });
});

// ---------------------------------------------------------------------------
// 🟦 ENDPOINT TEMPORÁRIO DE MIGRAÇÃO (RODAR 1 VEZ)
// ---------------------------------------------------------------------------
// Após a migração estar OK, APAGUE ESTE BLOCO + a variável MIGRATE_SECRET
app.get("/__migrate_db", async (req, res) => {
  try {
    const secret = process.env.MIGRATE_SECRET || "";
    const key = req.query.secret;

    if (!key || key !== secret) {
      return res.status(401).json({ error: "unauthorized" });
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS leituras (
        id SERIAL PRIMARY KEY,
        dispositivo_id VARCHAR(100) NOT NULL,
        temperatura DECIMAL(7,3) NOT NULL,
        data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_leituras_dispositivo_datahora
        ON leituras(dispositivo_id, data_hora DESC);

      ALTER TABLE leituras
        ADD COLUMN IF NOT EXISTS oxigenio DECIMAL(7,3),
        ADD COLUMN IF NOT EXISTS ph DECIMAL(7,3);

      CREATE TABLE IF NOT EXISTS recomendacoes (
        id SERIAL PRIMARY KEY,
        dispositivo_id VARCHAR(100) NOT NULL,
        recomendacao JSONB NOT NULL,
        motivo TEXT,
        data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_recomendacoes_dispositivo
        ON recomendacoes(dispositivo_id, data_hora DESC);
    `;

    await pool.query(sql);

    console.log("[MIGRATE] Migração executada com sucesso.");
    return res.json({ ok: true, msg: "Migração executada com sucesso." });
  } catch (err) {
    console.error("[MIGRATE] Erro na migração:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Função de inicialização do DB (garante tabelas mínimas)
// ---------------------------------------------------------------------------
async function initDB() {
  const sql = `
    CREATE TABLE IF NOT EXISTS leituras (
      id SERIAL PRIMARY KEY,
      dispositivo_id VARCHAR(100) NOT NULL,
      temperatura DECIMAL(7,3) NOT NULL,
      data_hora TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_leituras_dispositivo_datahora
      ON leituras(dispositivo_id, data_hora DESC);
  `;

  await pool.query(sql);
  console.log("Tabelas básicas verificadas/criadas.");
}

// ---------------------------------------------------------------------------
// Endpoint de saúde
// ---------------------------------------------------------------------------
app.get("/", (req, res) => {
  res.send("API de Telemetria rodando ✅");
});

// ---------------------------------------------------------------------------
// Inserir leitura
// ---------------------------------------------------------------------------
app.post("/leituras", async (req, res) => {
  try {
    const { dispositivo_id, temperatura, oxigenio, ph } = req.body;

    if (!dispositivo_id) {
      return res.status(400).json({ error: "dispositivo_id inválido" });
    }

    const temp = parseFloat(temperatura);
    const ox = oxigenio !== undefined ? parseFloat(oxigenio) : null;
    const phValue = ph !== undefined ? parseFloat(ph) : null;

    const result = await pool.query(
      `INSERT INTO leituras (dispositivo_id, temperatura, oxigenio, ph)
       VALUES ($1, $2, $3, $4)
       RETURNING *;`,
      [dispositivo_id, temp, ox, phValue]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("Erro POST /leituras:", err);
    res.status(500).json({ error: "erro interno" });
  }
});

// ---------------------------------------------------------------------------
// Buscar leituras
// ---------------------------------------------------------------------------
app.get("/leituras/:id", async (req, res) => {
  try {
    const dispositivo_id = req.params.id;
    const limit = Math.min(parseInt(req.query.limit) || 50, 1000);

    const result = await pool.query(
      `SELECT id, dispositivo_id, temperatura, oxigenio, ph, data_hora
       FROM leituras
       WHERE dispositivo_id = $1
       ORDER BY data_hora DESC
       LIMIT $2;`,
      [dispositivo_id, limit]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Erro GET /leituras:", err);
    res.status(500).json({ error: "erro interno" });
  }
});

// ---------------------------------------------------------------------------
// Última leitura
// ---------------------------------------------------------------------------
app.get("/leituras/latest/:id", async (req, res) => {
  try {
    const dispositivo_id = req.params.id;

    const result = await pool.query(
      `SELECT id, dispositivo_id, temperatura, oxigenio, ph, data_hora
       FROM leituras
       WHERE dispositivo_id = $1
       ORDER BY data_hora DESC
       LIMIT 1;`,
      [dispositivo_id]
    );

    if (result.rowCount === 0)
      return res.status(404).json({ error: "nenhuma leitura encontrada" });

    const row = result.rows[0];

    if (req.query.format === "plain") {
      return res.send(
        `${row.temperatura};${row.oxigenio};${row.ph};${row.data_hora.toISOString()}`
      );
    }

    res.json(row);
  } catch (err) {
    console.error("Erro GET /latest:", err);
    res.status(500).json({ error: "erro interno" });
  }
});

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
const port = process.env.PORT || 10000;

initDB()
  .then(() => {
    app.listen(port, () => console.log(`API rodando na porta ${port}`));
  })
  .catch((err) => {
    console.error("Falha ao inicializar DB:", err);
    process.exit(1);
  });

