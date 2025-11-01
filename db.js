// Conexão com PostgreSQL usando pg.Pool
const { Pool } = require("pg");
require("dotenv").config();

// Usamos DATABASE_URL (padrão do Render e Heroku)
// Em produção, Render/Heroku fornecem URL com SSL obrigatório.
// O rejectUnauthorized: false é recomendado para hosts gerenciados (Render).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Exportamos o pool para ser usado nas rotas
module.exports = pool;
