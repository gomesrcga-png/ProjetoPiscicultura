Conexão com PostgreSQL usando pg.Pool
const { Pool } = require("pg");
require("dotenv").config();

// Usamos DATABASE_URL (padrão do Render e Heroku)
// Em produção RENDER/Heroku fornecem URL com SSL obrigatório.
// O rejectUnauthorized: false é necessário em hosts gerenciados (Render).
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // se DATABASE_URL não tiver SSL, o objeto ssl será ignorado
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Exportamos o pool para ser usado nas rotas
module.exports = pool;
