import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Banco SQLite (arquivo único). Em teste usa DB_PATH=":memory:".
const DB_PATH = process.env.DB_PATH || './data/campanhas.db'
if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new Database(DB_PATH, { create: true, strict: true })
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (datetime('now')));

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','afiliado','participante')),
  permissions TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  token_version INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  prize_summary TEXT NOT NULL DEFAULT '',
  prize_conditions TEXT NOT NULL DEFAULT '',
  total_numbers INTEGER NOT NULL CHECK (total_numbers BETWEEN 1 AND 100000),
  number_start INTEGER NOT NULL DEFAULT 0,
  number_digits INTEGER NOT NULL DEFAULT 3,
  ref_price REAL NOT NULL DEFAULT 0,
  commission_value REAL NOT NULL DEFAULT 0,
  regulation TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  ends_at TEXT,
  draw_date TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','aguardando_autorizacao','autorizada','ativa','pausada','encerrada','apurada','arquivada')),
  legal_status TEXT NOT NULL DEFAULT 'pendente' CHECK (legal_status IN ('pendente','em_analise','autorizada','indeferida')),
  legal_modality TEXT NOT NULL DEFAULT '',
  authorization_number TEXT NOT NULL DEFAULT '',
  draw_method TEXT NOT NULL DEFAULT 'loteria_federal',
  draw_rule TEXT NOT NULL DEFAULT 'ultimos_3_primeiro_premio',
  draw_extraction TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS campaign_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'outro',
  title TEXT NOT NULL,
  file_url TEXT NOT NULL DEFAULT '',
  number TEXT NOT NULL DEFAULT '',
  issued_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS affiliates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE REFERENCES users(id),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  document TEXT NOT NULL DEFAULT '',
  pix_key TEXT NOT NULL DEFAULT '',
  commission_override REAL,
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','suspenso','inativo')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  user_id INTEGER REFERENCES users(id),
  affiliate_id INTEGER REFERENCES affiliates(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  document TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'interessado' CHECK (status IN ('interessado','ativo','inativo','bloqueado')),
  origin TEXT NOT NULL DEFAULT 'site',
  simulated INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (campaign_id, phone)
);

CREATE TABLE IF NOT EXISTS participations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  affiliate_id INTEGER REFERENCES affiliates(id),
  quantity INTEGER NOT NULL,
  unit_value REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','confirmada','cancelada')),
  simulated INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER,
  confirmed_at TEXT,
  cancelled_at TEXT,
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS numbers (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel','reservado','atribuido','cancelado','bloqueado')),
  participant_id INTEGER REFERENCES participants(id),
  participation_id INTEGER REFERENCES participations(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (campaign_id, number)
);
CREATE INDEX IF NOT EXISTS idx_numbers_part ON numbers(participation_id);

CREATE TABLE IF NOT EXISTS number_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  participant_id INTEGER,
  participation_id INTEGER,
  user_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_numhist ON number_history(campaign_id, number);

CREATE TABLE IF NOT EXISTS referral_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL REFERENCES affiliates(id),
  campaign_id INTEGER,
  visitor TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL REFERENCES affiliates(id),
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  participation_id INTEGER NOT NULL UNIQUE REFERENCES participations(id),
  quantity INTEGER NOT NULL,
  unit_value REAL NOT NULL,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','paga','cancelada','estornada')),
  simulated INTEGER NOT NULL DEFAULT 1,
  approved_at TEXT,
  paid_at TEXT,
  payment_ref TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS commission_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  commission_id INTEGER NOT NULL REFERENCES commissions(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  user_id INTEGER,
  note TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER REFERENCES campaigns(id),
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outros',
  amount REAL NOT NULL CHECK (amount >= 0),
  date TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'principal' CHECK (kind IN ('principal','alternativo','secundario')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  estimated_value REAL NOT NULL DEFAULT 0,
  delivery_conditions TEXT NOT NULL DEFAULT '',
  documents TEXT NOT NULL DEFAULT '[]',
  is_cash INTEGER NOT NULL DEFAULT 0,
  legal_approved INTEGER NOT NULL DEFAULT 0,
  public INTEGER NOT NULL DEFAULT 1,
  delivery_status TEXT NOT NULL DEFAULT 'aguardando_apuracao' CHECK (delivery_status IN ('aguardando_apuracao','contemplado_definido','em_entrega','entregue','cancelado')),
  winner_participant_id INTEGER REFERENCES participants(id),
  winner_number INTEGER,
  delivered_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prize_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prize_id INTEGER NOT NULL REFERENCES prizes(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  user_id INTEGER,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  mode TEXT NOT NULL CHECK (mode IN ('simulacao','oficial')),
  extraction_number TEXT NOT NULL,
  extraction_date TEXT NOT NULL,
  first_prize TEXT NOT NULL,
  source TEXT NOT NULL,
  source_detail TEXT NOT NULL DEFAULT '',
  source_verified INTEGER NOT NULL DEFAULT 0,
  rule TEXT NOT NULL,
  winning_number INTEGER NOT NULL,
  winner_participant_id INTEGER,
  winner_status TEXT NOT NULL,
  report TEXT NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- apuração é imutável: nenhuma alteração/remoção depois de gravada
CREATE TRIGGER IF NOT EXISTS draws_no_update BEFORE UPDATE ON draws BEGIN SELECT RAISE(ABORT, 'apuracao_imutavel'); END;
CREATE TRIGGER IF NOT EXISTS draws_no_delete BEFORE DELETE ON draws BEGIN SELECT RAISE(ABORT, 'apuracao_imutavel'); END;

CREATE TABLE IF NOT EXISTS campaign_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  changes TEXT NOT NULL DEFAULT '{}',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  user_name TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  ip TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'auditoria_imutavel'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'auditoria_imutavel'); END;

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`

// v2: pagamento PIX (SyncPay) e saques de afiliados
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  participation_id INTEGER NOT NULL UNIQUE REFERENCES participations(id),
  participant_id INTEGER NOT NULL REFERENCES participants(id),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  provider TEXT NOT NULL,
  identifier TEXT UNIQUE,
  pix_code TEXT NOT NULL DEFAULT '',
  access_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','pago','expirado','cancelado','divergente','pago_tarde')),
  provider_status TEXT NOT NULL DEFAULT '',
  simulated INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  paid_at TEXT,
  last_check_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status, expires_at);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  affiliate_id INTEGER NOT NULL REFERENCES affiliates(id),
  gross REAL NOT NULL,
  fee REAL NOT NULL,
  net REAL NOT NULL,
  pix_key_type TEXT NOT NULL,
  pix_key TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado','pago','recusado')),
  simulated INTEGER NOT NULL DEFAULT 0,
  deadline_at TEXT NOT NULL,
  paid_at TEXT,
  payment_ref TEXT NOT NULL DEFAULT '',
  proof_url TEXT NOT NULL DEFAULT '',
  refused_reason TEXT NOT NULL DEFAULT '',
  handled_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_aff ON withdrawals(affiliate_id, status);
`

function addColumn(table: string, col: string, def: string) {
  const cols = db.query(`PRAGMA table_info(${table})`).all() as any[]
  if (!cols.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
}

export function migrate() {
  db.exec(SCHEMA)
  db.exec(SCHEMA_V2)
  addColumn('commissions', 'withdrawal_id', 'INTEGER REFERENCES withdrawals(id)')
  addColumn('affiliates', 'pix_key_type', "TEXT NOT NULL DEFAULT ''")
  addColumn('affiliates', 'pix_holder', "TEXT NOT NULL DEFAULT ''")
  addColumn('affiliates', 'pending', 'INTEGER NOT NULL DEFAULT 0') // 1 = cadastro pelo link aguardando aprovação
}

export const now = () => new Date().toISOString()

/** Executa fn numa transação IMMEDIATE (trava escrita) — evita atribuições concorrentes. */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn).immediate()
}

export const all = <T = any>(sql: string, ...params: any[]) => db.query(sql).all(...params) as T[]
export const get = <T = any>(sql: string, ...params: any[]) => (db.query(sql).get(...params) as T) ?? null
export const run = (sql: string, ...params: any[]) => db.query(sql).run(...params)

export const parseJSON = <T = any>(s: any, fallback: T): T => {
  if (s === null || s === undefined || s === '') return fallback
  try { return JSON.parse(s) } catch { return fallback }
}
